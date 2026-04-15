const bcrypt = require('bcryptjs');
const {
  User,
  City,
  Booking,
  Payment,
  Refund,
  Transaction,
  Notification,
  Wallet,
  SeatRoom,
  BookingSeat,
  BookingPassenger,
  createDocument,
  ensureWalletForUser,
  getWalletSummary,
  updateWalletBalance,
  findInventoryById,
  getInventoryModel
} = require('../data/store');
const {
  generateReservationId,
  generateTransactionRef,
  getInventoryConfig,
  getUnitLayoutConfig,
  generateUnitLabels,
  isLadyReservedSeat,
  isWindowSeat,
  isValidEmail,
  isValidPhone
} = require('../utils/helpers');
const { sendSms, isSmsConfigured } = require('../utils/smsService');
const { getLocalDateString } = require('../utils/dateTime');
const { sendApiError, sendApiSuccess } = require('../utils/http');

const VALID_PAYMENT_METHODS = new Set(['UPI', 'CARD', 'NET_BANKING']);
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);
const UPI_MERCHANT_NAME = 'ORS Reservation Hub';
const UPI_ID = 'reservation@okaxis';
const OTP_EXPIRY_MINUTES = 5;
const HOLD_EXPIRY_MINUTES = 15;
const MAX_PAYMENT_PASSWORD_ATTEMPTS = 3;

async function ensureBookingSchema() {
  return true;
}

