const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { isValidEmail, isValidPhone } = require('../utils/helpers');

function getRegister(req, res) {
  res.render('auth/register', { error: null });
}

function getLogin(req, res) {
  res.render('auth/login', { error: null });
}

function getAdminLogin(req, res) {
  res.render('auth/admin-login', { error: null });
}

function getForgotPassword(req, res) {
  res.render('auth/forgot-password', { error: null, message: null });
}

async function register(req, res) {
  const { full_name, email, phone, password } = req.body;

  if (!full_name || !isValidEmail(email) || !isValidPhone(phone) || !password || password.length < 6) {
    return res.render('auth/register', { error: 'Enter valid details. Phone must be 10 digits and password at least 6 characters.' });
  }

  const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ? OR phone = ?', [email, phone]);
  if (existing.length) {
    return res.render('auth/register', { error: 'User already exists with same email or phone.' });
  }

  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [full_name, email, phone, hashed, 'user']
  );

  req.flash('success', 'Registration successful. Please login.');
  res.redirect('/auth/login');
}

async function login(req, res) {
  const { emailOrPhone, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR phone = ?', [emailOrPhone, emailOrPhone]);

  if (!rows.length) {
    return res.render('auth/login', { error: 'Invalid credentials.' });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.render('auth/login', { error: 'Invalid credentials.' });
  }

  req.session.user = {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role
  };

  req.flash('success', 'Welcome back.');
  res.redirect('/dashboard');
}

async function adminLogin(req, res) {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM admin WHERE email = ?', [email]);

  if (!rows.length) {
    return res.render('auth/admin-login', { error: 'Invalid admin credentials.' });
  }

  const admin = rows[0];
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    return res.render('auth/admin-login', { error: 'Invalid admin credentials.' });
  }

  req.session.admin = {
    admin_id: admin.admin_id,
    full_name: admin.full_name,
    email: admin.email
  };

  req.flash('success', 'Admin login successful.');
  res.redirect('/admin');
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!isValidEmail(email)) {
    return res.render('auth/forgot-password', { error: 'Enter valid email.', message: null });
  }

  const [rows] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
  if (!rows.length) {
    return res.render('auth/forgot-password', { error: 'No user found with this email.', message: null });
  }

  res.render('auth/forgot-password', {
    error: null,
    message: 'Password reset simulation complete. For production, integrate email OTP/token flow.'
  });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/');
  });
}

module.exports = {
  getRegister,
  getLogin,
  getAdminLogin,
  getForgotPassword,
  register,
  login,
  adminLogin,
  forgotPassword,
  logout
};
