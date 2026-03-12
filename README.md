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
2. Run database setup files in `sql/`
3. Create `.env` file and update DB credentials
4. Install dependencies
5. Start server and open localhost

## Project Status
🚧 Work in Progress  
Frontend interface and booking workflow are implemented.  
Payment gateway integration and backend optimizations are under development.
