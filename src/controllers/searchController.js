const pool = require('../config/db');

const VALID_TYPES = new Set(['flight', 'train', 'bus', 'hotel']);
const TABLE_MAP = { flight: 'flights', train: 'trains', bus: 'buses' };

async function getCitySuggestions(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  const [rows] = await pool.query(
    'SELECT city_name FROM cities WHERE city_name LIKE ? ORDER BY city_name LIMIT 8',
    [`%${q}%`]
  );

  res.json(rows.map((r) => r.city_name));
}

async function runHotelSearch({ city, maxPrice, minRating, roomsNeeded, classType, allowAnyCity }) {
  const cityPattern = allowAnyCity ? '%' : `%${city}%`;

  let query = `
    SELECT h.*, c.city_name
    FROM hotels h
    JOIN cities c ON c.city_id = h.city_id
    WHERE c.city_name LIKE ?
      AND h.price_per_night <= ?
      AND h.rating >= ?
      AND h.available_rooms >= ?
  `;

  const params = [cityPattern, maxPrice, minRating, roomsNeeded];

  if (classType) {
    query += ' AND h.room_type LIKE ?';
    params.push(`%${classType}%`);
  }

  query += ' ORDER BY h.rating DESC, h.price_per_night ASC LIMIT 40';

  const [results] = await pool.query(query, params);
  return results;
}

async function runTransportSearch({
  table,
  src,
  dest,
  searchDate,
  maxPrice,
  minRating,
  peopleCount,
  classType,
  routeMode,
  dateMode
}) {
  let query = `
    SELECT t.*, s.city_name AS source_city, d.city_name AS destination_city,
           ABS(DATEDIFF(t.travel_date, ?)) AS date_diff
    FROM ${table} t
    JOIN cities s ON s.city_id = t.source_city_id
    JOIN cities d ON d.city_id = t.destination_city_id
    WHERE t.price <= ?
      AND t.rating >= ?
      AND t.available_seats >= ?
  `;

  const params = [searchDate, maxPrice, minRating, peopleCount];

  if (routeMode === 'exact') {
    query += ' AND s.city_name LIKE ? AND d.city_name LIKE ?';
    params.push(`%${src}%`, `%${dest}%`);
  } else if (routeMode === 'either') {
    query += ' AND (s.city_name LIKE ? OR d.city_name LIKE ?)';
    params.push(`%${src}%`, `%${dest}%`);
  }

  if (dateMode === 'tight') {
    query += ' AND t.travel_date BETWEEN ? AND DATE_ADD(?, INTERVAL 14 DAY)';
    params.push(searchDate, searchDate);
  } else if (dateMode === 'wide') {
    query += ' AND t.travel_date BETWEEN DATE_SUB(?, INTERVAL 30 DAY) AND DATE_ADD(?, INTERVAL 180 DAY)';
    params.push(searchDate, searchDate);
  } else if (dateMode === 'upcoming') {
    query += ' AND t.travel_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 365 DAY)';
  }

  if (classType) {
    query += ' AND t.class_type LIKE ?';
    params.push(`%${classType}%`);
  }

  query += ' ORDER BY date_diff ASC, t.price ASC, t.rating DESC LIMIT 50';

  const [results] = await pool.query(query, params);
  return results;
}

