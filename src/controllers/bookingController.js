const pool = require('../config/db');
const {
  generateReservationId,
  getInventoryConfig,
  getUnitLayoutConfig,
  generateUnitLabels,
  isLadyReservedSeat,
  isWindowSeat,
  isValidEmail,
  isValidPhone
} = require('../utils/helpers');

const VALID_PAYMENT_METHODS = new Set(['UPI', 'CARD', 'NET_BANKING']);
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);

let schemaReadyPromise = null;

async function ensureBookingSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS booking_seats (
          booking_seat_id INT AUTO_INCREMENT PRIMARY KEY,
          booking_id INT NOT NULL,
          seat_label VARCHAR(20) NOT NULL,
          is_lady_reserved TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_booking_seat (booking_id, seat_label),
          FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
        )
      `);

      const [genderCol] = await pool.query(`
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'bookings'
          AND COLUMN_NAME = 'passenger_gender'
      `);

      if (!genderCol[0].total) {
        await pool.query('ALTER TABLE bookings ADD COLUMN passenger_gender VARCHAR(12) NULL AFTER passenger_phone');
      }
    })();
  }

  return schemaReadyPromise;
}

async function ensureUnitInventory(connection, type, inventoryId, totalUnits) {
  const labels = generateUnitLabels(type, totalUnits);

  const [existingRows] = await connection.query(
    'SELECT label FROM seats_rooms WHERE inventory_type = ? AND inventory_id = ?',
    [type, inventoryId]
  );

  const existing = new Set(existingRows.map((row) => row.label));
  const missingLabels = labels.filter((label) => !existing.has(label));

  if (missingLabels.length) {
    const values = missingLabels.map((label) => [type, inventoryId, label, 'AVAILABLE']);
    await connection.query('INSERT INTO seats_rooms (inventory_type, inventory_id, label, status) VALUES ?', [values]);
  }

  return labels;
}

async function getDashboard(req, res) {
  await ensureBookingSchema();

  const userId = req.session.user.user_id;

  const [bookings] = await pool.query(
    `SELECT b.*,
            (SELECT p.payment_status
             FROM payments p
             WHERE p.booking_id = b.booking_id
             ORDER BY p.payment_id DESC
             LIMIT 1) AS payment_status
     FROM bookings b
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`,
    [userId]
  );

  const [notifications] = await pool.query(
    'SELECT title, message, channel, created_at FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 6',
    [userId]
  );

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter((b) => b.travel_date && b.travel_date >= today && b.booking_status !== 'CANCELLED');

  const totalSpent = bookings
    .filter((b) => b.booking_status === 'CONFIRMED')
    .reduce((sum, b) => sum + Number(b.total_price), 0);

  res.render('user/dashboard', { bookings, upcoming, notifications, totalSpent });
}

async function getSeatMap(req, res) {
  await ensureBookingSchema();

  const { type, id } = req.params;
  if (!['flight', 'train', 'bus', 'hotel'].includes(type)) {
    return res.status(400).json({ error: 'Seat/room map not available for this type.' });
  }

  const config = getInventoryConfig(type);
  const [inventoryRows] = await pool.query(
    `SELECT ${config.totalCol} AS total_units, ${config.availabilityCol} AS available_units
     FROM ${config.table}
     WHERE ${config.id} = ?`,
    [id]
  );

  if (!inventoryRows.length) {
    return res.status(404).json({ error: 'Inventory not found.' });
  }

  const totalUnits = Number(inventoryRows[0].total_units) || 0;
  const availableUnits = Number(inventoryRows[0].available_units) || 0;

  const connection = await pool.getConnection();
  try {
    const orderedLabels = await ensureUnitInventory(connection, type, id, totalUnits);

    const [unitRows] = await connection.query(
      'SELECT label, status FROM seats_rooms WHERE inventory_type = ? AND inventory_id = ?',
      [type, id]
    );

    const statusMap = new Map(unitRows.map((row) => [row.label, row.status]));

    const units = orderedLabels.map((label) => ({
      label,
      status: statusMap.get(label) || 'AVAILABLE',
      isLadyReserved: isLadyReservedSeat(type, label),
      isWindow: isWindowSeat(type, label)
    }));

    res.json({
      type,
      totalUnits,
      availableUnits,
      layout: getUnitLayoutConfig(type),
      units
    });
  } finally {
    connection.release();
  }
}

async function getBookingPage(req, res) {
  await ensureBookingSchema();

  const { type, id } = req.params;
  const { people = 1, date = null } = req.query;
  const config = getInventoryConfig(type);

  if (!config) {
    return res.status(400).send('Invalid booking type');
  }

  let query = `SELECT * FROM ${config.table} WHERE ${config.id} = ?`;
  const params = [id];

  if (date && type !== 'hotel') {
    query += ' AND travel_date = ?';
    params.push(date);
  }

  const [rows] = await pool.query(query, params);
  if (!rows.length) return res.status(404).send('Option not found');

  res.render('booking/booking-page', {
    item: rows[0],
    type,
    people: Number(people) || 1,
    error: null
  });
}

async function createBooking(req, res) {
  await ensureBookingSchema();

  const userId = req.session.user.user_id;
  const {
    type,
    item_id,
    units,
    passenger_name,
    passenger_email,
    passenger_phone,
    passenger_gender,
    seat_labels
  } = req.body;

  const gender = (passenger_gender || '').toUpperCase();
  const config = getInventoryConfig(type);

  if (!passenger_name || !isValidEmail(passenger_email) || !isValidPhone(passenger_phone)) {
    req.flash('error', 'Invalid passenger details.');
    return res.redirect('/dashboard');
  }

  if (!config) {
    req.flash('error', 'Invalid booking type.');
    return res.redirect('/');
  }

  const isTransport = ['flight', 'train', 'bus'].includes(type);
  if (isTransport && !VALID_GENDERS.has(gender)) {
    req.flash('error', 'Please select passenger gender for seat reservation policy.');
    return res.redirect(`/booking/${type}/${item_id}`);
  }

  const selectedLabels = (seat_labels || '')
    .split(',')
    .map((label) => label.trim().toUpperCase())
    .filter(Boolean);

  if (!selectedLabels.length) {
    req.flash('error', type === 'hotel' ? 'Please select room(s) from map.' : 'Please select seat(s) from map.');
    return res.redirect(`/booking/${type}/${item_id}`);
  }

  const uniqueLabels = [...new Set(selectedLabels)];
  const quantity = uniqueLabels.length || Number(units) || 1;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(`SELECT * FROM ${config.table} WHERE ${config.id} = ? FOR UPDATE`, [item_id]);
    if (!rows.length) {
      await connection.rollback();
      req.flash('error', 'Selected inventory not found.');
      return res.redirect('/');
    }

    const item = rows[0];
    await ensureUnitInventory(connection, type, item_id, Number(item[config.totalCol]));

    const [unitRows] = await connection.query(
      'SELECT label, status FROM seats_rooms WHERE inventory_type = ? AND inventory_id = ? AND label IN (?) FOR UPDATE',
      [type, item_id, uniqueLabels]
    );

    if (unitRows.length !== uniqueLabels.length) {
      await connection.rollback();
      req.flash('error', 'One or more selected units are invalid.');
      return res.redirect(`/booking/${type}/${item_id}`);
    }

    if (unitRows.some((row) => row.status === 'BOOKED')) {
      await connection.rollback();
      req.flash('error', type === 'hotel' ? 'Some selected rooms are already reserved.' : 'Some selected seats are already booked.');
      return res.redirect(`/booking/${type}/${item_id}`);
    }

    if (isTransport) {
      const ladyBlocked = uniqueLabels.find((label) => isLadyReservedSeat(type, label) && gender !== 'FEMALE');
      if (ladyBlocked) {
        await connection.rollback();
        req.flash('error', `${ladyBlocked} is ladies-reserved seat. Please choose another seat.`);
        return res.redirect(`/booking/${type}/${item_id}`);
      }
    }

    if (quantity < 1 || item[config.availabilityCol] < quantity) {
      await connection.rollback();
      req.flash('error', 'Selected seats/rooms are not available.');
      return res.redirect('/');
    }

    const total = Number(item[config.priceCol]) * quantity;
    const reservationId = generateReservationId();
    const travelDate = type === 'hotel' ? new Date().toISOString().split('T')[0] : item.travel_date;

    const [result] = await connection.query(
      `INSERT INTO bookings
      (reservation_id, user_id, booking_type, reference_id, passenger_name, passenger_email, passenger_phone, passenger_gender, units, total_price, travel_date, booking_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reservationId,
        userId,
        type,
        item_id,
        passenger_name,
        passenger_email,
        passenger_phone,
        gender || null,
        quantity,
        total,
        travelDate,
        'PENDING_PAYMENT'
      ]
    );

    const seatValues = uniqueLabels.map((label) => [result.insertId, label, isLadyReservedSeat(type, label) ? 1 : 0]);
    await connection.query('INSERT INTO booking_seats (booking_id, seat_label, is_lady_reserved) VALUES ?', [seatValues]);

    await connection.commit();

    req.flash('success', 'Booking created. Complete payment to confirm your ticket.');
    res.redirect(`/booking/payment/${result.insertId}`);
  } catch (err) {
    await connection.rollback();
    console.error('Create booking error:', err);
    req.flash('error', 'Could not create booking. Please try again.');
    res.redirect('/');
  } finally {
    connection.release();
  }
}

