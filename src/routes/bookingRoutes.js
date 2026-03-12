const express = require('express');
const {
  getDashboard,
  getSeatMap,
  getBookingPage,
  createBooking,
  getPaymentPage,
  processPayment,
  cancelBooking,
  downloadTicket
} = require('../controllers/bookingController');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.get('/seatmap/:type/:id', requireUser, getSeatMap);
router.get('/:type/:id', requireUser, getBookingPage);
router.post('/create', requireUser, createBooking);
router.get('/payment/:bookingId', requireUser, getPaymentPage);
router.post('/payment/:bookingId', requireUser, processPayment);
router.post('/cancel/:bookingId', requireUser, cancelBooking);
router.get('/ticket/:bookingId', requireUser, downloadTicket);

module.exports = router;