function getFormattedTimestamp(date = new Date()) {
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getAppBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function getTicketLinks(req, bookingId) {
  const baseUrl = getAppBaseUrl(req);
  return {
    historyUrl: `${baseUrl}/booking/history/${bookingId}`,
    printUrl: `${baseUrl}/booking/ticket/${bookingId}/print`
  };
}

async function ensureUnitInventory(type, inventoryId, totalUnits) {
  const labels = generateUnitLabels(type, totalUnits);
  const existingRows = await SeatRoom.find({
    inventory_type: type,
    inventory_id: Number(inventoryId)
  }).select('label').lean();

  const existingLabels = new Set(existingRows.map((row) => row.label));

  for (const label of labels) {
    if (existingLabels.has(label)) continue;
    await createDocument(SeatRoom, 'seat_room', {
      inventory_type: type,
      inventory_id: Number(inventoryId),
      label,
      status: 'AVAILABLE',
      hold_booking_id: null,
      hold_expires_at: null
    });
  }

  return labels;
}

async function releaseExpiredHolds(type, inventoryId) {
  await SeatRoom.updateMany(
    {
      inventory_type: type,
      inventory_id: Number(inventoryId),
      hold_booking_id: { $ne: null },
      hold_expires_at: { $lt: new Date() }
    },
    {
      $set: {
        hold_booking_id: null,
        hold_expires_at: null
      }
    }
  );
}

async function clearSeatHold(bookingId) {
  await SeatRoom.updateMany(
    { hold_booking_id: Number(bookingId) },
    { $set: { hold_booking_id: null, hold_expires_at: null } }
  );
}

async function getBookingUnits(bookingId) {
  return BookingSeat.find({ booking_id: Number(bookingId) }).sort({ seat_label: 1 }).lean();
}

async function findBookingForUser(userId, bookingId) {
  return Booking.findOne({ booking_id: Number(bookingId), user_id: Number(userId) }).lean();
}

async function findLatestTransaction(bookingId, userId) {
  return Transaction.findOne({
    booking_id: Number(bookingId),
    user_id: Number(userId)
  }).sort({ transaction_id: -1 }).lean();
}

async function findPendingTransaction(bookingId, userId) {
  return Transaction.findOne({
    booking_id: Number(bookingId),
    user_id: Number(userId),
    status: { $in: ['INITIATED', 'OTP_PENDING'] }
  }).sort({ transaction_id: -1 }).lean();
}

async function expireStaleTransactions(bookingId, userId) {
  await Transaction.updateMany(
    {
      booking_id: Number(bookingId),
      user_id: Number(userId),
      status: { $in: ['INITIATED', 'OTP_PENDING'] },
      expires_at: { $lt: new Date() }
    },
    { $set: { status: 'EXPIRED' } }
  );
}

async function cancelPendingPaymentBooking(bookingId, userId) {
  await Booking.updateOne(
    { booking_id: Number(bookingId), user_id: Number(userId) },
    { $set: { booking_status: 'CANCELLED', payment_auth_attempts: 0 } }
  );
  await Transaction.updateMany(
    {
      booking_id: Number(bookingId),
      user_id: Number(userId),
      status: { $in: ['INITIATED', 'OTP_PENDING'] }
    },
    { $set: { status: 'FAILED' } }
  );
  await clearSeatHold(bookingId);
}

async function verifyPaymentPassword(booking, userId, password) {
  const submittedPassword = String(password || '');

  if (!submittedPassword) {
    return {
      ok: false,
      attemptsRemaining: MAX_PAYMENT_PASSWORD_ATTEMPTS - Number(booking.payment_auth_attempts || 0),
      message: 'Enter your login password to continue payment.'
    };
  }

  const user = await User.findOne({ user_id: Number(userId) }).lean();
  if (!user) {
    throw new Error('User account not found.');
  }

  const passwordMatches = await bcrypt.compare(submittedPassword, user.password_hash);
  if (passwordMatches) {
    if (Number(booking.payment_auth_attempts || 0) !== 0) {
      await Booking.updateOne({ booking_id: booking.booking_id }, { $set: { payment_auth_attempts: 0 } });
    }
    return { ok: true, attemptsRemaining: MAX_PAYMENT_PASSWORD_ATTEMPTS };
  }

  const nextAttempts = Number(booking.payment_auth_attempts || 0) + 1;
  if (nextAttempts >= MAX_PAYMENT_PASSWORD_ATTEMPTS) {
    await cancelPendingPaymentBooking(booking.booking_id, userId);
    return {
      ok: false,
      attemptsRemaining: 0,
      bookingCancelled: true,
      message: 'Incorrect password entered 3 times. Booking and payment were cancelled.'
    };
  }

  await Booking.updateOne({ booking_id: booking.booking_id }, { $set: { payment_auth_attempts: nextAttempts } });
  return {
    ok: false,
    attemptsRemaining: MAX_PAYMENT_PASSWORD_ATTEMPTS - nextAttempts,
    message: `Incorrect password. ${MAX_PAYMENT_PASSWORD_ATTEMPTS - nextAttempts} attempt(s) left.`
  };
}

async function getInventoryDetailsForBookings(bookings) {
  const referencesByType = {
    flight: new Set(),
    train: new Set(),
    bus: new Set(),
    hotel: new Set()
  };

  for (const booking of bookings) {
    referencesByType[booking.booking_type]?.add(booking.reference_id);
  }

  const [flights, trains, buses, hotels, cities] = await Promise.all([
    referencesByType.flight.size ? getInventoryModel('flight').find({ flight_id: { $in: [...referencesByType.flight] } }).lean() : [],
    referencesByType.train.size ? getInventoryModel('train').find({ train_id: { $in: [...referencesByType.train] } }).lean() : [],
    referencesByType.bus.size ? getInventoryModel('bus').find({ bus_id: { $in: [...referencesByType.bus] } }).lean() : [],
    referencesByType.hotel.size ? getInventoryModel('hotel').find({ hotel_id: { $in: [...referencesByType.hotel] } }).lean() : [],
    City.find({}).lean()
  ]);

  const cityMap = new Map(cities.map((city) => [city.city_id, city.city_name]));
  return {
    flight: new Map(flights.map((item) => [item.flight_id, item])),
    train: new Map(trains.map((item) => [item.train_id, item])),
    bus: new Map(buses.map((item) => [item.bus_id, item])),
    hotel: new Map(hotels.map((item) => [item.hotel_id, item])),
    cityMap
  };
}

function decorateBookingWithInventory(booking, inventoryMaps) {
  const inventory = inventoryMaps[booking.booking_type]?.get(booking.reference_id) || null;
  if (!inventory) {
    return {
      ...booking,
      route_label: booking.booking_type === 'hotel' ? 'Hotel Reservation' : 'Inventory unavailable'
    };
  }

  if (booking.booking_type === 'hotel') {
    return {
      ...booking,
      hotel_name: inventory.hotel_name,
      room_type: inventory.room_type,
      route_label: inventory.hotel_name,
      operator_name: inventory.hotel_name,
      inventory_code: inventory.room_type,
      depart_time: null
    };
  }

  const source = inventoryMaps.cityMap.get(inventory.source_city_id) || '';
  const destination = inventoryMaps.cityMap.get(inventory.destination_city_id) || '';

  return {
    ...booking,
    operator_name: inventory.operator_name,
    inventory_code: inventory.code,
    depart_time: inventory.depart_time,
    route_label: `${source} to ${destination}`
  };
}

async function getLatestPaymentsByBooking(bookingIds) {
  if (!bookingIds.length) return new Map();
  const payments = await Payment.find({ booking_id: { $in: bookingIds } }).sort({ payment_id: -1 }).lean();
  const map = new Map();
  for (const payment of payments) {
    if (!map.has(payment.booking_id)) {
      map.set(payment.booking_id, payment);
    }
  }
  return map;
}

async function getLatestTransactionsByBooking(bookingIds) {
  if (!bookingIds.length) return new Map();
  const transactions = await Transaction.find({ booking_id: { $in: bookingIds } }).sort({ transaction_id: -1 }).lean();
  const map = new Map();
  for (const transaction of transactions) {
    if (!map.has(transaction.booking_id)) {
      map.set(transaction.booking_id, transaction);
    }
  }
  return map;
}

async function getBookingHistoryRows(userId) {
  const bookings = await Booking.find({ user_id: Number(userId) }).sort({ created_at: -1 }).lean();
  const bookingIds = bookings.map((booking) => booking.booking_id);
  const [inventoryMaps, paymentMap, transactionMap] = await Promise.all([
    getInventoryDetailsForBookings(bookings),
    getLatestPaymentsByBooking(bookingIds),
    getLatestTransactionsByBooking(bookingIds)
  ]);

  return bookings.map((booking) => {
    const decorated = decorateBookingWithInventory(booking, inventoryMaps);
    const latestPayment = paymentMap.get(booking.booking_id);
    const latestTransaction = transactionMap.get(booking.booking_id);
    return {
      ...decorated,
      transaction_status: latestTransaction?.status || latestPayment?.payment_status || 'PENDING',
      transaction_ref: latestTransaction?.transaction_ref || latestPayment?.transaction_ref || null,
      verified_at: latestTransaction?.verified_at || null,
      payment_status: latestPayment?.payment_status || null
    };
  });
}

async function getBookingReceiptData(userId, bookingId) {
  const booking = await Booking.findOne({
    booking_id: Number(bookingId),
    user_id: Number(userId)
  }).lean();

  if (!booking) return null;

  const [inventoryMaps, latestPayment, latestTransaction] = await Promise.all([
    getInventoryDetailsForBookings([booking]),
    Payment.findOne({ booking_id: booking.booking_id }).sort({ payment_id: -1 }).lean(),
    Transaction.findOne({ booking_id: booking.booking_id }).sort({ transaction_id: -1 }).lean()
  ]);

  const decorated = decorateBookingWithInventory(booking, inventoryMaps);
  return {
    ...decorated,
    transaction_status: latestTransaction?.status || latestPayment?.payment_status || 'PENDING',
    transaction_ref: latestTransaction?.transaction_ref || latestPayment?.transaction_ref || null,
    verified_at: latestTransaction?.verified_at || null,
    upi_id: latestTransaction?.upi_id || UPI_ID,
    merchant_name: latestTransaction?.merchant_name || UPI_MERCHANT_NAME
  };
}

async function getBookingMessagingData(userId, bookingId) {
  const booking = await getBookingReceiptData(userId, bookingId);
  if (!booking) return null;
  const units = await getBookingUnits(bookingId);
  return {
    ...booking,
    unit_labels: units.map((unit) => unit.seat_label).join(', ')
  };
}

function getDisplayModelName(booking) {
  if (booking.booking_type === 'hotel') {
    return booking.hotel_name || 'Hotel Reservation';
  }

  const operator = booking.operator_name || 'ORS Transport';
  const code = booking.inventory_code ? ` ${booking.inventory_code}` : '';
  return `${operator}${code}`.trim();
}

async function sendPaymentLifecycleSms(req, booking, walletBalance) {
  if (!isSmsConfigured()) return;

  const links = getTicketLinks(req, booking.booking_id);
  const modelName = getDisplayModelName(booking);
  const unitTitle = booking.booking_type === 'hotel' ? 'Rooms' : 'Seats';
  const unitValue = booking.unit_labels || booking.units;
  const travelLabel = booking.booking_type === 'hotel'
    ? `${booking.travel_date}${booking.check_out_date ? ` to ${booking.check_out_date}` : ''}`
    : `${booking.travel_date} ${booking.depart_time || ''}`.trim();

  const confirmationMessage = [
    'ORS booking confirmed.',
    `ID: ${booking.reservation_id}`,
    `Model: ${modelName}`,
    `${unitTitle}: ${unitValue}`,
    `Date: ${travelLabel}`,
    `Amount: INR ${Number(booking.total_price).toFixed(2)}`
  ].join(' ');

  const ticketMessage = [
    'ORS e-ticket ready.',
    `Booking ID: ${booking.reservation_id}.`,
    `Open printable ticket: ${links.printUrl}`
  ].join(' ');

  const walletMessage = [
    `ORS payment complete for ${booking.reservation_id}.`,
    `Wallet balance: INR ${Number(walletBalance).toFixed(2)}.`,
    `Trip details: ${links.historyUrl}`
  ].join(' ');

  try {
    await sendSms(booking.passenger_phone, confirmationMessage);
    await sendSms(booking.passenger_phone, ticketMessage);
    await sendSms(booking.passenger_phone, walletMessage);
  } catch (smsError) {
    console.warn(`Booking SMS delivery failed for ${booking.reservation_id}: ${smsError.message}`);
  }
}

async function sendPendingBookingSms(req, booking) {
  if (!isSmsConfigured()) return;

  const links = getTicketLinks(req, booking.booking_id);
  const modelName = getDisplayModelName(booking);
  const unitTitle = booking.booking_type === 'hotel' ? 'Rooms' : 'Seats';
  const unitValue = booking.unit_labels || booking.units;
  const travelLabel = booking.booking_type === 'hotel'
    ? `${booking.travel_date}${booking.check_out_date ? ` to ${booking.check_out_date}` : ''}`
    : `${booking.travel_date} ${booking.depart_time || ''}`.trim();

  const pendingMessage = [
    'ORS booking pending payment.',
    `ID: ${booking.reservation_id}.`,
    `Model: ${modelName}.`,
    `${unitTitle}: ${unitValue}.`,
    `Date: ${travelLabel}.`,
    `Complete payment: ${links.historyUrl}`
  ].join(' ');

  try {
    await sendSms(booking.passenger_phone, pendingMessage);
  } catch (smsError) {
    console.warn(`Pending booking SMS delivery failed for ${booking.reservation_id}: ${smsError.message}`);
  }
}

async function sendCancellationSms(req, booking, refundAmount = null) {
  if (!isSmsConfigured()) return;

  const modelName = getDisplayModelName(booking);
  const refundText = refundAmount !== null ? ` Refund: INR ${Number(refundAmount).toFixed(2)}.` : '';
  const message = [
    'ORS cancellation confirmed.',
    `ID: ${booking.reservation_id}.`,
    `Model: ${modelName}.`,
    `Status: CANCELLED.${refundText}`
  ].join(' ');

  try {
    await sendSms(booking.passenger_phone, message);
  } catch (smsError) {
    console.warn(`Cancellation SMS delivery failed for ${booking.reservation_id}: ${smsError.message}`);
  }
}

async function renderUserDashboard(req, res) {
  await ensureBookingSchema();

  const userId = req.session.user.user_id;
  const [bookings, notifications, wallet] = await Promise.all([
    getBookingHistoryRows(userId),
    Notification.find({ user_id: Number(userId) }).sort({ notification_id: -1 }).limit(6).lean(),
    getWalletSummary(userId)
  ]);

  const today = getLocalDateString();
  const upcoming = bookings.filter((booking) => booking.travel_date && booking.travel_date >= today && booking.booking_status !== 'CANCELLED');
  const totalSpent = bookings
    .filter((booking) => booking.booking_status === 'CONFIRMED')
    .reduce((sum, booking) => sum + Number(booking.total_price), 0);

  res.render('user/dashboard', { bookings, upcoming, notifications, totalSpent, wallet });
}

async function fetchSeatMap(req, res) {
  await ensureBookingSchema();

  const { type, id } = req.params;
  if (!['flight', 'train', 'bus', 'hotel'].includes(type)) {
    return sendApiError(res, 400, 'Seat/room map not available for this type.');
  }

  const config = getInventoryConfig(type);
  const item = await findInventoryById(type, id);

  if (!item) {
    return sendApiError(res, 404, 'Inventory not found.');
  }

  const totalUnits = Number(item[config.totalCol]) || 0;
  const availableUnits = Number(item[config.availabilityCol]) || 0;

  await releaseExpiredHolds(type, id);
  const orderedLabels = await ensureUnitInventory(type, id, totalUnits);
  const unitRows = await SeatRoom.find({
    inventory_type: type,
    inventory_id: Number(id)
  }).lean();

  const now = new Date();
  const statusMap = new Map(unitRows.map((row) => {
    const isHeld = row.hold_booking_id && row.hold_expires_at && new Date(row.hold_expires_at) > now;
    return [row.label, isHeld ? 'BOOKED' : row.status];
  }));

  const units = orderedLabels.map((label) => ({
    label,
    status: statusMap.get(label) || 'AVAILABLE',
    isLadyReserved: isLadyReservedSeat(type, label),
    isWindow: isWindowSeat(type, label)
  }));

  return sendApiSuccess(res, {
    type,
    totalUnits,
    availableUnits,
    layout: getUnitLayoutConfig(type),
    units
  });
}

async function renderBookingPage(req, res) {
  await ensureBookingSchema();

  const { type, id } = req.params;
  const { people = 1, date = null, checkOut = null } = req.query;
  const item = await findInventoryById(type, id);

  if (!item) {
    return res.status(404).send('Option not found');
  }

  if (date && type !== 'hotel' && item.travel_date !== date) {
    return res.status(404).send('Option not found');
  }

  res.render('booking/booking-page', {
    item,
    type,
    people: Number(people) || 1,
    selectedDate: date,
    selectedCheckoutDate: checkOut,
    error: null
  });
}

async function createReservation(req, res) {
  await ensureBookingSchema();

  const userId = req.session.user.user_id;
  const {
    type,
    item_id,
    units,
    check_in_date,
    check_out_date,
    passenger_name,
    passenger_email,
    passenger_phone,
    passenger_gender,
    seat_labels
  } = req.body;

  const gender = String(passenger_gender || '').toUpperCase();
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
  const selectedCheckInDate = String(check_in_date || '').trim();
  const selectedCheckoutDate = String(check_out_date || '').trim();

  if (isTransport && !VALID_GENDERS.has(gender)) {
    req.flash('error', 'Please select passenger gender for seat reservation policy.');
    return res.redirect(`/booking/${type}/${item_id}`);
  }

  if (type === 'hotel' && !selectedCheckInDate) {
    req.flash('error', 'Please select a valid hotel check-in date.');
    return res.redirect('/');
  }

  if (type === 'hotel' && !selectedCheckoutDate) {
    req.flash('error', 'Please select a valid hotel check-out date.');
    return res.redirect('/');
  }

  let hotelNights = 1;
  if (type === 'hotel') {
    const checkInDate = new Date(`${selectedCheckInDate}T00:00:00`);
    const checkOutDate = new Date(`${selectedCheckoutDate}T00:00:00`);
    const today = new Date(`${getLocalDateString()}T00:00:00`);

    if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
      req.flash('error', 'Please select valid hotel stay dates.');
      return res.redirect('/');
    }

    if (checkInDate < today) {
      req.flash('error', 'Hotel check-in date cannot be in the past.');
      return res.redirect('/');
    }

    if (checkOutDate <= checkInDate) {
      req.flash('error', 'Check-out date must be after check-in date.');
      return res.redirect('/');
    }

    hotelNights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
  }

  const selectedLabels = String(seat_labels || '')
    .split(',')
    .map((label) => label.trim().toUpperCase())
    .filter(Boolean);

  if (!selectedLabels.length) {
    req.flash('error', type === 'hotel' ? 'Please select room(s) from map.' : 'Please select seat(s) from map.');
    return res.redirect(`/booking/${type}/${item_id}`);
  }

  const uniqueLabels = [...new Set(selectedLabels)];
  const quantity = uniqueLabels.length || Number(units) || 1;
  const item = await findInventoryById(type, item_id);

  if (!item) {
    req.flash('error', 'Selected inventory not found.');
    return res.redirect('/');
  }

  await releaseExpiredHolds(type, item_id);
  await ensureUnitInventory(type, item_id, Number(item[config.totalCol]));

  const unitRows = await SeatRoom.find({
    inventory_type: type,
    inventory_id: Number(item_id),
    label: { $in: uniqueLabels }
  }).lean();

  if (unitRows.length !== uniqueLabels.length) {
    req.flash('error', 'One or more selected units are invalid.');
    return res.redirect(`/booking/${type}/${item_id}`);
  }

  const conflictingUnit = unitRows.find((row) => {
    if (row.status === 'BOOKED') return true;
    if (!row.hold_booking_id || !row.hold_expires_at) return false;
    return new Date(row.hold_expires_at) > new Date();
  });

  if (conflictingUnit) {
    req.flash('error', type === 'hotel' ? 'Some selected rooms are already reserved.' : 'Some selected seats are already booked.');
    return res.redirect(`/booking/${type}/${item_id}`);
  }

  if (isTransport) {
    const ladyBlocked = uniqueLabels.find((label) => isLadyReservedSeat(type, label) && gender !== 'FEMALE');
    if (ladyBlocked) {
      req.flash('error', `${ladyBlocked} is ladies-reserved seat. Please choose another seat.`);
      return res.redirect(`/booking/${type}/${item_id}`);
    }
  }

  if (quantity < 1 || Number(item[config.availabilityCol]) < quantity) {
    req.flash('error', 'Selected seats/rooms are not available.');
    return res.redirect('/');
  }

  const total = Number(item[config.priceCol]) * quantity * (type === 'hotel' ? hotelNights : 1);
  const travelDate = type === 'hotel' ? selectedCheckInDate : item.travel_date;
  const booking = await createDocument(Booking, 'booking', {
    reservation_id: generateReservationId(),
    user_id: Number(userId),
    booking_type: type,
    reference_id: Number(item_id),
    passenger_name,
    passenger_email,
    passenger_phone,
    passenger_gender: gender || null,
    units: quantity,
    total_price: total,
    travel_date: travelDate,
    check_out_date: type === 'hotel' ? selectedCheckoutDate : null,
    booking_status: 'PENDING_PAYMENT',
    payment_auth_attempts: 0,
    created_at: new Date()
  });

  for (const [index, label] of uniqueLabels.entries()) {
    await createDocument(BookingSeat, 'booking_seat', {
      booking_id: booking.booking_id,
      seat_label: label,
      is_lady_reserved: isLadyReservedSeat(type, label),
      created_at: new Date()
    });

    await createDocument(BookingPassenger, 'booking_passenger', {
      booking_id: booking.booking_id,
      passenger_index: index + 1,
      unit_label: label,
      full_name: passenger_name.trim(),
      email: passenger_email.trim(),
      phone: passenger_phone.trim(),
      gender: gender || null,
      is_primary: index === 0,
      created_at: new Date()
    });
  }

  const holdUntil = new Date(Date.now() + HOLD_EXPIRY_MINUTES * 60 * 1000);
  await SeatRoom.updateMany(
    {
      inventory_type: type,
      inventory_id: Number(item_id),
      label: { $in: uniqueLabels }
    },
    {
      $set: {
        hold_booking_id: booking.booking_id,
        hold_expires_at: holdUntil
      }
    }
  );

  const bookingMessageData = await getBookingMessagingData(userId, booking.booking_id);
  if (bookingMessageData) {
    await sendPendingBookingSms(req, bookingMessageData);
  }

  req.flash('success', 'Booking created. Complete payment to confirm your ticket.');
  res.redirect(`/booking/payment/${booking.booking_id}`);
}

