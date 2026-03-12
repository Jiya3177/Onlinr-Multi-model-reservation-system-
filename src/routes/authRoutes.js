const express = require('express');
const {
  getRegister,
  getLogin,
  getAdminLogin,
  getForgotPassword,
  register,
  login,
  adminLogin,
  forgotPassword,
  logout
} = require('../controllers/authController');

const router = express.Router();

router.get('/register', getRegister);
router.post('/register', register);
router.get('/login', getLogin);
router.post('/login', login);
router.get('/admin/login', getAdminLogin);
router.post('/admin/login', adminLogin);
router.get('/forgot-password', getForgotPassword);
router.post('/forgot-password', forgotPassword);
router.post('/logout', logout);

module.exports = router;
