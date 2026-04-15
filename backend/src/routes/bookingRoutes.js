const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  fetchSeatMap,
  renderBookingPage,
  createReservation,
  renderPaymentPage,
  renderBookingHistoryPage,
  renderBookingReceiptPage,
  confirmPayment,
  cancelReservation,
  downloadReservationTicket,
  renderPrintableTicketPage
} = require('../controllers/bookingController');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.get('/seatmap/:type/:id', requireUser, asyncHandler(fetchSeatMap));
router.get('/history', requireUser, asyncHandler(renderBookingHistoryPage));
router.get('/history/:bookingId', requireUser, asyncHandler(renderBookingReceiptPage));
router.post('/create', requireUser, asyncHandler(createReservation));
router.get('/payment/:bookingId', requireUser, asyncHandler(renderPaymentPage));
router.post('/payment/:bookingId', requireUser, asyncHandler(confirmPayment));
router.post('/cancel/:bookingId', requireUser, asyncHandler(cancelReservation));
router.get('/ticket/:bookingId/print', requireUser, asyncHandler(renderPrintableTicketPage));
router.get('/ticket/:bookingId', requireUser, asyncHandler(downloadReservationTicket));
router.get('/:type/:id', requireUser, asyncHandler(renderBookingPage));

module.exports = router;
