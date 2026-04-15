const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const {
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
} = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/register', renderRegisterPage);
router.post('/register', authLimiter, asyncHandler(registerUser));
router.get('/login', renderLoginPage);
router.post('/login', authLimiter, asyncHandler(loginUser));
router.get('/admin/login', renderAdminLoginPage);
router.post('/admin/login', authLimiter, asyncHandler(loginAdmin));
router.get('/forgot-password', renderForgotPasswordPage);
router.post('/forgot-password', authLimiter, asyncHandler(handleForgotPassword));
router.get('/reset-password', asyncHandler(renderResetPasswordPage));
router.post('/reset-password', authLimiter, asyncHandler(handleResetPassword));
router.post('/logout', asyncHandler(logoutUser));

module.exports = router;
