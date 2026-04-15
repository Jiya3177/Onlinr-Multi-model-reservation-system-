const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  User,
  Admin,
  PasswordReset,
  createDocument,
  ensureWalletForUser
} = require('../data/store');
const { isValidEmail, isValidPhone } = require('../utils/helpers');
const { sendPasswordResetCodeEmail } = require('../utils/mailService');

const SEEDED_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SEEDED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SEEDED_ADMIN_NAME = process.env.ADMIN_NAME || 'Main Admin';

async function ensureAdminAccount() {
  if (!SEEDED_ADMIN_EMAIL || !SEEDED_ADMIN_PASSWORD) return;

  const existingAdmin = await Admin.findOne({ email: SEEDED_ADMIN_EMAIL.toLowerCase() }).lean();
  if (existingAdmin) return;

  const passwordHash = await bcrypt.hash(SEEDED_ADMIN_PASSWORD, 12);
  await createDocument(Admin, 'admin', {
    full_name: SEEDED_ADMIN_NAME,
    email: SEEDED_ADMIN_EMAIL.toLowerCase(),
    password_hash: passwordHash,
    created_at: new Date()
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function renderRegisterPage(req, res) {
  res.render('auth/register', { error: null });
}

function renderLoginPage(req, res) {
  res.render('auth/login', { error: null });
}

function renderAdminLoginPage(req, res) {
  res.render('auth/admin-login', { error: null });
}

function renderForgotPasswordPage(req, res) {
  res.render('auth/forgot-password', { error: null, message: null });
}

function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function findValidVerificationCode(email, code) {
  if (!email || !code) return null;

  const user = await User.findOne({ email: String(email).trim().toLowerCase() }).lean();
  if (!user) return null;

  const tokenHash = hashVerificationCode(code);
  const resetRecord = await PasswordReset.findOne({
    user_id: user.user_id,
    token_hash: tokenHash,
    used_at: null,
    expires_at: { $gt: new Date() }
  }).sort({ reset_id: -1 }).lean();

  if (!resetRecord) return null;

  return {
    reset_id: resetRecord.reset_id,
    user_id: resetRecord.user_id,
    email: user.email
  };
}

async function renderResetPasswordPage(req, res) {
  const email = req.query.email || '';
  res.render('auth/reset-password', {
    error: null,
    message: null,
    email
  });
}

async function registerUser(req, res) {
  const full_name = String(req.body.full_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const password = String(req.body.password || '');

  if (!full_name) {
    return res.render('auth/register', { error: 'Enter your full name.' });
  }

  if (!isValidEmail(email)) {
    return res.render('auth/register', { error: 'Enter a valid email address.' });
  }

  if (!isValidPhone(phone)) {
    return res.render('auth/register', { error: 'Enter a valid 10-digit phone number.' });
  }

  if (!password || password.length < 6) {
    return res.render('auth/register', { error: 'Password must be at least 6 characters long.' });
  }

  const existingUsers = await User.find({
    $or: [
      { email },
      { phone }
    ]
  }).lean();

  if (existingUsers.length) {
    const matchedEmail = existingUsers.some((user) => user.email === email);
    const matchedPhone = existingUsers.some((user) => user.phone === phone);

    if (matchedEmail && matchedPhone) {
      return res.render('auth/register', { error: 'An account already exists with this email and phone number.' });
    }

    if (matchedEmail) {
      return res.render('auth/register', { error: 'An account already exists with this email address.' });
    }

    if (matchedPhone) {
      return res.render('auth/register', { error: 'An account already exists with this phone number.' });
    }

    return res.render('auth/register', { error: 'User already exists with the provided details.' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await createDocument(User, 'user', {
    full_name,
    email,
    phone,
    password_hash,
    role: 'user',
    created_at: new Date()
  });

  await ensureWalletForUser(user.user_id);

  req.flash('success', 'Registration successful. Please login.');
  res.redirect('/auth/login');
}

async function loginUser(req, res) {
  const { emailOrPhone, password } = req.body;
  const user = await User.findOne({
    $or: [
      { email: String(emailOrPhone || '').trim().toLowerCase() },
      { phone: String(emailOrPhone || '').trim() }
    ]
  }).lean();

  if (!user) {
    return res.render('auth/login', { error: 'Invalid credentials.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.render('auth/login', { error: 'Invalid credentials.' });
  }

  await regenerateSession(req);

  req.session.user = {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role
  };

  await ensureWalletForUser(user.user_id);

  req.flash('success', 'Welcome back.');
  res.redirect('/dashboard');
}

async function loginAdmin(req, res) {
  await ensureAdminAccount();

  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const admin = await Admin.findOne({ email }).lean();

  if (!admin) {
    return res.render('auth/admin-login', { error: 'Invalid admin credentials.' });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    return res.render('auth/admin-login', { error: 'Invalid admin credentials.' });
  }

  await regenerateSession(req);

  req.session.admin = {
    admin_id: admin.admin_id,
    full_name: admin.full_name,
    email: admin.email
  };

  req.flash('success', 'Admin login successful.');
  res.redirect('/admin');
}

async function handleForgotPassword(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const genericMessage = 'If the email is registered, password reset instructions will be shared through the configured recovery flow.';

  if (!isValidEmail(email)) {
    return res.render('auth/forgot-password', { error: 'Enter valid email.', message: null });
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    return res.render('auth/forgot-password', {
      error: null,
      message: genericMessage
    });
  }

  const verificationCode = crypto.randomInt(100000, 1000000).toString();
  const tokenHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await PasswordReset.updateMany(
    { user_id: user.user_id, used_at: null },
    { $set: { used_at: new Date() } }
  );

  await createDocument(PasswordReset, 'reset', {
    user_id: user.user_id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used_at: null,
    created_at: new Date()
  });

  let mailResult = { success: false };
  try {
    mailResult = await sendPasswordResetCodeEmail({
      to: user.email,
      fullName: user.full_name,
      verificationCode,
      expiresMinutes: 30
    });
  } catch (mailErr) {
    console.warn(`Password reset email delivery failed for ${user.email}: ${mailErr.message}`);
  }

  if (!mailResult.success) {
    return res.render('auth/forgot-password', {
      error: 'Verification email could not be sent. Please check SMTP/Gmail configuration and try again.',
      message: null
    });
  }

  return res.render('auth/reset-password', {
    error: null,
    message: 'A 6-digit verification code has been sent to your email.',
    email: user.email
  });
}

async function handleResetPassword(req, res) {
  const { email, verificationCode, password, confirmPassword } = req.body;

  if (!email || !verificationCode) {
    return res.status(400).render('auth/reset-password', {
      error: 'Email and Verification code are required.',
      message: null,
      email
    });
  }

  if (!isValidEmail(email) || !/^\d{6}$/.test(verificationCode)) {
    return res.status(400).render('auth/reset-password', {
      error: 'Enter a valid email and 6-digit verification code.',
      message: null,
      email
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).render('auth/reset-password', {
      error: 'Password must be at least 6 characters long.',
      message: null,
      email
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).render('auth/reset-password', {
      error: 'Password confirmation does not match.',
      message: null,
      email
    });
  }

  const resetRecord = await findValidVerificationCode(email, verificationCode);
  if (!resetRecord) {
    return res.status(400).render('auth/reset-password', {
      error: 'The verification code is invalid or has expired.',
      message: null,
      email
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.updateOne({ user_id: resetRecord.user_id }, { $set: { password_hash: passwordHash } });
  await PasswordReset.updateOne({ reset_id: resetRecord.reset_id }, { $set: { used_at: new Date() } });

  req.flash('success', 'Password updated successfully. Please login with your new password.');
  res.redirect('/auth/login');
}

async function logoutUser(req, res) {
  await destroySession(req);
  res.clearCookie('connect.sid');
  res.redirect('/');
}

module.exports = {
  renderRegisterPage,
  renderLoginPage,
  renderAdminLoginPage,
  renderForgotPasswordPage,
  renderResetPasswordPage,
  registerUser,
  loginUser,
  loginAdmin,
  handleForgotPassword,
  handleResetPassword,
  logoutUser
};