async function finalizeBookingPayment(booking, transactionRef, paymentMethod = 'UPI') {
  const config = getInventoryConfig(booking.booking_type);
  if (!config) {
    throw new Error('Inventory type mismatch.');
  }

  const Model = getInventoryModel(booking.booking_type);
  const item = await Model.findOne({ [config.id]: Number(booking.reference_id) }).lean();
  if (!item) {
    throw new Error('Inventory not available now.');
  }

  if (Number(item[config.availabilityCol]) < Number(booking.units)) {
    throw new Error('Seats/rooms sold out before payment. Please search again.');
  }

  await releaseExpiredHolds(booking.booking_type, booking.reference_id);
  await ensureUnitInventory(booking.booking_type, booking.reference_id, Number(item[config.totalCol]));

  const bookingSeatRows = await getBookingUnits(booking.booking_id);
  if (bookingSeatRows.length !== Number(booking.units)) {
    throw new Error('Seat/room mapping mismatch. Please rebook.');
  }

  const labels = bookingSeatRows.map((row) => row.seat_label);
  const unitRows = await SeatRoom.find({
    inventory_type: booking.booking_type,
    inventory_id: Number(booking.reference_id),
    label: { $in: labels }
  }).lean();

  if (
    unitRows.length !== labels.length ||
    unitRows.some((row) => row.status === 'BOOKED') ||
    unitRows.some((row) => row.hold_booking_id && Number(row.hold_booking_id) !== Number(booking.booking_id) && row.hold_expires_at && new Date(row.hold_expires_at) > new Date())
  ) {
    throw new Error('Some selected seats/rooms are already reserved. Please rebook.');
  }

  if (
    ['flight', 'train', 'bus'].includes(booking.booking_type) &&
    booking.passenger_gender !== 'FEMALE' &&
    bookingSeatRows.some((row) => Number(row.is_lady_reserved) === 1)
  ) {
    throw new Error('Ladies reserved seat policy violation. Please rebook with valid seats.');
  }

  const amount = Number(booking.total_price);

  if (paymentMethod === 'UPI') {
    const wallet = await ensureWalletForUser(booking.user_id);
    if (Number(wallet.balance) < amount) {
      throw new Error('Insufficient wallet balance for this UPI payment.');
    }
  }

  const updatedInventory = await Model.findOneAndUpdate(
    {
      [config.id]: Number(booking.reference_id),
      [config.availabilityCol]: { $gte: Number(booking.units) }
    },
    {
      $inc: { [config.availabilityCol]: -Number(booking.units) }
    },
    { new: true }
  ).lean();

  if (!updatedInventory) {
    throw new Error('Seats/rooms sold out before payment. Please search again.');
  }

  if (paymentMethod === 'UPI') {
    const wallet = await Wallet.findOneAndUpdate(
      {
        user_id: Number(booking.user_id),
        balance: { $gte: amount }
      },
      {
        $inc: { balance: -amount },
        $set: { updated_at: new Date() }
      },
      { new: true }
    ).lean();

    if (!wallet) {
      await Model.updateOne({ [config.id]: Number(booking.reference_id) }, { $inc: { [config.availabilityCol]: Number(booking.units) } });
      throw new Error('Insufficient wallet balance for this UPI payment.');
    }
  }

  await SeatRoom.updateMany(
    {
      inventory_type: booking.booking_type,
      inventory_id: Number(booking.reference_id),
      label: { $in: labels }
    },
    {
      $set: {
        status: 'BOOKED',
        hold_booking_id: null,
        hold_expires_at: null
      }
    }
  );

  await createDocument(Payment, 'payment', {
    booking_id: booking.booking_id,
    amount,
    payment_method: paymentMethod,
    transaction_ref: transactionRef,
    payment_status: 'SUCCESS',
    created_at: new Date()
  });

  await Booking.updateOne(
    { booking_id: booking.booking_id },
    { $set: { booking_status: 'CONFIRMED', payment_auth_attempts: 0 } }
  );

  await createDocument(Notification, 'notification', {
    user_id: booking.user_id,
    title: 'Booking Confirmed',
    message: `Your booking ${booking.reservation_id} is confirmed.`,
    channel: 'email',
    created_at: new Date()
  });
}

