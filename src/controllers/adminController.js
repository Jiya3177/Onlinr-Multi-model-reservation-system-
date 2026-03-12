const pool = require('../config/db');

const tableByType = {
  flight: { table: 'flights', id: 'flight_id', title: 'Flights' },
  train: { table: 'trains', id: 'train_id', title: 'Trains' },
  bus: { table: 'buses', id: 'bus_id', title: 'Buses' },
  hotel: { table: 'hotels', id: 'hotel_id', title: 'Hotels' }
};

async function getAdminDashboard(req, res) {
  const [[users]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
  const [[bookings]] = await pool.query('SELECT COUNT(*) AS total_bookings FROM bookings');
  const [[revenue]] = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM payments WHERE payment_status = 'SUCCESS'");
  const [bookingStats] = await pool.query('SELECT booking_type, COUNT(*) AS count FROM bookings GROUP BY booking_type');

  res.render('admin/dashboard', { users, bookings, revenue, bookingStats });
}

async function manageInventory(req, res) {
  const { type } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  const [items] = await pool.query(`SELECT * FROM ${config.table} ORDER BY ${config.id} DESC`);
  const [cities] = await pool.query('SELECT city_id, city_name FROM cities ORDER BY city_name');

  res.render('admin/manage-inventory', { type, config, items, cities, error: null });
}

async function addInventory(req, res) {
  const { type } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  try {
    if (type === 'hotel') {
      const { hotel_name, city_id, room_type, amenities, price_per_night, total_rooms, available_rooms, rating } = req.body;
      await pool.query(
        `INSERT INTO hotels (hotel_name, city_id, room_type, amenities, price_per_night, total_rooms, available_rooms, rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [hotel_name, city_id, room_type, amenities, price_per_night, total_rooms, available_rooms, rating || 4]
      );
    } else {
      const { code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating } = req.body;
      await pool.query(
        `INSERT INTO ${config.table} (code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating || 4]
      );
    }

    req.flash('success', `${config.title.slice(0, -1)} added successfully.`);
  } catch (err) {
    req.flash('error', `Error adding record: ${err.message}`);
  }

  res.redirect(`/admin/manage/${type}`);
}

async function getEditInventory(req, res) {
  const { type, id } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  const [rows] = await pool.query(`SELECT * FROM ${config.table} WHERE ${config.id} = ?`, [id]);
  if (!rows.length) return res.status(404).send('Record not found');

  const [cities] = await pool.query('SELECT city_id, city_name FROM cities ORDER BY city_name');
  res.render('admin/edit-inventory', { type, config, item: rows[0], cities });
}

async function updateInventory(req, res) {
  const { type, id } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  try {
    if (type === 'hotel') {
      const { hotel_name, city_id, room_type, amenities, price_per_night, total_rooms, available_rooms, rating } = req.body;
      await pool.query(
        `UPDATE hotels
         SET hotel_name = ?, city_id = ?, room_type = ?, amenities = ?, price_per_night = ?, total_rooms = ?, available_rooms = ?, rating = ?
         WHERE hotel_id = ?`,
        [hotel_name, city_id, room_type, amenities, price_per_night, total_rooms, available_rooms, rating, id]
      );
    } else {
      const { code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating } = req.body;
      await pool.query(
        `UPDATE ${config.table}
         SET code = ?, operator_name = ?, source_city_id = ?, destination_city_id = ?, travel_date = ?, depart_time = ?, arrive_time = ?,
             class_type = ?, price = ?, total_seats = ?, available_seats = ?, rating = ?
         WHERE ${config.id} = ?`,
        [code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating, id]
      );
    }

    req.flash('success', 'Record updated successfully.');
  } catch (err) {
    req.flash('error', `Error updating record: ${err.message}`);
  }

  res.redirect(`/admin/manage/${type}`);
}

async function deleteInventory(req, res) {
  const { type, id } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  try {
    await pool.query(`DELETE FROM ${config.table} WHERE ${config.id} = ?`, [id]);
    req.flash('success', 'Record deleted.');
  } catch (err) {
    req.flash('error', `Delete failed: ${err.message}`);
  }

  res.redirect(`/admin/manage/${type}`);
}

async function getUsers(req, res) {
  const [users] = await pool.query('SELECT user_id, full_name, email, phone, role, created_at FROM users ORDER BY user_id DESC');
  res.render('admin/users', { users });
}

async function deleteUser(req, res) {
  const userId = Number(req.params.id);

  try {
    await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
    req.flash('success', 'User deleted successfully.');
  } catch (err) {
    req.flash('error', 'Cannot delete user with existing booking records.');
  }

  res.redirect('/admin/users');
}

async function getBookings(req, res) {
  const [bookings] = await pool.query(
    `SELECT b.booking_id, b.reservation_id, b.booking_type, b.total_price, b.booking_status, b.travel_date, b.created_at,
            u.full_name, u.email,
            (SELECT p.payment_status FROM payments p WHERE p.booking_id = b.booking_id ORDER BY p.payment_id DESC LIMIT 1) AS payment_status
     FROM bookings b
     JOIN users u ON u.user_id = b.user_id
     ORDER BY b.booking_id DESC`
  );

  res.render('admin/bookings', { bookings });
}

async function getPayments(req, res) {
  const [payments] = await pool.query(
    `SELECT p.payment_id, p.booking_id, p.amount, p.payment_method, p.transaction_ref, p.payment_status, p.created_at,
            b.reservation_id, b.booking_type, u.full_name,
            r.refund_amount, r.refund_status
     FROM payments p
     JOIN bookings b ON b.booking_id = p.booking_id
     JOIN users u ON u.user_id = b.user_id
     LEFT JOIN refunds r ON r.payment_id = p.payment_id
     ORDER BY p.payment_id DESC`
  );

  res.render('admin/payments', { payments });
}

module.exports = {
  getAdminDashboard,
  manageInventory,
  addInventory,
  getEditInventory,
  updateInventory,
  deleteInventory,
  getUsers,
  deleteUser,
  getBookings,
  getPayments
};
