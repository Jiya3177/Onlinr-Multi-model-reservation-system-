const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const dotenv = require('dotenv');
const pool = require('./config/db');
const { exposeSession } = require('./middleware/auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '../public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ors-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(exposeSession);

app.use('/', require('./routes/indexRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/search', require('./routes/searchRoutes'));
app.use('/booking', require('./routes/bookingRoutes'));
app.use('/admin', require('./routes/adminRoutes'));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, database: 'disconnected', error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).render('pages/contact');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Something went wrong. Please try again.');
});

app.listen(PORT, () => {
  console.log(`ORS running at http://localhost:${PORT}`);
});