async function renderPaymentPage(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;
  const booking = await findBookingForUser(userId, bookingId);

  if (!booking) return res.status(404).send('Booking not found');

  if (booking.booking_status !== 'PENDING_PAYMENT') {
    req.flash('error', 'Payment is not pending for this booking.');
    return res.redirect('/dashboard');
  }

  const [bookingSeats, wallet] = await Promise.all([
    getBookingUnits(bookingId),
    getWalletSummary(userId)
  ]);

  res.render('booking/payment-page', {
    booking,
    bookingSeats,
    wallet,
    merchantName: UPI_MERCHANT_NAME,
    upiId: UPI_ID,
    otpExpiryMinutes: OTP_EXPIRY_MINUTES,
    error: null
  });
}

async function initiateUpiPayment(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.body.bookingId);
  const userId = req.session.user.user_id;

  if (!bookingId) {
    return sendApiError(res, 400, 'Booking ID is required.');
  }

  const booking = await findBookingForUser(userId, bookingId);
  if (!booking) {
    return sendApiError(res, 404, 'Booking not found.');
  }

  if (booking.booking_status !== 'PENDING_PAYMENT') {
    return sendApiError(res, 400, 'Booking payment is already completed.');
  }

  const wallet = await getWalletSummary(userId);
  await expireStaleTransactions(bookingId, userId);

  const transactionRef = generateTransactionRef();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await createDocument(Transaction, 'transaction', {
    booking_id: booking.booking_id,
    user_id: userId,
    amount: booking.total_price,
    merchant_name: UPI_MERCHANT_NAME,
    upi_id: UPI_ID,
    transaction_ref: transactionRef,
    otp_code_hash: '',
    otp_phone: booking.passenger_phone,
    status: 'INITIATED',
    expires_at: expiresAt,
    verified_at: null,
    created_at: new Date()
  });

  return sendApiSuccess(res, {
    bookingId: booking.booking_id,
    reservationId: booking.reservation_id,
    merchantName: UPI_MERCHANT_NAME,
    amount: Number(booking.total_price),
    upiId: UPI_ID,
    walletBalance: Number(wallet.balance),
    transactionRef,
    requiresOtp: false,
    otpPhone: booking.passenger_phone,
    expiresAt: expiresAt.toISOString(),
    qrPayload: `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=${Number(booking.total_price).toFixed(2)}&tn=${encodeURIComponent(booking.reservation_id)}&tr=${encodeURIComponent(transactionRef)}`
  });
}

