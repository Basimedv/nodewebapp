const express = require('express');
const router = express.Router();
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const productcontroller = require('../controllers/admin/productcontroller');
const { adminAuth, isGuest } = require('../middlewares/auth');
const { ROUTES } = require('../constants/routes');
const { uploadProduct } = require('../config/cloudinary');  // add this

router.get(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.loadLogin);
router.post(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.login);
router.get(ROUTES.ADMIN.LOGOUT, admincontroller.logout);

router.get(ROUTES.ADMIN.DASHBOARD, adminAuth, admincontroller.loadDashboard);
router.get(ROUTES.ADMIN.CUSTOMERS, adminAuth, customercontroller.customerinfo);
router.put(ROUTES.ADMIN.CUSTOMERS_BLOCK, adminAuth, customercontroller.userBlock);
// Product Management
router.get('/products/add',      adminAuth, productcontroller.getAddProductPage);
router.get('/products',          adminAuth, productcontroller.getProducts);
router.get('/products/edit/:id', adminAuth, productcontroller.getEditProductPage);
router.get('/products/api/:id',  adminAuth, productcontroller.getProductById);

router.post('/products',         adminAuth, uploadProduct.array('images', 3), productcontroller.createProduct);
router.put('/products/:id',      adminAuth, uploadProduct.array('images', 3), productcontroller.updateProduct);
router.put('/products/:id/block',  adminAuth, productcontroller.toggleBlock);
router.put('/products/:id/list',   adminAuth, productcontroller.toggleList);
router.patch('/products/:id/status', adminAuth, productcontroller.toggleProductStatus);
router.delete('/products/:id',   adminAuth, productcontroller.deleteProduct);

router.get(ROUTES.ADMIN.PAGE_ERROR, admincontroller.pageerror);

module.exports = router;