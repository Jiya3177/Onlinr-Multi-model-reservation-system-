# Online Reservation System (ORS)

Full-stack Software Engineering project demo for combined Flight, Train, Bus, and Hotel booking.

## Tech Stack
- Frontend: HTML + CSS + JavaScript (EJS templates rendered by server)
- Backend: Node.js + Express (JavaScript)
- Database: MySQL

## Features Covered
- User registration/login/logout and forgot-password (demo)
- Unified smart search with filters and suggestions
- Booking flow with passenger details and reservation ID generation
- Dummy payment module (Card/UPI/Net Banking)
- Ticket download (.txt receipt)
- Booking cancellation with auto-refund logic simulation
- Admin panel for inventory, users, bookings, and revenue stats

## Folder Structure
- `src/server.js`: app entry point
- `src/config/`: DB connection
- `src/controllers/`: business logic
- `src/routes/`: route definitions
- `src/views/`: EJS pages (HTML templates)
- `public/css`, `public/js`: static assets
- `sql/schema.sql`: DB schema
- `sql/sample_data.sql`: sample records

## Setup Instructions
1. Install Node.js (v18+), npm, and MySQL.
2. Create database and tables:
   - Run `sql/schema.sql`
   - Run `sql/sample_data.sql`
3. Create `.env` from `.env.example` and update DB credentials.
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start server:
   ```bash
   npm run dev
   ```
6. Open `http://localhost:3000`

## Default Login (from sample data)
- User: `user@ors.com` / `user123`
- Admin: `admin@ors.com` / `admin123`

## Booking Flow Testing (End-to-End)
1. Login as user.
2. From Home, search for flight/train/bus/hotel using filters.
3. Open result and click **Book Now**.
4. Fill passenger details and proceed to payment.
5. Choose payment method and submit.
6. Verify status becomes `CONFIRMED` in dashboard.
7. Download ticket.
8. Cancel booking and verify cancellation + refund entry in database.

## Notes for Viva / Demo
- Real-time seat/room availability is simulated by dynamic `available_seats/available_rooms` updates.
- Payment gateway is a dummy UI; production requires gateway API integration.
- For 2000+ user scalability, apply indexing, caching, and horizontal scaling in deployment.