async function confirmUpiPayment(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.body.bookingId);
  const loginPassword = req.body.loginPassword;
  const userId = req.session.user.user_id;

  if (!bookingId) {
    return sendApiError(res, 400, 'Booking ID is required.');
  }

  const booking = await findBookingForUser(userId, bookingId);
  if (!booking) {
    return sendApiError(res, 404, 'Booking not found.');
  }

  if (booking.booking_status !== 'PENDING_PAYMENT') {
    return sendApiError(res, 400, 'Booking payment is already completed.');
  }

  const passwordCheck = await verifyPaymentPassword(booking, userId, loginPassword);
  if (!passwordCheck.ok) {
    return sendApiError(res, passwordCheck.bookingCancelled ? 403 : 400, passwordCheck.message, {
      attemptsRemaining: passwordCheck.attemptsRemaining,
      bookingCancelled: Boolean(passwordCheck.bookingCancelled),
      redirectTo: passwordCheck.bookingCancelled ? '/dashboard' : null
    });
  }

  await expireStaleTransactions(bookingId, userId);
  const transaction = await findPendingTransaction(bookingId, userId);
  if (!transaction) {
    return sendApiError(res, 400, 'No active UPI transaction found. Start payment again.');
  }

  if (new Date(transaction.expires_at) <= new Date()) {
    await Transaction.updateOne({ transaction_id: transaction.transaction_id }, { $set: { status: 'EXPIRED' } });
    return sendApiError(res, 400, 'UPI session expired. Please restart the payment.');
  }

  try {
    await finalizeBookingPayment(booking, transaction.transaction_ref, 'UPI');
    await Transaction.updateOne(
      { transaction_id: transaction.transaction_id },
      { $set: { status: 'SUCCESS', verified_at: new Date() } }
    );

    const bookingMessageData = await getBookingMessagingData(userId, booking.booking_id);
    const wallet = await getWalletSummary(userId);
    if (bookingMessageData) {
      await sendPaymentLifecycleSms(req, bookingMessageData, wallet.balance);
    }

    return sendApiSuccess(res, {
      bookingId: booking.booking_id,
      reservationId: booking.reservation_id,
      amount: Number(booking.total_price),
      transactionRef: transaction.transaction_ref,
      paidAt: getFormattedTimestamp(),
      walletBalance: Number(wallet.balance)
    });
  } catch (err) {
    console.error('Confirm UPI payment error:', err);
    return sendApiError(res, 500, err.message || 'Could not complete payment.');
  }
}

