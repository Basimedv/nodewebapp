const express = require('express');
const router = express.Router();
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const { adminAuth, isGuest } = require('../middlewares/auth');
const { ROUTES } = require('../constants/routes');



// Authentication
router.get(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.loadLogin);
router.post(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.login);
router.get(ROUTES.ADMIN.LOGOUT, admincontroller.logout);

// Protected Dashboard & Management
router.get(ROUTES.ADMIN.DASHBOARD, adminAuth, admincontroller.loadDashboard);
router.get(ROUTES.ADMIN.CUSTOMERS, adminAuth, customercontroller.customerinfo);
router.put(ROUTES.ADMIN.CUSTOMERS_BLOCK, adminAuth, customercontroller.userBlock);

// Error Handling
router.get(ROUTES.ADMIN.PAGE_ERROR, admincontroller.pageerror);
// router.use((req, res) => res.status(404).redirect('/admin/pageerror'));

module.exports = router;