async function searchAll(req, res) {
  const { type, source, destination, date, maxPrice, classType, people, minRating } = req.body;

  if (!VALID_TYPES.has(type)) {
    return res.status(400).send('Invalid search type.');
  }

  const peopleCount = Math.max(1, Number(people) || 1);
  const maxPriceVal = Number(maxPrice) > 0 ? Number(maxPrice) : 100000;
  const minRatingVal = Number(minRating) >= 0 ? Number(minRating) : 0;
  const searchDate = date || new Date().toISOString().split('T')[0];

  let results = [];
  let searchMeta = {
    mode: 'strict',
    note: 'Showing best matches for your filters.'
  };

  if (type === 'hotel') {
    const city = (destination || '').trim();
    if (!city) return res.status(400).send('Please enter hotel city.');

    const roomsNeeded = Math.max(1, Math.ceil(peopleCount / 2));

    results = await runHotelSearch({
      city,
      maxPrice: maxPriceVal,
      minRating: minRatingVal,
      roomsNeeded,
      classType,
      allowAnyCity: false
    });

    if (!results.length) {
      results = await runHotelSearch({
        city,
        maxPrice: maxPriceVal * 2,
        minRating: 0,
        roomsNeeded,
        classType: '',
        allowAnyCity: false
      });

      if (results.length) {
        searchMeta = {
          mode: 'relaxed',
          note: 'No exact hotel matches found. Showing nearby price/rating alternatives in the same city.'
        };
      }
    }

    if (!results.length) {
      results = await runHotelSearch({
        city,
        maxPrice: maxPriceVal * 3,
        minRating: 0,
        roomsNeeded: 1,
        classType: '',
        allowAnyCity: true
      });

      if (results.length) {
        searchMeta = {
          mode: 'fallback',
          note: 'No hotels found for selected city. Showing top available hotels in other cities.'
        };
      }
    }

    if (!results.length) {
      const [[hotelCount]] = await pool.query('SELECT COUNT(*) AS total FROM hotels');
      searchMeta = hotelCount.total === 0
        ? { mode: 'no-inventory', note: 'No hotel inventory is configured yet. Add hotels from Admin panel.' }
        : { mode: 'no-match', note: 'No hotels matched even after fallback. Try another city or increase budget.' };
    }

    return res.render('search/results', { type, results, filters: req.body, searchMeta });
  }

  const src = (source || '').trim();
  const dest = (destination || '').trim();
  if (!src || !dest) return res.status(400).send('Please enter source and destination city.');

  const table = TABLE_MAP[type];

  results = await runTransportSearch({
    table,
    src,
    dest,
    searchDate,
    maxPrice: maxPriceVal,
    minRating: minRatingVal,
    peopleCount,
    classType,
    routeMode: 'exact',
    dateMode: 'tight'
  });

  if (!results.length) {
    results = await runTransportSearch({
      table,
      src,
      dest,
      searchDate,
      maxPrice: maxPriceVal * 2,
      minRating: Math.min(minRatingVal, 3),
      peopleCount,
      classType: '',
      routeMode: 'exact',
      dateMode: 'wide'
    });

    if (results.length) {
      searchMeta = {
        mode: 'relaxed',
        note: 'No exact date/class matches found. Showing closest dates and fare alternatives.'
      };
    }
  }

  if (!results.length) {
    results = await runTransportSearch({
      table,
      src,
      dest,
      searchDate,
      maxPrice: maxPriceVal * 3,
      minRating: 0,
      peopleCount: 1,
      classType: '',
      routeMode: 'either',
      dateMode: 'upcoming'
    });

    if (results.length) {
      searchMeta = {
        mode: 'route-fallback',
        note: 'No direct route found for your filters. Showing nearby route alternatives.'
      };
    }
  }

  if (!results.length) {
    results = await runTransportSearch({
      table,
      src,
      dest,
      searchDate,
      maxPrice: 999999,
      minRating: 0,
      peopleCount: 1,
      classType: '',
      routeMode: 'any',
      dateMode: 'any'
    });

    if (results.length) {
      searchMeta = {
        mode: 'global-fallback',
        note: 'No options found on your route. Showing top available options from all dates/routes.'
      };
    }
  }

  if (!results.length) {
    const [[tableCount]] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
    searchMeta = tableCount.total === 0
      ? { mode: 'no-inventory', note: `No ${type} inventory is configured yet. Add records from Admin panel.` }
      : { mode: 'no-match', note: 'No options matched even after fallback. Try different cities or broader budget.' };
  }

  res.render('search/results', { type, results, filters: req.body, searchMeta });
}

module.exports = { searchAll, getCitySuggestions };