async function verifyUpiOtp(req, res) {
  await ensureBookingSchema();
  return sendApiError(res, 400, 'OTP verification is disabled for payment.');
}

async function getWalletBalanceApi(req, res) {
  await ensureBookingSchema();

  const wallet = await getWalletSummary(req.session.user.user_id);
  return sendApiSuccess(res, { balance: Number(wallet.balance), updatedAt: wallet.updated_at });
}

async function getBookingHistoryApi(req, res) {
  await ensureBookingSchema();

  const bookings = await getBookingHistoryRows(req.session.user.user_id);
  return sendApiSuccess(res, { bookings });
}

async function getBookingReceiptApi(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const receipt = await getBookingReceiptData(req.session.user.user_id, bookingId);

  if (!receipt) {
    return sendApiError(res, 404, 'Booking receipt not found.');
  }

  const units = await getBookingUnits(bookingId);
  return sendApiSuccess(res, { receipt, units });
}

async function renderBookingHistoryPage(req, res) {
  await ensureBookingSchema();

  const userId = req.session.user.user_id;
  const [bookings, wallet] = await Promise.all([
    getBookingHistoryRows(userId),
    getWalletSummary(userId)
  ]);

  res.render('booking/history', { bookings, wallet });
}

async function renderBookingReceiptPage(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;
  const booking = await getBookingReceiptData(userId, bookingId);

  if (!booking) {
    return res.status(404).send('Booking receipt not found');
  }

  const units = await getBookingUnits(bookingId);
  res.render('booking/receipt', { booking, units });
}

