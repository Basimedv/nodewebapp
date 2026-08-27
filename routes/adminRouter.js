const express = require('express');
const router = express.Router();
const admincontroller       = require('../controllers/admin/admincontroller');
const customercontroller    = require('../controllers/admin/customercontroller');
const productcontroller     = require('../controllers/admin/productcontroller');
const categorycontroller    = require('../controllers/admin/categorycontroller');
const couponController      = require('../controllers/admin/couponController');
const orderController       = require('../controllers/admin/orderController');
const offerController       = require('../controllers/admin/offerController');
const salesReportController = require('../controllers/admin/salesReportController');
const { adminAuth, isGuest } = require('../middlewares/auth');
const { ROUTES } = require('../constants/routes');
const { uploadProduct } = require('../config/cloudinary');

// ── Auth ──────────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.LOGIN,  isGuest, admincontroller.loadLogin);
router.post(ROUTES.ADMIN.LOGIN, isGuest, admincontroller.login);
router.get(ROUTES.ADMIN.LOGOUT, admincontroller.logout);

// ── Dashboard ─────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.DASHBOARD,      adminAuth, admincontroller.loadDashboard);
router.get(ROUTES.ADMIN.DASHBOARD_DATA, adminAuth, admincontroller.getDashboardData);

// ── Customers ─────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.CUSTOMERS,       adminAuth, customercontroller.customerinfo);
router.put(ROUTES.ADMIN.CUSTOMERS_BLOCK, adminAuth, customercontroller.userBlock);

// ── Categories ────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.CATEGORIES,              adminAuth, categorycontroller.categoryinfo);
router.post(ROUTES.ADMIN.CATEGORIES_ADD,         adminAuth, categorycontroller.addCategory);
router.put(ROUTES.ADMIN.CATEGORIES_EDIT,         adminAuth, categorycontroller.editCategory);
router.patch(ROUTES.ADMIN.TOGGLE_CATEGORY_ROUTE, adminAuth, categorycontroller.toggleCategory);

// ── Products ──────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.PRODUCTS_ADD,       adminAuth, productcontroller.getAddProductPage);
router.get(ROUTES.ADMIN.PRODUCTS,           adminAuth, productcontroller.getProducts);
router.get(ROUTES.ADMIN.PRODUCTS_EDIT,      adminAuth, productcontroller.getEditProductPage);
router.get(ROUTES.ADMIN.PRODUCTS_API,       adminAuth, productcontroller.getProductById);
router.post(ROUTES.ADMIN.PRODUCTS,          adminAuth, uploadProduct.array('images', 3), productcontroller.createProduct);
router.put(ROUTES.ADMIN.PRODUCTS_UPDATE,    adminAuth, uploadProduct.array('images', 3), productcontroller.updateProduct);
router.put(ROUTES.ADMIN.PRODUCTS_BLOCK,     adminAuth, productcontroller.toggleBlock);
router.put(ROUTES.ADMIN.PRODUCTS_LIST,      adminAuth, productcontroller.toggleList);
router.patch(ROUTES.ADMIN.PRODUCTS_STATUS,  adminAuth, productcontroller.toggleProductStatus);
router.delete(ROUTES.ADMIN.PRODUCTS_DELETE, adminAuth, productcontroller.deleteProduct);

// ── Orders ────────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.ORDERS,               adminAuth, orderController.getOrders);
router.get(ROUTES.ADMIN.ORDER_DETAIL,         adminAuth, orderController.getOrderDetail);
router.post(ROUTES.ADMIN.ORDER_UPDATE_STATUS, adminAuth, orderController.updateOrderStatus);
router.post(ROUTES.ADMIN.ORDER_HANDLE_RETURN, adminAuth, orderController.handleReturn);

// ── Offers ────────────────────────────────────────────────────────
router.post(ROUTES.ADMIN.OFFERS_ADD,           adminAuth, offerController.addOffer);
router.post(ROUTES.ADMIN.OFFERS_REMOVE_TARGET, adminAuth, offerController.removeOfferByTarget);

// ── Coupons ───────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.COUPONS,           adminAuth, couponController.getCoupons);
router.post(ROUTES.ADMIN.COUPONS_ADD,      adminAuth, couponController.postAddCoupon);
router.put(ROUTES.ADMIN.COUPONS_EDIT,      adminAuth, couponController.editCoupon);
router.put(ROUTES.ADMIN.COUPONS_TOGGLE,    adminAuth, couponController.toggleCoupon);
router.delete(ROUTES.ADMIN.COUPONS_DELETE, adminAuth, couponController.deleteCoupon);

// ── Sales Report ──────────────────────────────────────────────────
// NOTE: export routes must come BEFORE the base SALES_REPORT route
router.get(ROUTES.ADMIN.SALES_REPORT_PDF,   adminAuth, salesReportController.exportPDF);
router.get(ROUTES.ADMIN.SALES_REPORT_EXCEL, adminAuth, (req, res) => {
    // TODO: wire up your Excel export logic here
    res.status(501).json({ message: 'Excel export coming soon' });
});
router.get(ROUTES.ADMIN.SALES_REPORT, adminAuth, salesReportController.getSalesReport);

// ── Page Error ────────────────────────────────────────────────────
router.get(ROUTES.ADMIN.PAGE_ERROR, admincontroller.pageerror);

module.exports = router;