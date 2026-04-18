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
router.get(ROUTES.ADMIN.PRODUCTS_ADD,        adminAuth, productcontroller.getAddProductPage);
router.get(ROUTES.ADMIN.PRODUCTS,            adminAuth, productcontroller.getProducts);
router.get(ROUTES.ADMIN.PRODUCTS_EDIT,       adminAuth, productcontroller.getEditProductPage);
router.get(ROUTES.ADMIN.PRODUCTS_API,        adminAuth, productcontroller.getProductById);

router.post(ROUTES.ADMIN.PRODUCTS,           adminAuth, uploadProduct.array('images', 3), productcontroller.createProduct);
router.put(ROUTES.ADMIN.PRODUCTS_UPDATE,     adminAuth, uploadProduct.array('images', 3), productcontroller.updateProduct);
router.put(ROUTES.ADMIN.PRODUCTS_BLOCK,      adminAuth, productcontroller.toggleBlock);
router.put(ROUTES.ADMIN.PRODUCTS_LIST,       adminAuth, productcontroller.toggleList);
router.patch(ROUTES.ADMIN.PRODUCTS_STATUS,   adminAuth, productcontroller.toggleProductStatus);
router.delete(ROUTES.ADMIN.PRODUCTS_DELETE,  adminAuth, productcontroller.deleteProduct);

router.get(ROUTES.ADMIN.PAGE_ERROR, admincontroller.pageerror);

module.exports = router;