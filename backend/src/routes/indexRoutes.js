const express = require('express');
const { renderHomePage, renderAboutPage, renderContactPage } = require('../controllers/pageController');
const { requireUser } = require('../middleware/auth');
const { renderUserDashboard } = require('../controllers/bookingController');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(renderHomePage));
router.get('/about', renderAboutPage);
router.get('/contact', renderContactPage);
router.get('/dashboard', requireUser, asyncHandler(renderUserDashboard));

module.exports = router;