async function confirmPayment(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;
  const { method, loginPassword } = req.body;

  if (!VALID_PAYMENT_METHODS.has(method)) {
    req.flash('error', 'Invalid payment method selected.');
    return res.redirect(`/booking/payment/${bookingId}`);
  }

  const booking = await findBookingForUser(userId, bookingId);
  if (!booking) {
    return res.status(404).send('Booking not found');
  }

  if (booking.booking_status !== 'PENDING_PAYMENT') {
    req.flash('error', 'This booking is already processed.');
    return res.redirect('/dashboard');
  }

  const passwordCheck = await verifyPaymentPassword(booking, userId, loginPassword);
  if (!passwordCheck.ok) {
    req.flash('error', passwordCheck.message);
    return res.redirect(passwordCheck.bookingCancelled ? '/dashboard' : `/booking/payment/${bookingId}`);
  }

  const transactionRef = generateTransactionRef();

  try {
    await finalizeBookingPayment(booking, transactionRef, method);

    const bookingMessageData = await getBookingMessagingData(userId, booking.booking_id);
    const wallet = await getWalletSummary(userId);
    if (bookingMessageData) {
      await sendPaymentLifecycleSms(req, bookingMessageData, wallet.balance);
    }

    req.flash('success', 'Payment successful and booking confirmed.');
    res.render('booking/payment-success', {
      bookingId,
      reservationId: booking.reservation_id,
      amount: booking.total_price,
      transactionRef,
      paidAt: getFormattedTimestamp()
    });
  } catch (err) {
    console.error('Payment error:', err);
    req.flash('error', err.message || 'Payment failed due to server issue. Try again.');
    res.redirect(`/booking/payment/${bookingId}`);
  }
}

