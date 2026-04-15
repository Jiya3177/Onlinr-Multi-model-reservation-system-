const bcrypt = require('bcryptjs');

const {
  Counter,
  User,
  Admin,
  City,
  Flight,
  Train,
  Bus,
  Hotel,
  Booking,
  Payment,
  Refund,
  PasswordReset,
  Transaction,
  Notification,
  Offer,
  SeatRoom,
  BookingSeat,
  BookingPassenger,
  Wallet
} = require('../models');
const { getLocalDateString } = require('../utils/dateTime');

const inventoryModels = {
  flight: Flight,
  train: Train,
  bus: Bus,
  hotel: Hotel
};

const inventoryIdFields = {
  flight: 'flight_id',
  train: 'train_id',
  bus: 'bus_id',
  hotel: 'hotel_id'
};

async function getNextSequence(key) {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return counter.value;
}

async function createDocument(Model, counterKey, payload) {
  const id = await getNextSequence(counterKey);
  const fieldName = `${counterKey}_id`;
  const document = new Model({ [fieldName]: id, ...payload });
  await document.save();
  return document.toObject();
}

function getInventoryModel(type) {
  return inventoryModels[type] || null;
}

function getInventoryIdField(type) {
  return inventoryIdFields[type] || null;
}

async function findInventoryById(type, id) {
  const Model = getInventoryModel(type);
  const idField = getInventoryIdField(type);
  if (!Model || !idField) return null;
  return Model.findOne({ [idField]: Number(id) }).lean();
}

async function listCities() {
  return City.find({}).sort({ city_name: 1 }).lean();
}

async function listOffers() {
  return Offer.find({}).sort({ valid_until: -1 }).limit(4).lean();
}

async function findCityByName(cityName) {
  const normalized = String(cityName || '').trim().toLowerCase();
  if (!normalized) return null;

  return City.findOne({
    city_name: { $regex: new RegExp(`^${escapeRegExp(normalized)}$`, 'i') }
  }).lean();
}

async function searchCitiesByTerm(searchTerm) {
  const normalized = String(searchTerm || '').trim();
  if (!normalized) return [];

  return City.find({
    city_name: { $regex: escapeRegExp(normalized), $options: 'i' }
  }).sort({ city_name: 1 }).limit(8).lean();
}

async function ensureWalletForUser(userId) {
  let wallet = await Wallet.findOne({ user_id: Number(userId) }).lean();
  if (wallet) return wallet;

  wallet = await createDocument(Wallet, 'wallet', {
    user_id: Number(userId),
    balance: 50000,
    updated_at: new Date()
  });

  return wallet;
}

async function getWalletSummary(userId) {
  return ensureWalletForUser(userId);
}

async function updateWalletBalance(userId, balanceDelta) {
  await ensureWalletForUser(userId);
  const wallet = await Wallet.findOneAndUpdate(
    { user_id: Number(userId) },
    { $inc: { balance: Number(balanceDelta) }, $set: { updated_at: new Date() } },
    { new: true }
  ).lean();

  return wallet;
}

async function seedBaseData() {
  const cityNames = ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Jaipur'];

  for (const cityName of cityNames) {
    const existing = await City.findOne({ city_name: cityName }).lean();
    if (!existing) {
      await createDocument(City, 'city', { city_name: cityName });
    }
  }

  const offers = [
    { offer_code: 'WELCOME10', description: 'New user signup discount', discount_percent: 10, valid_until: getFutureDate(30) },
    { offer_code: 'HOTEL15', description: 'Hotel booking offer', discount_percent: 15, valid_until: getFutureDate(20) }
  ];

  for (const offer of offers) {
    const existing = await Offer.findOne({ offer_code: offer.offer_code }).lean();
    if (!existing) {
      await createDocument(Offer, 'offer', offer);
    }
  }

  const demoUserEmail = 'user@ors.com';
  if (!await User.findOne({ email: demoUserEmail }).lean()) {
    await createDocument(User, 'user', {
      full_name: 'Demo User',
      email: demoUserEmail,
      phone: '9876543210',
      password_hash: await bcrypt.hash('user123', 10),
      role: 'user',
      created_at: new Date()
    });
  }

  const demoAdminEmail = 'admin@ors.com';
  if (!await Admin.findOne({ email: demoAdminEmail }).lean()) {
    await createDocument(Admin, 'admin', {
      full_name: 'Main Admin',
      email: demoAdminEmail,
      password_hash: await bcrypt.hash('admin123', 10),
      created_at: new Date()
    });
  }
}

function getFutureDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateString(date);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  Counter,
  User,
  Admin,
  City,
  Flight,
  Train,
  Bus,
  Hotel,
  Booking,
  Payment,
  Refund,
  PasswordReset,
  Transaction,
  Notification,
  Offer,
  SeatRoom,
  BookingSeat,
  BookingPassenger,
  Wallet,
  getNextSequence,
  createDocument,
  getInventoryModel,
  getInventoryIdField,
  findInventoryById,
  listCities,
  listOffers,
  findCityByName,
  searchCitiesByTerm,
  ensureWalletForUser,
  getWalletSummary,
  updateWalletBalance,
  seedBaseData
};
