const mongoose = require('mongoose');

const { Schema } = mongoose;

const baseOptions = {
  versionKey: false
};

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 }
}, baseOptions);

const userSchema = new Schema({
  user_id: { type: Number, required: true, unique: true, index: true },
  full_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, default: 'user' },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const adminSchema = new Schema({
  admin_id: { type: Number, required: true, unique: true, index: true },
  full_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const citySchema = new Schema({
  city_id: { type: Number, required: true, unique: true, index: true },
  city_name: { type: String, required: true, unique: true, trim: true }
}, baseOptions);

const transportInventoryFields = {
  code: { type: String, required: true, trim: true },
  operator_name: { type: String, required: true, trim: true },
  source_city_id: { type: Number, required: true, index: true },
  destination_city_id: { type: Number, required: true, index: true },
  travel_date: { type: String, required: true, index: true },
  depart_time: { type: String, required: true },
  arrive_time: { type: String, required: true },
  class_type: { type: String, required: true, trim: true },
  price: { type: Number, required: true },
  total_seats: { type: Number, required: true },
  available_seats: { type: Number, required: true },
  rating: { type: Number, default: 4 }
};

const flightSchema = new Schema({
  flight_id: { type: Number, required: true, unique: true, index: true },
  ...transportInventoryFields
}, baseOptions);

const trainSchema = new Schema({
  train_id: { type: Number, required: true, unique: true, index: true },
  ...transportInventoryFields
}, baseOptions);

const busSchema = new Schema({
  bus_id: { type: Number, required: true, unique: true, index: true },
  ...transportInventoryFields
}, baseOptions);

const hotelSchema = new Schema({
  hotel_id: { type: Number, required: true, unique: true, index: true },
  hotel_name: { type: String, required: true, trim: true },
  city_id: { type: Number, required: true, index: true },
  room_type: { type: String, required: true, trim: true },
  amenities: { type: String, required: true, trim: true },
  price_per_night: { type: Number, required: true },
  total_rooms: { type: Number, required: true },
  available_rooms: { type: Number, required: true },
  rating: { type: Number, default: 4 }
}, baseOptions);

const bookingSchema = new Schema({
  booking_id: { type: Number, required: true, unique: true, index: true },
  reservation_id: { type: String, required: true, unique: true, index: true },
  user_id: { type: Number, required: true, index: true },
  booking_type: { type: String, required: true, enum: ['flight', 'train', 'bus', 'hotel'], index: true },
  reference_id: { type: Number, required: true, index: true },
  passenger_name: { type: String, required: true, trim: true },
  passenger_email: { type: String, required: true, trim: true },
  passenger_phone: { type: String, required: true, trim: true },
  passenger_gender: { type: String, default: null },
  units: { type: Number, required: true },
  total_price: { type: Number, required: true },
  travel_date: { type: String, required: true, index: true },
  check_out_date: { type: String, default: null },
  booking_status: { type: String, enum: ['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED'], default: 'PENDING_PAYMENT' },
  payment_auth_attempts: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const paymentSchema = new Schema({
  payment_id: { type: Number, required: true, unique: true, index: true },
  booking_id: { type: Number, required: true, index: true },
  amount: { type: Number, required: true },
  payment_method: { type: String, required: true, enum: ['UPI', 'CARD', 'NET_BANKING'] },
  transaction_ref: { type: String, required: true, index: true },
  payment_status: { type: String, required: true, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'SUCCESS' },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const refundSchema = new Schema({
  refund_id: { type: Number, required: true, unique: true, index: true },
  payment_id: { type: Number, required: true, unique: true, index: true },
  refund_amount: { type: Number, required: true },
  refund_status: { type: String, required: true, enum: ['PROCESSED', 'PENDING', 'FAILED'], default: 'PROCESSED' },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const passwordResetSchema = new Schema({
  reset_id: { type: Number, required: true, unique: true, index: true },
  user_id: { type: Number, required: true, index: true },
  token_hash: { type: String, required: true, index: true },
  expires_at: { type: Date, required: true, index: true },
  used_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const transactionSchema = new Schema({
  transaction_id: { type: Number, required: true, unique: true, index: true },
  booking_id: { type: Number, required: true, index: true },
  user_id: { type: Number, required: true, index: true },
  amount: { type: Number, required: true },
  merchant_name: { type: String, required: true, trim: true },
  upi_id: { type: String, required: true, trim: true },
  transaction_ref: { type: String, required: true, unique: true, index: true },
  otp_code_hash: { type: String, required: true, default: '' },
  otp_phone: { type: String, required: true, default: '' },
  status: { type: String, enum: ['INITIATED', 'OTP_PENDING', 'SUCCESS', 'FAILED', 'EXPIRED'], default: 'INITIATED', index: true },
  expires_at: { type: Date, required: true },
  verified_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const reviewSchema = new Schema({
  review_id: { type: Number, required: true, unique: true, index: true },
  user_id: { type: Number, required: true, index: true },
  booking_id: { type: Number, required: true, index: true },
  rating: { type: Number, required: true },
  comments: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const notificationSchema = new Schema({
  notification_id: { type: Number, required: true, unique: true, index: true },
  user_id: { type: Number, required: true, index: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  channel: { type: String, enum: ['email', 'sms'], default: 'email' },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

const offerSchema = new Schema({
  offer_id: { type: Number, required: true, unique: true, index: true },
  offer_code: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true, trim: true },
  discount_percent: { type: Number, required: true },
  valid_until: { type: String, required: true }
}, baseOptions);

const seatRoomSchema = new Schema({
  seat_room_id: { type: Number, required: true, unique: true, index: true },
  inventory_type: { type: String, required: true, enum: ['flight', 'train', 'bus', 'hotel'], index: true },
  inventory_id: { type: Number, required: true, index: true },
  label: { type: String, required: true, trim: true },
  status: { type: String, enum: ['AVAILABLE', 'BOOKED'], default: 'AVAILABLE' },
  hold_booking_id: { type: Number, default: null },
  hold_expires_at: { type: Date, default: null }
}, baseOptions);

seatRoomSchema.index({ inventory_type: 1, inventory_id: 1, label: 1 }, { unique: true });

const bookingSeatSchema = new Schema({
  booking_seat_id: { type: Number, required: true, unique: true, index: true },
  booking_id: { type: Number, required: true, index: true },
  seat_label: { type: String, required: true, trim: true },
  is_lady_reserved: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

bookingSeatSchema.index({ booking_id: 1, seat_label: 1 }, { unique: true });

const bookingPassengerSchema = new Schema({
  booking_passenger_id: { type: Number, required: true, unique: true, index: true },
  booking_id: { type: Number, required: true, index: true },
  passenger_index: { type: Number, required: true },
  unit_label: { type: String, default: null },
  full_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  gender: { type: String, default: null },
  is_primary: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
}, baseOptions);

bookingPassengerSchema.index({ booking_id: 1, passenger_index: 1 }, { unique: true });

const walletSchema = new Schema({
  wallet_id: { type: Number, required: true, unique: true, index: true },
  user_id: { type: Number, required: true, unique: true, index: true },
  balance: { type: Number, required: true, default: 50000 },
  updated_at: { type: Date, default: Date.now }
}, baseOptions);

module.exports = {
  Counter: mongoose.models.Counter || mongoose.model('Counter', counterSchema),
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Admin: mongoose.models.Admin || mongoose.model('Admin', adminSchema),
  City: mongoose.models.City || mongoose.model('City', citySchema),
  Flight: mongoose.models.Flight || mongoose.model('Flight', flightSchema),
  Train: mongoose.models.Train || mongoose.model('Train', trainSchema),
  Bus: mongoose.models.Bus || mongoose.model('Bus', busSchema),
  Hotel: mongoose.models.Hotel || mongoose.model('Hotel', hotelSchema),
  Booking: mongoose.models.Booking || mongoose.model('Booking', bookingSchema),
  Payment: mongoose.models.Payment || mongoose.model('Payment', paymentSchema),
  Refund: mongoose.models.Refund || mongoose.model('Refund', refundSchema),
  PasswordReset: mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema),
  Transaction: mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema),
  Review: mongoose.models.Review || mongoose.model('Review', reviewSchema),
  Notification: mongoose.models.Notification || mongoose.model('Notification', notificationSchema),
  Offer: mongoose.models.Offer || mongoose.model('Offer', offerSchema),
  SeatRoom: mongoose.models.SeatRoom || mongoose.model('SeatRoom', seatRoomSchema),
  BookingSeat: mongoose.models.BookingSeat || mongoose.model('BookingSeat', bookingSeatSchema),
  BookingPassenger: mongoose.models.BookingPassenger || mongoose.model('BookingPassenger', bookingPassengerSchema),
  Wallet: mongoose.models.Wallet || mongoose.model('Wallet', walletSchema)
};
