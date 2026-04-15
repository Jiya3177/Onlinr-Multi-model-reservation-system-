const { listCities, listOffers } = require('../data/store');

async function renderHomePage(req, res) {
  const [cities, offers] = await Promise.all([listCities(), listOffers()]);
  res.render('pages/home', { cities, offers, error: null });
}

function renderAboutPage(req, res) {
  res.render('pages/about');
}

function renderContactPage(req, res) {
  res.render('pages/contact');
}

module.exports = { renderHomePage, renderAboutPage, renderContactPage };
