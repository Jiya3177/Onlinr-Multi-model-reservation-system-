const {
  User,
  City,
  Flight,
  Train,
  Bus,
  Hotel,
  Booking,
  Payment,
  Refund,
  Wallet,
  createDocument,
  getInventoryModel,
  getInventoryIdField,
  ensureWalletForUser,
  updateWalletBalance
} = require('../data/store');
const { getLocalDateString } = require('../utils/dateTime');

const tableByType = {
  flight: { Model: Flight, id: 'flight_id', title: 'Flights' },
  train: { Model: Train, id: 'train_id', title: 'Trains' },
  bus: { Model: Bus, id: 'bus_id', title: 'Buses' },
  hotel: { Model: Hotel, id: 'hotel_id', title: 'Hotels' }
};

function normalizeText(value) {
  return String(value || '').trim();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateTransportInventory(body) {
  const code = normalizeText(body.code);
  const operatorName = normalizeText(body.operator_name);
  const classType = normalizeText(body.class_type);
  const sourceCityId = Number(body.source_city_id);
  const destinationCityId = Number(body.destination_city_id);
  const travelDate = normalizeText(body.travel_date);
  const departTime = normalizeText(body.depart_time);
  const arriveTime = normalizeText(body.arrive_time);
  const price = toNumber(body.price);
  const totalSeats = toNumber(body.total_seats);
  const availableSeats = toNumber(body.available_seats);
  const rating = body.rating === '' || body.rating == null ? 4 : toNumber(body.rating);

  if (!code || !operatorName || !classType || !travelDate || !departTime || !arriveTime) {
    return { error: 'All transport fields are required.' };
  }

  if (!Number.isInteger(sourceCityId) || !Number.isInteger(destinationCityId) || sourceCityId <= 0 || destinationCityId <= 0) {
    return { error: 'Please select valid source and destination cities.' };
  }

  if (sourceCityId === destinationCityId) {
    return { error: 'Source and destination cannot be the same.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate) || travelDate < getLocalDateString()) {
    return { error: 'Travel date must be today or a future date.' };
  }

  if (!/^\d{2}:\d{2}$/.test(departTime) || !/^\d{2}:\d{2}$/.test(arriveTime)) {
    return { error: 'Enter valid departure and arrival times.' };
  }

  if (price == null || price <= 0 || totalSeats == null || totalSeats < 1 || availableSeats == null || availableSeats < 0) {
    return { error: 'Price and seat counts must be valid positive numbers.' };
  }

  if (availableSeats > totalSeats) {
    return { error: 'Available seats cannot exceed total seats.' };
  }

  if (rating == null || rating < 0 || rating > 5) {
    return { error: 'Rating must be between 0 and 5.' };
  }

  return {
    value: {
      code,
      operator_name: operatorName,
      source_city_id: sourceCityId,
      destination_city_id: destinationCityId,
      travel_date: travelDate,
      depart_time: departTime,
      arrive_time: arriveTime,
      class_type: classType,
      price,
      total_seats: totalSeats,
      available_seats: availableSeats,
      rating
    }
  };
}

function validateHotelInventory(body) {
  const hotelName = normalizeText(body.hotel_name);
  const roomType = normalizeText(body.room_type);
  const amenities = normalizeText(body.amenities);
  const cityId = Number(body.city_id);
  const pricePerNight = toNumber(body.price_per_night);
  const totalRooms = toNumber(body.total_rooms);
  const availableRooms = toNumber(body.available_rooms);
  const rating = body.rating === '' || body.rating == null ? 4 : toNumber(body.rating);

  if (!hotelName || !roomType || !amenities) {
    return { error: 'Hotel name, room type, and amenities are required.' };
  }

  if (!Number.isInteger(cityId) || cityId <= 0) {
    return { error: 'Please select a valid hotel city.' };
  }

  if (pricePerNight == null || pricePerNight <= 0 || totalRooms == null || totalRooms < 1 || availableRooms == null || availableRooms < 0) {
    return { error: 'Price and room counts must be valid positive numbers.' };
  }

  if (availableRooms > totalRooms) {
    return { error: 'Available rooms cannot exceed total rooms.' };
  }

  if (rating == null || rating < 0 || rating > 5) {
    return { error: 'Rating must be between 0 and 5.' };
  }

  return {
    value: {
      hotel_name: hotelName,
      city_id: cityId,
      room_type: roomType,
      amenities,
      price_per_night: pricePerNight,
      total_rooms: totalRooms,
      available_rooms: availableRooms,
      rating
    }
  };
}

async function ensureWalletTable() {
  const users = await User.find({}).select('user_id').lean();
  for (const user of users) {
    await ensureWalletForUser(user.user_id);
  }
}

async function getAdminDashboard(req, res) {
  await ensureWalletTable();

  const [users, bookings, successfulPayments, wallets] = await Promise.all([
    User.countDocuments({}),
    Booking.countDocuments({}),
    Payment.find({ payment_status: 'SUCCESS' }).lean(),
    Wallet.find({}).lean()
  ]);

  const totalRevenue = successfulPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const totalWalletBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0);

  const bookingStatsRaw = await Booking.aggregate([
    { $group: { _id: '$booking_type', count: { $sum: 1 } } }
  ]);
  const bookingStats = bookingStatsRaw.map((item) => ({ booking_type: item._id, count: item.count }));

  res.render('admin/dashboard', {
    users: { total_users: users },
    bookings: { total_bookings: bookings },
    revenue: { total_revenue: totalRevenue },
    walletBalance: { total_wallet_balance: totalWalletBalance },
    bookingStats
  });
}

async function manageInventory(req, res) {
  const { type } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  const [items, cities] = await Promise.all([
    config.Model.find({}).sort({ [config.id]: -1 }).lean(),
    City.find({}).sort({ city_name: 1 }).lean()
  ]);

  res.render('admin/manage-inventory', { type, config, items, cities, error: null });
}

async function addInventory(req, res) {
  const { type } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  try {
    if (type === 'hotel') {
      const { error, value } = validateHotelInventory(req.body);
      if (error) throw new Error(error);
      await createDocument(config.Model, 'hotel', value);
    } else {
      const { error, value } = validateTransportInventory(req.body);
      if (error) throw new Error(error);
      await createDocument(config.Model, type, value);
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

  const [item, cities] = await Promise.all([
    config.Model.findOne({ [config.id]: Number(id) }).lean(),
    City.find({}).sort({ city_name: 1 }).lean()
  ]);

  if (!item) return res.status(404).send('Record not found');

  res.render('admin/edit-inventory', { type, config, item, cities });
}

async function updateInventory(req, res) {
  const { type, id } = req.params;
  const config = tableByType[type];
  if (!config) return res.status(400).send('Invalid type');

  try {
    if (type === 'hotel') {
      const { error, value } = validateHotelInventory(req.body);
      if (error) throw new Error(error);
      await config.Model.updateOne({ hotel_id: Number(id) }, { $set: value });
    } else {
      const { error, value } = validateTransportInventory(req.body);
      if (error) throw new Error(error);
      await config.Model.updateOne({ [config.id]: Number(id) }, { $set: value });
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
    await config.Model.deleteOne({ [config.id]: Number(id) });
    req.flash('success', 'Record deleted.');
  } catch (err) {
    req.flash('error', `Delete failed: ${err.message}`);
  }

  res.redirect(`/admin/manage/${type}`);
}

async function getUsers(req, res) {
  await ensureWalletTable();

  const [users, wallets, bookings, payments] = await Promise.all([
    User.find({}).sort({ user_id: -1 }).lean(),
    Wallet.find({}).lean(),
    Booking.find({}).lean(),
    Payment.find({ payment_status: 'SUCCESS' }).lean()
  ]);

  const walletMap = new Map(wallets.map((wallet) => [wallet.user_id, wallet]));
  const bookingsByUser = new Map();
  const spentByUser = new Map();
  const bookingMap = new Map(bookings.map((booking) => [booking.booking_id, booking]));

  for (const booking of bookings) {
    bookingsByUser.set(booking.user_id, (bookingsByUser.get(booking.user_id) || 0) + 1);
  }

  for (const payment of payments) {
    const booking = bookingMap.get(payment.booking_id);
    if (!booking) continue;
    spentByUser.set(booking.user_id, (spentByUser.get(booking.user_id) || 0) + Number(payment.amount));
  }

  const enrichedUsers = users.map((user) => ({
    ...user,
    wallet_balance: Number(walletMap.get(user.user_id)?.balance ?? 50000),
    booking_count: bookingsByUser.get(user.user_id) || 0,
    total_spent: spentByUser.get(user.user_id) || 0
  }));

  res.render('admin/users', { users: enrichedUsers });
}

async function getUserDetail(req, res) {
  await ensureWalletTable();

  const userId = Number(req.params.id);
  const [user, wallet, bookings, payments] = await Promise.all([
    User.findOne({ user_id: userId }).lean(),
    Wallet.findOne({ user_id: userId }).lean(),
    Booking.find({ user_id: userId }).sort({ booking_id: -1 }).lean(),
    Payment.find({}).sort({ payment_id: -1 }).lean()
  ]);

  if (!user) {
    return res.status(404).send('User not found');
  }

  const paymentByBooking = new Map();
  for (const payment of payments) {
    if (!paymentByBooking.has(payment.booking_id)) {
      paymentByBooking.set(payment.booking_id, payment);
    }
  }

  const detailedBookings = bookings.map((booking) => ({
    ...booking,
    payment_status: paymentByBooking.get(booking.booking_id)?.payment_status || 'PENDING',
    transaction_ref: paymentByBooking.get(booking.booking_id)?.transaction_ref || null
  }));

  const summary = {
    total_bookings: bookings.length,
    confirmed_value: bookings
      .filter((booking) => booking.booking_status === 'CONFIRMED')
      .reduce((sum, booking) => sum + Number(booking.total_price), 0)
  };

  res.render('admin/user-detail', {
    user: {
      ...user,
      wallet_balance: Number(wallet?.balance ?? 50000),
      wallet_updated_at: wallet?.updated_at || null
    },
    bookings: detailedBookings,
    summary
  });
}

async function addWalletFunds(req, res) {
  await ensureWalletTable();

  const userId = Number(req.params.id);
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    req.flash('error', 'Enter a valid wallet top-up amount.');
    return res.redirect(`/admin/users/${userId}`);
  }

  try {
    const wallet = await updateWalletBalance(userId, amount);

    if (!wallet) {
      req.flash('error', 'User wallet not found.');
      return res.redirect('/admin/users');
    }

    req.flash('success', `Wallet updated successfully. INR ${amount.toFixed(2)} added.`);
  } catch (err) {
    req.flash('error', `Wallet update failed: ${err.message}`);
  }

  res.redirect(`/admin/users/${userId}`);
}

async function deleteUser(req, res) {
  const userId = Number(req.params.id);

  try {
    await Promise.all([
      User.deleteOne({ user_id: userId }),
      Wallet.deleteOne({ user_id: userId })
    ]);
    req.flash('success', 'User deleted successfully.');
  } catch (err) {
    req.flash('error', 'Cannot delete user with existing booking records.');
  }

  res.redirect('/admin/users');
}

async function getBookings(req, res) {
  const [bookings, users, payments] = await Promise.all([
    Booking.find({}).sort({ booking_id: -1 }).lean(),
    User.find({}).lean(),
    Payment.find({}).sort({ payment_id: -1 }).lean()
  ]);

  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const paymentByBooking = new Map();
  for (const payment of payments) {
    if (!paymentByBooking.has(payment.booking_id)) {
      paymentByBooking.set(payment.booking_id, payment);
    }
  }

  res.render('admin/bookings', {
    bookings: bookings.map((booking) => ({
      ...booking,
      full_name: userMap.get(booking.user_id)?.full_name || 'Unknown User',
      email: userMap.get(booking.user_id)?.email || '',
      payment_status: paymentByBooking.get(booking.booking_id)?.payment_status || 'PENDING'
    }))
  });
}

async function getPayments(req, res) {
  const [payments, bookings, users, refunds] = await Promise.all([
    Payment.find({}).sort({ payment_id: -1 }).lean(),
    Booking.find({}).lean(),
    User.find({}).lean(),
    Refund.find({}).lean()
  ]);

  const bookingMap = new Map(bookings.map((booking) => [booking.booking_id, booking]));
  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const refundMap = new Map(refunds.map((refund) => [refund.payment_id, refund]));

  res.render('admin/payments', {
    payments: payments.map((payment) => {
      const booking = bookingMap.get(payment.booking_id);
      const user = booking ? userMap.get(booking.user_id) : null;
      const refund = refundMap.get(payment.payment_id);

      return {
        ...payment,
        reservation_id: booking?.reservation_id || null,
        booking_type: booking?.booking_type || null,
        full_name: user?.full_name || 'Unknown User',
        refund_amount: refund?.refund_amount ?? null,
        refund_status: refund?.refund_status ?? null
      };
    })
  });
}

module.exports = {
  getAdminDashboard,
  manageInventory,
  addInventory,
  getEditInventory,
  updateInventory,
  deleteInventory,
  getUsers,
  getUserDetail,
  addWalletFunds,
  deleteUser,
  getBookings,
  getPayments
};
