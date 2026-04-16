const express = require('express');
const router = express.Router();
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const { adminAuth, isGuest } = require('../middlewares/auth');
const { ROUTES } = require('../constants/routes');




router.get(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.loadLogin);
router.post(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.login);
router.get(ROUTES.ADMIN.LOGOUT, admincontroller.logout);


router.get(ROUTES.ADMIN.DASHBOARD, adminAuth, admincontroller.loadDashboard);
router.get(ROUTES.ADMIN.CUSTOMERS, adminAuth, customercontroller.customerinfo);
router.put(ROUTES.ADMIN.CUSTOMERS_BLOCK, adminAuth, customercontroller.userBlock);


router.get(ROUTES.ADMIN.PAGE_ERROR, admincontroller.pageerror);


module.exports = router;