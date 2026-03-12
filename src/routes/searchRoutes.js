const express = require('express');
const { searchAll, getCitySuggestions } = require('../controllers/searchController');

const router = express.Router();

router.get('/suggestions', getCitySuggestions);
router.post('/', searchAll);

module.exports = router;