async function getPaymentPage(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;

  const [rows] = await pool.query(
    'SELECT * FROM bookings WHERE booking_id = ? AND user_id = ?',
    [bookingId, userId]
  );

  if (!rows.length) return res.status(404).send('Booking not found');

  const booking = rows[0];
  if (booking.booking_status !== 'PENDING_PAYMENT') {
    req.flash('error', 'Payment is not pending for this booking.');
    return res.redirect('/dashboard');
  }

  const [bookingSeats] = await pool.query(
    'SELECT seat_label, is_lady_reserved FROM booking_seats WHERE booking_id = ? ORDER BY seat_label',
    [bookingId]
  );

  res.render('booking/payment-page', { booking, bookingSeats, error: null });
}

async function processPayment(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;
  const { method } = req.body;

  if (!VALID_PAYMENT_METHODS.has(method)) {
    req.flash('error', 'Invalid payment method selected.');
    return res.redirect(`/booking/payment/${bookingId}`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [bookingRows] = await connection.query(
      'SELECT * FROM bookings WHERE booking_id = ? AND user_id = ? FOR UPDATE',
      [bookingId, userId]
    );

    if (!bookingRows.length) {
      await connection.rollback();
      return res.status(404).send('Booking not found');
    }

    const booking = bookingRows[0];

    if (booking.booking_status !== 'PENDING_PAYMENT') {
      await connection.rollback();
      req.flash('error', 'This booking is already processed.');
      return res.redirect('/dashboard');
    }

    const config = getInventoryConfig(booking.booking_type);
    if (!config) {
      await connection.rollback();
      req.flash('error', 'Inventory type mismatch.');
      return res.redirect('/dashboard');
    }

    const [inventoryRows] = await connection.query(
      `SELECT ${config.availabilityCol}, ${config.totalCol} FROM ${config.table} WHERE ${config.id} = ? FOR UPDATE`,
      [booking.reference_id]
    );

    if (!inventoryRows.length) {
      await connection.rollback();
      req.flash('error', 'Inventory not available now.');
      return res.redirect('/dashboard');
    }

    const currentAvailability = Number(inventoryRows[0][config.availabilityCol]);
    if (currentAvailability < booking.units) {
      await connection.rollback();
      req.flash('error', 'Seats/rooms sold out before payment. Please search again.');
      return res.redirect('/');
    }

    const [bookingSeatRows] = await connection.query(
      'SELECT seat_label, is_lady_reserved FROM booking_seats WHERE booking_id = ? ORDER BY seat_label',
      [booking.booking_id]
    );

    if (bookingSeatRows.length !== booking.units) {
      await connection.rollback();
      req.flash('error', 'Seat/room mapping mismatch. Please rebook.');
      return res.redirect('/dashboard');
    }

    await ensureUnitInventory(connection, booking.booking_type, booking.reference_id, Number(inventoryRows[0][config.totalCol]));

    const labels = bookingSeatRows.map((row) => row.seat_label);
    const [unitRows] = await connection.query(
      'SELECT label, status FROM seats_rooms WHERE inventory_type = ? AND inventory_id = ? AND label IN (?) FOR UPDATE',
      [booking.booking_type, booking.reference_id, labels]
    );

    if (unitRows.length !== labels.length || unitRows.some((row) => row.status === 'BOOKED')) {
      await connection.rollback();
      req.flash('error', 'Some selected seats/rooms are already reserved. Please rebook.');
      return res.redirect('/');
    }

    if (
      ['flight', 'train', 'bus'].includes(booking.booking_type) &&
      booking.passenger_gender !== 'FEMALE' &&
      bookingSeatRows.some((row) => Number(row.is_lady_reserved) === 1)
    ) {
      await connection.rollback();
      req.flash('error', 'Ladies reserved seat policy violation. Please rebook with valid seats.');
      return res.redirect('/');
    }

    await connection.query(
      'UPDATE seats_rooms SET status = ? WHERE inventory_type = ? AND inventory_id = ? AND label IN (?)',
      ['BOOKED', booking.booking_type, booking.reference_id, labels]
    );

    const txn = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await connection.query(
      'INSERT INTO payments (booking_id, amount, payment_method, transaction_ref, payment_status) VALUES (?, ?, ?, ?, ?)',
      [bookingId, booking.total_price, method, txn, 'SUCCESS']
    );

    await connection.query('UPDATE bookings SET booking_status = ? WHERE booking_id = ?', ['CONFIRMED', bookingId]);

    await connection.query(
      `UPDATE ${config.table} SET ${config.availabilityCol} = ${config.availabilityCol} - ? WHERE ${config.id} = ?`,
      [booking.units, booking.reference_id]
    );

    await connection.query(
      'INSERT INTO notifications (user_id, title, message, channel) VALUES (?, ?, ?, ?)',
      [booking.user_id, 'Booking Confirmed', `Your booking ${booking.reservation_id} is confirmed.`, 'email']
    );

    await connection.commit();

    req.flash('success', 'Payment successful and booking confirmed.');
    res.render('booking/payment-success', { bookingId, reservationId: booking.reservation_id });
  } catch (err) {
    await connection.rollback();
    console.error('Payment error:', err);
    req.flash('error', 'Payment failed due to server issue. Try again.');
    res.redirect(`/booking/payment/${bookingId}`);
  } finally {
    connection.release();
  }
}

async function cancelBooking(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT * FROM bookings WHERE booking_id = ? AND user_id = ? FOR UPDATE',
      [bookingId, userId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).send('Booking not found');
    }

    const booking = rows[0];

    if (booking.booking_status === 'CANCELLED') {
      await connection.rollback();
      req.flash('error', 'Booking already cancelled.');
      return res.redirect('/dashboard');
    }

    await connection.query('UPDATE bookings SET booking_status = ? WHERE booking_id = ?', ['CANCELLED', bookingId]);

    if (booking.booking_status === 'CONFIRMED') {
      const config = getInventoryConfig(booking.booking_type);
      if (config) {
        await connection.query(
          `UPDATE ${config.table} SET ${config.availabilityCol} = ${config.availabilityCol} + ? WHERE ${config.id} = ?`,
          [booking.units, booking.reference_id]
        );
      }

      const [unitRows] = await connection.query('SELECT seat_label FROM booking_seats WHERE booking_id = ?', [bookingId]);
      if (unitRows.length) {
        const labels = unitRows.map((row) => row.seat_label);
        await connection.query(
          'UPDATE seats_rooms SET status = ? WHERE inventory_type = ? AND inventory_id = ? AND label IN (?)',
          ['AVAILABLE', booking.booking_type, booking.reference_id, labels]
        );
      }
    }

    const [paymentRows] = await connection.query(
      "SELECT * FROM payments WHERE booking_id = ? AND payment_status = 'SUCCESS' ORDER BY payment_id DESC LIMIT 1",
      [bookingId]
    );

    if (paymentRows.length) {
      const payment = paymentRows[0];
      const [refundRows] = await connection.query('SELECT refund_id FROM refunds WHERE payment_id = ? LIMIT 1', [payment.payment_id]);

      if (!refundRows.length) {
        const refundAmount = Number(payment.amount) * 0.9;
        await connection.query(
          'INSERT INTO refunds (payment_id, refund_amount, refund_status) VALUES (?, ?, ?)',
          [payment.payment_id, refundAmount, 'PROCESSED']
        );
      }
    }

    await connection.query(
      'INSERT INTO notifications (user_id, title, message, channel) VALUES (?, ?, ?, ?)',
      [booking.user_id, 'Booking Cancelled', `Your booking ${booking.reservation_id} has been cancelled.`, 'email']
    );

    await connection.commit();

    req.flash('success', 'Booking cancelled successfully. Refund initiated where applicable.');
    res.redirect('/dashboard');
  } catch (err) {
    await connection.rollback();
    console.error('Cancellation error:', err);
    req.flash('error', 'Could not cancel booking at this time.');
    res.redirect('/dashboard');
  } finally {
    connection.release();
  }
}

