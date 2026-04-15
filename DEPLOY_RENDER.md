# Render Deployment Guide

This project now uses MongoDB instead of MySQL, so deployment is simpler:
there is only one web service plus one managed MongoDB connection string.

## Project structure

The app is now organized as:

- `backend/` for server, routes, controllers, data access, models, middleware, and utilities
- `frontend/` for static assets and EJS views
- root files for deployment and package management

## 1. Create the database

Use MongoDB Atlas, Render Key Value + external Mongo, or any hosted MongoDB
provider that gives you a standard connection string.

Example:

`mongodb+srv://<user>:<password>@<cluster>/ors_db?retryWrites=true&w=majority`

## 2. Create the Render web service

- Runtime: `Node`
- Build command: `npm install --omit=dev`
- Start command: `npm run start:backend`
- Health check path: `/health`

You can also deploy directly with the included [`render.yaml`](/Users/chaudharyjiya/Desktop/untitled%20folder/multi-modal-reservation-system/render.yaml).

## 3. Configure environment variables

Required:

- `MONGODB_URI`
- `SESSION_SECRET`
- `APP_BASE_URL`

Recommended runtime config:

- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `SESSION_COOKIE_NAME=ors.sid`
- `SESSION_TTL_HOURS=8`
- `APP_TIMEZONE=Asia/Kolkata`

Recommended:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

Email / SMS integrations:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `MAIL_FROM`
- `FAST2SMS_API_KEY`
- `FAST2SMS_ROUTE`
- `FAST2SMS_LANGUAGE`

## 4. First boot behavior

On startup the app now:

1. connects to MongoDB using `MONGODB_URI`
2. seeds base cities, offers, demo accounts, and admin defaults when missing
3. backfills demo transport and hotel inventory when missing

No schema SQL import is required.

## 5. Local smoke test

```bash
npm install
npm run start:backend
```

Backend environment reference:

- `backend/.env.example`

The frontend is server-rendered from EJS and does not require a separate public env file.

Then open:

- `http://localhost:3000`
- `http://localhost:3000/health`

If `/health` returns `{ "ok": true, "database": "connected" }`, the app is ready.