async function cancelReservation(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;

  const booking = await findBookingForUser(userId, bookingId);
  if (!booking) {
    return res.status(404).send('Booking not found');
  }

  if (booking.booking_status === 'CANCELLED') {
    req.flash('error', 'Booking already cancelled.');
    return res.redirect('/dashboard');
  }

  let refundAmount = null;
  await Booking.updateOne({ booking_id: bookingId }, { $set: { booking_status: 'CANCELLED' } });
  await clearSeatHold(bookingId);

  if (booking.booking_status === 'CONFIRMED') {
    const config = getInventoryConfig(booking.booking_type);
    const Model = getInventoryModel(booking.booking_type);
    if (config && Model) {
      await Model.updateOne(
        { [config.id]: Number(booking.reference_id) },
        { $inc: { [config.availabilityCol]: Number(booking.units) } }
      );
    }

    const unitRows = await getBookingUnits(bookingId);
    if (unitRows.length) {
      const labels = unitRows.map((row) => row.seat_label);
      await SeatRoom.updateMany(
        {
          inventory_type: booking.booking_type,
          inventory_id: Number(booking.reference_id),
          label: { $in: labels }
        },
        { $set: { status: 'AVAILABLE', hold_booking_id: null, hold_expires_at: null } }
      );
    }
  }

  const payment = await Payment.findOne({
    booking_id: bookingId,
    payment_status: 'SUCCESS'
  }).sort({ payment_id: -1 }).lean();

  if (payment) {
    const refund = await Refund.findOne({ payment_id: payment.payment_id }).lean();
    if (!refund) {
      refundAmount = Number(payment.amount) * 0.9;
      await ensureWalletForUser(booking.user_id);
      if (payment.payment_method === 'UPI') {
        await updateWalletBalance(booking.user_id, refundAmount);
      }
      await createDocument(Refund, 'refund', {
        payment_id: payment.payment_id,
        refund_amount: refundAmount,
        refund_status: 'PROCESSED',
        created_at: new Date()
      });
    }
  }

  await createDocument(Notification, 'notification', {
    user_id: booking.user_id,
    title: 'Booking Cancelled',
    message: `Your booking ${booking.reservation_id} has been cancelled.`,
    channel: 'email',
    created_at: new Date()
  });

  const bookingMessageData = await getBookingMessagingData(userId, bookingId);
  if (bookingMessageData) {
    await sendCancellationSms(req, bookingMessageData, refundAmount);
  }

  req.flash('success', 'Booking cancelled successfully. Refund initiated where applicable.');
  res.redirect('/dashboard');
}

async function downloadReservationTicket(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;
  const booking = await getBookingReceiptData(userId, bookingId);

  if (!booking) return res.status(404).send('Ticket not found');

  if (booking.booking_status !== 'CONFIRMED') {
    req.flash('error', 'Only confirmed bookings can be downloaded as tickets.');
    return res.redirect('/dashboard');
  }

  const seatRows = await getBookingUnits(bookingId);
  const labels = seatRows.map((row) => row.seat_label).join(', ');
  const unitTitle = booking.booking_type === 'hotel' ? 'Rooms' : 'Seats';

  const text = [
    'ONLINE RESERVATION SYSTEM (ORS) - E-TICKET',
    `Reservation ID: ${booking.reservation_id}`,
    `Booking Type: ${booking.booking_type.toUpperCase()}`,
    `Passenger: ${booking.passenger_name}`,
    `Gender: ${booking.passenger_gender || 'N/A'}`,
    `Email: ${booking.passenger_email}`,
    `Phone: ${booking.passenger_phone}`,
    `${unitTitle}: ${labels || booking.units}`,
    `Travel Date: ${booking.travel_date}`,
    ...(booking.booking_type === 'hotel' && booking.check_out_date ? [`Check-out Date: ${booking.check_out_date}`] : []),
    `Total Paid: INR ${booking.total_price}`,
    `Transaction Ref: ${booking.transaction_ref || 'N/A'}`,
    `Booking Status: ${booking.booking_status}`
  ].join('\n');

  res.setHeader('Content-Disposition', `attachment; filename=ticket-${booking.reservation_id}.txt`);
  res.setHeader('Content-Type', 'text/plain');
  res.send(text);
}

async function renderPrintableTicketPage(req, res) {
  await ensureBookingSchema();

  const bookingId = Number(req.params.bookingId);
  const userId = req.session.user.user_id;
  const booking = await getBookingMessagingData(userId, bookingId);

  if (!booking) {
    return res.status(404).send('Ticket not found');
  }

  if (booking.booking_status !== 'CONFIRMED') {
    req.flash('error', 'Only confirmed bookings can be viewed as tickets.');
    return res.redirect('/dashboard');
  }

  const qrPayload = JSON.stringify({
    reservationId: booking.reservation_id,
    bookingType: booking.booking_type,
    model: getDisplayModelName(booking),
    route: booking.route_label,
    travelDate: booking.travel_date,
    units: booking.unit_labels || booking.units,
    transactionRef: booking.transaction_ref || 'N/A'
  });

  res.render('booking/print-ticket', {
    booking,
    qrPayload,
    modelName: getDisplayModelName(booking)
  });
}

module.exports = {
  renderUserDashboard,
  fetchSeatMap,
  renderBookingPage,
  createReservation,
  renderPaymentPage,
  initiateUpiPayment,
  confirmUpiPayment,
  verifyUpiOtp,
  getWalletBalanceApi,
  getBookingHistoryApi,
  getBookingReceiptApi,
  renderBookingHistoryPage,
  renderBookingReceiptPage,
  confirmPayment,
  cancelReservation,
  downloadReservationTicket,
  renderPrintableTicketPage
};
