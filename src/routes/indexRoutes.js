const express = require('express');
const { getHome, getAbout, getContact } = require('../controllers/pageController');
const { requireUser } = require('../middleware/auth');
const { getDashboard } = require('../controllers/bookingController');

const router = express.Router();

router.get('/', getHome);
router.get('/about', getAbout);
router.get('/contact', getContact);
router.get('/dashboard', requireUser, getDashboard);

module.exports = router;
