const express = require('express');
const {
  getAdminDashboard,
  manageInventory,
  addInventory,
  getEditInventory,
  updateInventory,
  deleteInventory,
  getUsers,
  deleteUser,
  getBookings,
  getPayments
} = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, getAdminDashboard);
router.get('/manage/:type', requireAdmin, manageInventory);
router.post('/manage/:type/add', requireAdmin, addInventory);
router.get('/manage/:type/edit/:id', requireAdmin, getEditInventory);
router.post('/manage/:type/edit/:id', requireAdmin, updateInventory);
router.post('/manage/:type/delete/:id', requireAdmin, deleteInventory);
router.get('/users', requireAdmin, getUsers);
router.post('/users/delete/:id', requireAdmin, deleteUser);
router.get('/bookings', requireAdmin, getBookings);
router.get('/payments', requireAdmin, getPayments);

module.exports = router;
