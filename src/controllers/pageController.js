const pool = require('../config/db');

async function getHome(req, res) {
  const [cities] = await pool.query('SELECT city_id, city_name FROM cities ORDER BY city_name');
  const [offers] = await pool.query('SELECT offer_code, description, discount_percent, valid_until FROM offers ORDER BY valid_until DESC LIMIT 4');
  res.render('pages/home', { cities, offers, error: null });
}

function getAbout(req, res) {
  res.render('pages/about');
}

function getContact(req, res) {
  res.render('pages/contact');
}

module.exports = { getHome, getAbout, getContact };
