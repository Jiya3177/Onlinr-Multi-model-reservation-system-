CREATE DATABASE IF NOT EXISTS ors_db;
USE ors_db;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cities (
  city_id INT AUTO_INCREMENT PRIMARY KEY,
  city_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS flights (
  flight_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  source_city_id INT NOT NULL,
  destination_city_id INT NOT NULL,
  travel_date DATE NOT NULL,
  depart_time TIME NOT NULL,
  arrive_time TIME NOT NULL,
  class_type VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  total_seats INT NOT NULL,
  available_seats INT NOT NULL,
  rating DECIMAL(2,1) DEFAULT 4.0,
  FOREIGN KEY (source_city_id) REFERENCES cities(city_id),
  FOREIGN KEY (destination_city_id) REFERENCES cities(city_id)
);

CREATE TABLE IF NOT EXISTS trains (
  train_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  source_city_id INT NOT NULL,
  destination_city_id INT NOT NULL,
  travel_date DATE NOT NULL,
  depart_time TIME NOT NULL,
  arrive_time TIME NOT NULL,
  class_type VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  total_seats INT NOT NULL,
  available_seats INT NOT NULL,
  rating DECIMAL(2,1) DEFAULT 4.0,
  FOREIGN KEY (source_city_id) REFERENCES cities(city_id),
  FOREIGN KEY (destination_city_id) REFERENCES cities(city_id)
);

CREATE TABLE IF NOT EXISTS buses (
  bus_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  source_city_id INT NOT NULL,
  destination_city_id INT NOT NULL,
  travel_date DATE NOT NULL,
  depart_time TIME NOT NULL,
  arrive_time TIME NOT NULL,
  class_type VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  total_seats INT NOT NULL,
  available_seats INT NOT NULL,
  rating DECIMAL(2,1) DEFAULT 4.0,
  FOREIGN KEY (source_city_id) REFERENCES cities(city_id),
  FOREIGN KEY (destination_city_id) REFERENCES cities(city_id)
);

CREATE TABLE IF NOT EXISTS hotels (
  hotel_id INT AUTO_INCREMENT PRIMARY KEY,
  hotel_name VARCHAR(120) NOT NULL,
  city_id INT NOT NULL,
  room_type VARCHAR(50) NOT NULL,
  amenities VARCHAR(255) NOT NULL,
  price_per_night DECIMAL(10,2) NOT NULL,
  total_rooms INT NOT NULL,
  available_rooms INT NOT NULL,
  rating DECIMAL(2,1) DEFAULT 4.0,
  FOREIGN KEY (city_id) REFERENCES cities(city_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id VARCHAR(40) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  booking_type ENUM('flight','train','bus','hotel') NOT NULL,
  reference_id INT NOT NULL,
  passenger_name VARCHAR(100) NOT NULL,
  passenger_email VARCHAR(100) NOT NULL,
  passenger_phone VARCHAR(15) NOT NULL,
  passenger_gender VARCHAR(12),
  units INT NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  travel_date DATE NOT NULL,
  booking_status ENUM('PENDING_PAYMENT','CONFIRMED','CANCELLED') DEFAULT 'PENDING_PAYMENT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('UPI','CARD','NET_BANKING') NOT NULL,
  transaction_ref VARCHAR(60) NOT NULL,
  payment_status ENUM('SUCCESS','FAILED','PENDING') DEFAULT 'SUCCESS',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);

CREATE TABLE IF NOT EXISTS refunds (
  refund_id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  refund_amount DECIMAL(10,2) NOT NULL,
  refund_status ENUM('PROCESSED','PENDING','FAILED') DEFAULT 'PROCESSED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(payment_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  booking_id INT NOT NULL,
  rating DECIMAL(2,1) NOT NULL,
  comments VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(255) NOT NULL,
  channel ENUM('email','sms') DEFAULT 'email',
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS offers (
  offer_id INT AUTO_INCREMENT PRIMARY KEY,
  offer_code VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL,
  valid_until DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS seats_rooms (
  seat_room_id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_type ENUM('flight','train','bus','hotel') NOT NULL,
  inventory_id INT NOT NULL,
  label VARCHAR(20) NOT NULL,
  status ENUM('AVAILABLE','BOOKED') DEFAULT 'AVAILABLE'
);

CREATE TABLE IF NOT EXISTS booking_seats (
  booking_seat_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  seat_label VARCHAR(20) NOT NULL,
  is_lady_reserved TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_booking_seat (booking_id, seat_label),
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
);