async function downloadTicket(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;

  const [rows] = await pool.query(
    `SELECT b.*, 
            (SELECT p.transaction_ref FROM payments p WHERE p.booking_id = b.booking_id ORDER BY p.payment_id DESC LIMIT 1) AS transaction_ref
     FROM bookings b
     WHERE b.booking_id = ? AND b.user_id = ?`,
    [bookingId, userId]
  );

  if (!rows.length) return res.status(404).send('Ticket not found');

  const b = rows[0];

  if (b.booking_status !== 'CONFIRMED') {
    req.flash('error', 'Only confirmed bookings can be downloaded as tickets.');
    return res.redirect('/dashboard');
  }

  const [seatRows] = await pool.query('SELECT seat_label FROM booking_seats WHERE booking_id = ? ORDER BY seat_label', [bookingId]);
  const labels = seatRows.map((row) => row.seat_label).join(', ');
  const unitTitle = b.booking_type === 'hotel' ? 'Rooms' : 'Seats';

  const text = [
    'ONLINE RESERVATION SYSTEM (ORS) - E-TICKET',
    `Reservation ID: ${b.reservation_id}`,
    `Booking Type: ${b.booking_type.toUpperCase()}`,
    `Passenger: ${b.passenger_name}`,
    `Gender: ${b.passenger_gender || 'N/A'}`,
    `Email: ${b.passenger_email}`,
    `Phone: ${b.passenger_phone}`,
    `${unitTitle}: ${labels || b.units}`,
    `Travel Date: ${b.travel_date}`,
    `Total Paid: INR ${b.total_price}`,
    `Transaction Ref: ${b.transaction_ref || 'N/A'}`,
    `Booking Status: ${b.booking_status}`
  ].join('\n');

  res.setHeader('Content-Disposition', `attachment; filename=ticket-${b.reservation_id}.txt`);
  res.setHeader('Content-Type', 'text/plain');
  res.send(text);
}

module.exports = {
  getDashboard,
  getSeatMap,
  getBookingPage,
  createBooking,
  getPaymentPage,
  processPayment,
  cancelBooking,
  downloadTicket
};
