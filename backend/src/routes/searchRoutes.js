const express = require('express');
const { searchInventory, fetchCitySuggestions } = require('../controllers/searchController');
const { asyncHandler } = require('../utils/asyncHandler');
const { suggestionLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/suggestions', suggestionLimiter, asyncHandler(fetchCitySuggestions));
router.post('/', asyncHandler(searchInventory));

module.exports = router;
