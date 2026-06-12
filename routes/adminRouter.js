const express = require('express');
const router = express.Router();
const admincontroller    = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const productcontroller  = require('../controllers/admin/productcontroller');
const categorycontroller = require('../controllers/admin/categorycontroller');
const couponController = require('../controllers/admin/couponController');
const orderController = require('../controllers/admin/orderController');


const offerController = require('../controllers/admin/offerController');
const { adminAuth, isGuest } = require('../middlewares/auth');
const { ROUTES } = require('../constants/routes');
const { uploadProduct } = require('../config/cloudinary');


router.get(ROUTES.ADMIN.LOGIN,   isGuest, admincontroller.loadLogin);
router.post(ROUTES.ADMIN.LOGIN,  isGuest, admincontroller.login);
router.get(ROUTES.ADMIN.LOGOUT,  admincontroller.logout);


router.get(ROUTES.ADMIN.DASHBOARD, adminAuth, admincontroller.loadDashboard);


router.get(ROUTES.ADMIN.CUSTOMERS,       adminAuth, customercontroller.customerinfo);
router.put(ROUTES.ADMIN.CUSTOMERS_BLOCK, adminAuth, customercontroller.userBlock);


router.get(ROUTES.ADMIN.CATEGORIES,      adminAuth, categorycontroller.categoryinfo);
router.post(ROUTES.ADMIN.CATEGORIES_ADD, adminAuth, categorycontroller.addCategory);
router.put(ROUTES.ADMIN.CATEGORIES_EDIT, adminAuth, categorycontroller.editCategory);
router.patch(ROUTES.ADMIN.TOGGLE_CATEGORY_ROUTE, adminAuth, categorycontroller.toggleCategory);

router.get(ROUTES.ADMIN.PRODUCTS_ADD,      adminAuth, productcontroller.getAddProductPage);
router.get(ROUTES.ADMIN.PRODUCTS,          adminAuth, productcontroller.getProducts);
router.get(ROUTES.ADMIN.PRODUCTS_EDIT,     adminAuth, productcontroller.getEditProductPage);
router.get(ROUTES.ADMIN.PRODUCTS_API,      adminAuth, productcontroller.getProductById);
router.post(ROUTES.ADMIN.PRODUCTS,         adminAuth, uploadProduct.array('images', 3), productcontroller.createProduct);
router.put(ROUTES.ADMIN.PRODUCTS_UPDATE,   adminAuth, uploadProduct.array('images', 3), productcontroller.updateProduct);
router.put(ROUTES.ADMIN.PRODUCTS_BLOCK,    adminAuth, productcontroller.toggleBlock);
router.put(ROUTES.ADMIN.PRODUCTS_LIST,     adminAuth, productcontroller.toggleList);
router.patch(ROUTES.ADMIN.PRODUCTS_STATUS, adminAuth, productcontroller.toggleProductStatus);
router.delete(ROUTES.ADMIN.PRODUCTS_DELETE,adminAuth, productcontroller.deleteProduct);

router.get(ROUTES.ADMIN.ORDERS,               adminAuth, orderController.getOrders);
router.get(ROUTES.ADMIN.ORDER_DETAIL,         adminAuth, orderController.getOrderDetail);
router.post(ROUTES.ADMIN.ORDER_UPDATE_STATUS, adminAuth, orderController.updateOrderStatus);
router.post(ROUTES.ADMIN.ORDER_HANDLE_RETURN, adminAuth, orderController.handleReturn);

// Add these 2 routes
router.post(ROUTES.ADMIN.OFFERS_ADD,           adminAuth, offerController.addOffer);
router.post(ROUTES.ADMIN.OFFERS_REMOVE_TARGET, adminAuth, offerController.removeOfferByTarget);



router.get(ROUTES.ADMIN.COUPONS,        adminAuth, couponController.getCoupons);
router.post(ROUTES.ADMIN.COUPONS_ADD,   adminAuth, couponController.postAddCoupon);
router.put(ROUTES.ADMIN.COUPONS_TOGGLE, adminAuth, couponController.toggleCoupon);
router.delete(ROUTES.ADMIN.COUPONS_DELETE, adminAuth, couponController.deleteCoupon);
// Page Error
router.get(ROUTES.ADMIN.PAGE_ERROR, admincontroller.pageerror);

module.exports = router;