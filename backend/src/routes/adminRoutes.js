const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  getAdminDashboard,
  manageInventory,
  addInventory,
  getEditInventory,
  updateInventory,
  deleteInventory,
  getUsers,
  getUserDetail,
  addWalletFunds,
  deleteUser,
  getBookings,
  getPayments
} = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, asyncHandler(getAdminDashboard));
router.get('/manage/:type', requireAdmin, asyncHandler(manageInventory));
router.post('/manage/:type/add', requireAdmin, asyncHandler(addInventory));
router.get('/manage/:type/edit/:id', requireAdmin, asyncHandler(getEditInventory));
router.post('/manage/:type/edit/:id', requireAdmin, asyncHandler(updateInventory));
router.post('/manage/:type/delete/:id', requireAdmin, asyncHandler(deleteInventory));
router.get('/users', requireAdmin, asyncHandler(getUsers));
router.get('/users/:id', requireAdmin, asyncHandler(getUserDetail));
router.post('/users/:id/wallet', requireAdmin, asyncHandler(addWalletFunds));
router.post('/users/delete/:id', requireAdmin, asyncHandler(deleteUser));
router.get('/bookings', requireAdmin, asyncHandler(getBookings));
router.get('/payments', requireAdmin, asyncHandler(getPayments));

module.exports = router;
