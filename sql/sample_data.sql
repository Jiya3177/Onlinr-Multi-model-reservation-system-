USE ors_db;

INSERT IGNORE INTO cities (city_name) VALUES
('Delhi'),('Mumbai'),('Bengaluru'),('Kolkata'),('Chennai'),('Hyderabad'),('Pune'),('Jaipur');

-- Password hash for: admin123
INSERT IGNORE INTO admin (full_name, email, password_hash) VALUES
('Main Admin', 'admin@ors.com', '$2a$10$KsKf7rfYrSkpqxOFxNnW1eWV7xj4laP1epYUGNfrWYhA1w1I6Q0Fa');

-- Password hash for: user123
INSERT IGNORE INTO users (full_name, email, phone, password_hash, role) VALUES
('Demo User', 'user@ors.com', '9876543210', '$2a$10$8H9k6W0MOAzBfV9mQ9F6j.tP4djH0mL1J9FoV6XHuuoMBr2tXQvRm', 'user');

INSERT INTO flights (code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating) VALUES
('AI101', 'Air India', 1, 2, CURDATE() + INTERVAL 2 DAY, '08:00:00', '10:15:00', 'Economy', 5500, 180, 67, 4.4),
('6E202', 'IndiGo', 2, 3, CURDATE() + INTERVAL 2 DAY, '12:20:00', '14:40:00', 'Economy', 4900, 180, 95, 4.2);

INSERT INTO trains (code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating) VALUES
('12951', 'Rajdhani Express', 1, 2, CURDATE() + INTERVAL 3 DAY, '16:30:00', '08:20:00', '3AC', 2300, 800, 301, 4.5),
('12627', 'Karnataka Express', 3, 1, CURDATE() + INTERVAL 3 DAY, '19:15:00', '06:10:00', 'Sleeper', 900, 900, 420, 4.1);

INSERT INTO buses (code, operator_name, source_city_id, destination_city_id, travel_date, depart_time, arrive_time, class_type, price, total_seats, available_seats, rating) VALUES
('RB55', 'RedLine Travels', 1, 8, CURDATE() + INTERVAL 1 DAY, '22:00:00', '05:00:00', 'AC Sleeper', 1200, 40, 14, 4.3),
('GS88', 'GreenStar', 2, 7, CURDATE() + INTERVAL 1 DAY, '21:00:00', '06:30:00', 'Volvo AC', 1400, 36, 9, 4.2);

INSERT INTO hotels (hotel_name, city_id, room_type, amenities, price_per_night, total_rooms, available_rooms, rating) VALUES
('Rose Palace', 2, 'Deluxe', 'WiFi,Pool,Breakfast', 3200, 120, 32, 4.4),
('Skyline Inn', 3, 'Suite', 'WiFi,Gym,Airport Shuttle', 4100, 80, 18, 4.6),
('Comfort Stay', 1, 'Standard', 'WiFi,Breakfast', 2200, 150, 44, 4.1);

INSERT IGNORE INTO offers (offer_code, description, discount_percent, valid_until) VALUES
('WELCOME10', 'New user signup discount', 10, CURDATE() + INTERVAL 30 DAY),
('HOTEL15', 'Hotel booking offer', 15, CURDATE() + INTERVAL 20 DAY);
