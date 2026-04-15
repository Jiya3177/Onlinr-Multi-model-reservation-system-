const { City, Flight, Train, Bus, Hotel, findCityByName, searchCitiesByTerm } = require('../data/store');
const { getLocalDateString } = require('../utils/dateTime');

const VALID_TYPES = new Set(['flight', 'train', 'bus', 'hotel']);
const TRANSPORT_MODEL_BY_TYPE = { flight: Flight, train: Train, bus: Bus };

function buildSearchMeta(mode, note) {
  return { mode, note };
}

function toPlainLookup(rows, keyField) {
  return new Map(rows.map((row) => [row[keyField], row]));
}

function sortTransportResults(results, searchDate) {
  return results
    .map((result) => ({
      ...result,
      date_diff: Math.abs(new Date(`${result.travel_date}T00:00:00`) - new Date(`${searchDate}T00:00:00`)) / (1000 * 60 * 60 * 24)
    }))
    .sort((a, b) => a.date_diff - b.date_diff || a.price - b.price || b.rating - a.rating)
    .slice(0, 50);
}

async function attachTransportCities(results) {
  const cityIds = [...new Set(results.flatMap((result) => [result.source_city_id, result.destination_city_id]))];
  const cities = await City.find({ city_id: { $in: cityIds } }).lean();
  const cityMap = toPlainLookup(cities, 'city_id');

  return results.map((result) => ({
    ...result,
    source_city: cityMap.get(result.source_city_id)?.city_name || '',
    destination_city: cityMap.get(result.destination_city_id)?.city_name || ''
  }));
}

async function attachHotelCities(results) {
  const cityIds = [...new Set(results.map((result) => result.city_id))];
  const cities = await City.find({ city_id: { $in: cityIds } }).lean();
  const cityMap = toPlainLookup(cities, 'city_id');

  return results.map((result) => ({
    ...result,
    city_name: cityMap.get(result.city_id)?.city_name || ''
  }));
}

async function fetchCitySuggestions(req, res) {
  const rows = await searchCitiesByTerm(req.query.q || '');
  res.json(rows.map((row) => row.city_name));
}

async function findHotelResults({ cityId, maxPrice, minRating, roomsNeeded, classType }) {
  const query = {
    city_id: Number(cityId),
    price_per_night: { $lte: Number(maxPrice) },
    rating: { $gte: Number(minRating) },
    available_rooms: { $gte: Number(roomsNeeded) }
  };

  if (classType) {
    query.room_type = { $regex: classType, $options: 'i' };
  }

  const results = await Hotel.find(query).lean();
  return attachHotelCities(
    results
      .sort((a, b) => b.rating - a.rating || a.price_per_night - b.price_per_night)
      .slice(0, 40)
  );
}

async function findTransportResults({
  type,
  sourceCityId,
  destinationCityId,
  searchDate,
  maxPrice,
  minRating,
  peopleCount,
  classType,
  dateMode
}) {
  const Model = TRANSPORT_MODEL_BY_TYPE[type];
  if (!Model) return [];

  const baseQuery = {
    price: { $lte: Number(maxPrice) },
    rating: { $gte: Number(minRating) },
    available_seats: { $gte: Number(peopleCount) },
    source_city_id: Number(sourceCityId),
    destination_city_id: Number(destinationCityId)
  };

  if (classType) {
    baseQuery.class_type = { $regex: classType, $options: 'i' };
  }

  const results = await Model.find(baseQuery).lean();
  const filtered = results.filter((result) => {
    if (dateMode === 'tight') {
      return result.travel_date >= searchDate && result.travel_date <= addDays(searchDate, 14);
    }

    if (dateMode === 'wide') {
      return result.travel_date >= addDays(searchDate, -30) && result.travel_date <= addDays(searchDate, 180);
    }

    if (dateMode === 'upcoming') {
      const today = getLocalDateString();
      return result.travel_date >= today && result.travel_date <= addDays(today, 365);
    }

    return true;
  });

  const sorted = sortTransportResults(filtered, searchDate);
  return attachTransportCities(sorted);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

async function searchInventory(req, res) {
  const { type, source, destination, date, checkOutDate, maxPrice, classType, people, minRating } = req.body;
  const today = getLocalDateString();

  if (!VALID_TYPES.has(type)) {
    return res.status(400).send('Invalid search type.');
  }

  const peopleCount = Math.max(1, Number(people) || 1);
  const maxPriceVal = Number(maxPrice) > 0 ? Number(maxPrice) : 100000;
  const minRatingVal = Number(minRating) >= 0 ? Number(minRating) : 0;
  const searchDate = date || getLocalDateString();

  let results = [];
  let searchMeta = buildSearchMeta('strict', 'Showing best matches for your filters.');

  if (type === 'hotel') {
    const city = (destination || '').trim();
    if (!city) return res.status(400).send('Please enter hotel city.');
    if (!date || !checkOutDate) {
      return res.status(400).send('Please enter hotel check-in and check-out dates.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate)) {
      return res.status(400).send('Please enter valid hotel stay dates.');
    }
    if (date < today) {
      return res.status(400).send('Hotel check-in date cannot be in the past.');
    }

    const checkInDate = new Date(`${date}T00:00:00`);
    const checkOutDateValue = new Date(`${checkOutDate}T00:00:00`);
    if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDateValue.getTime()) || checkOutDateValue <= checkInDate) {
      return res.status(400).send('Hotel check-out date must be after check-in date.');
    }

    const hotelCity = await findCityByName(city);

    if (!hotelCity) {
      return res.render('search/results', {
        type,
        results: [],
        filters: req.body,
        searchMeta: buildSearchMeta('no-match', 'Selected city was not found. Please choose a valid city from the available destinations.')
      });
    }

    const roomsNeeded = Math.max(1, Math.ceil(peopleCount / 2));

    results = await findHotelResults({
      cityId: hotelCity.city_id,
      maxPrice: maxPriceVal,
      minRating: minRatingVal,
      roomsNeeded,
      classType
    });

    if (!results.length) {
      results = await findHotelResults({
        cityId: hotelCity.city_id,
        maxPrice: maxPriceVal * 2,
        minRating: 0,
        roomsNeeded,
        classType: ''
      });

      if (results.length) {
        searchMeta = buildSearchMeta('relaxed', 'No exact hotel matches found. Showing nearby price/rating alternatives in the same city.');
      }
    }

    if (!results.length) {
      const hotelCount = await Hotel.countDocuments({});
      searchMeta = hotelCount === 0
        ? buildSearchMeta('no-inventory', 'No hotel inventory is configured yet. Add hotels from Admin panel.')
        : buildSearchMeta('no-match', `No hotels are available for ${hotelCity.city_name} with the selected filters. Try another date, class, or budget.`);
    }

    return res.render('search/results', { type, results, filters: req.body, searchMeta });
  }

  const src = (source || '').trim();
  const dest = (destination || '').trim();
  if (!src || !dest) return res.status(400).send('Please enter source and destination city.');
  if (!date) return res.status(400).send('Please select a travel date.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).send('Please enter a valid travel date.');
  }
  if (date < today) {
    return res.status(400).send('Travel date cannot be in the past.');
  }
  if (src.toLowerCase() === dest.toLowerCase()) {
    return res.status(400).send('Source and destination city cannot be the same.');
  }
  const sourceCity = await findCityByName(src);
  const destinationCity = await findCityByName(dest);

  if (!sourceCity || !destinationCity) {
    return res.render('search/results', {
      type,
      results: [],
      filters: req.body,
      searchMeta: buildSearchMeta('no-match', 'Source or destination city was not found. Please select valid cities from the available destinations.')
    });
  }

  results = await findTransportResults({
    type,
    sourceCityId: sourceCity.city_id,
    destinationCityId: destinationCity.city_id,
    searchDate,
    maxPrice: maxPriceVal,
    minRating: minRatingVal,
    peopleCount,
    classType,
    dateMode: 'tight'
  });

  if (!results.length) {
    results = await findTransportResults({
      type,
      sourceCityId: sourceCity.city_id,
      destinationCityId: destinationCity.city_id,
      searchDate,
      maxPrice: maxPriceVal * 2,
      minRating: Math.min(minRatingVal, 3),
      peopleCount,
      classType: '',
      dateMode: 'wide'
    });

    if (results.length) {
      searchMeta = buildSearchMeta('relaxed', 'No exact date/class matches found. Showing closest dates and fare alternatives.');
    }
  }

  if (!results.length) {
    const Model = TRANSPORT_MODEL_BY_TYPE[type];
    const count = await Model.countDocuments({});
    searchMeta = count === 0
      ? buildSearchMeta('no-inventory', `No ${type} inventory is configured yet. Add records from Admin panel.`)
      : buildSearchMeta('no-match', `No ${type} service is available from ${sourceCity.city_name} to ${destinationCity.city_name} for the selected filters.`);
  }

  res.render('search/results', { type, results, filters: req.body, searchMeta });
}

module.exports = { searchInventory, fetchCitySuggestions };
