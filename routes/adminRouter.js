// routes/admin.js
const express = require('express');
const router = express.Router();

// ======================= Controllers =======================
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const categorycontroller = require('../controllers/admin/categorycontroller');
const offerController = require('../controllers/admin/offerController');
const productcontroller = require('../controllers/admin/productcontroller');
const ordersController = require('../controllers/admin/ordersController');
const refundController = require('../controllers/admin/refundController');
const couponcontroller = require('../controllers/admin/couponcontroller');
const salesController = require('../controllers/admin/salesController');
const transactionsController = require('../controllers/admin/transactionsController');

// ======================= Middleware =======================
const { userAuth, adminAuth, ensureAdminGuest, preventBack } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

// Prevent cached pages in admin area
router.use(preventBack);

// ======================= Admin Authentication =======================
router.get('/pageerror', admincontroller.pageerror);
router.get('/adminLogin', ensureAdminGuest, admincontroller.loadLogin);
router.post('/adminLogin', ensureAdminGuest, admincontroller.login);
router.get('/dashboard', adminAuth, admincontroller.loadDashboard);
router.get('/logout', admincontroller.logout);

// ======================= Dashboard Data API =======================
// API endpoint for dashboard statistics
router.get('/dashboard/data', adminAuth, async (req, res) => {
    try {
        const { type, period } = req.query;
        
        if (type === 'stats') {
            // Return dashboard statistics
            const dashboardController = require('../controllers/admin/dashboardController');
            await dashboardController.getDashboardStats(req, res);
        } else if (type === 'chart') {
            // Return chart data
            const dashboardController = require('../controllers/admin/dashboardController');
            await dashboardController.getChartData(req, res);
        } else if (type === 'products') {
            // Return best selling products
            const dashboardController = require('../controllers/admin/dashboardController');
            await dashboardController.getBestSellingProducts(req, res);
        } else if (type === 'categories') {
            // Return best selling categories
            const dashboardController = require('../controllers/admin/dashboardController');
            await dashboardController.getBestSellingCategories(req, res);
        } else if (type === 'locations') {
            // Return sales by location
            const dashboardController = require('../controllers/admin/dashboardController');
            await dashboardController.getSalesByLocation(req, res);
        } else if (type === 'transactions') {
            // Return transaction analytics
            const dashboardController = require('../controllers/admin/dashboardController');
            await dashboardController.getTransactionAnalytics(req, res);
        } else {
            res.status(400).json({ success: false, error: 'Invalid data type' });
        }
    } catch (error) {
        console.error('Dashboard data API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ======================= Customer Management =======================
router.get('/customers', adminAuth, customercontroller.customerinfo);
router.put('/customers/:id', adminAuth, customercontroller.userBlock);
router.get('/customers/filter', adminAuth, customercontroller.filterCustomers);


// ======================= Coupon Management =======================
router.get('/coupons', adminAuth, couponcontroller.couponinfo);
router.post('/coupons/add', adminAuth, couponcontroller.addCoupon);
router.post('/coupons/update/:id', adminAuth, couponcontroller.updateCoupon);
router.get('/coupons/:id', adminAuth, couponcontroller.getCouponById);
router.delete('/coupons/:id', adminAuth, couponcontroller.deleteCoupon);


// ======================= Sales Report =======================
// Render the sales report page
router.get('/sales-report', adminAuth, salesController.renderSalesReport);

// API endpoint for fetching sales data
router.get('/sales-data', adminAuth, salesController.getSalesData);

// ======================= Transactions =======================
// Render the transactions page
router.get('/transactions', adminAuth, transactionsController.renderTransactions);

// API endpoint for fetching transactions data
router.get('/transactions-data', adminAuth, transactionsController.getTransactionsData);

// ======================= Order Management =======================
router.get('/orders', adminAuth, ordersController.loadOrders);
router.get('/orders/:id', adminAuth, ordersController.getOrderDetails);
router.get('/order-detail/:id', adminAuth, admincontroller.loadOrderDetailPage);
router.put('/orders/:id/status', adminAuth, ordersController.updateOrderStatus);
router.put('/orders/:id/out-for-delivery', adminAuth, ordersController.markOutForDelivery);
router.put('/orders/:id/delivered', adminAuth, ordersController.markAsDelivered);
router.put('/orders/:id/approve-return', adminAuth, ordersController.approveReturnRequest);
router.put('/orders/:id/reject-return', adminAuth, ordersController.rejectReturnRequest);

// ======================= Refund Management =======================
router.post('/refunds/request', adminAuth, refundController.requestRefund);
router.post('/refunds/cancel', adminAuth, refundController.cancelOrder);
router.get('/refunds', adminAuth, refundController.loadReturnPage);
router.patch('/refunds/update', adminAuth, refundController.updateRefundStatus);
router.patch('/refunds', adminAuth, ordersController.updateRefundStatus);

// ======================= Category Management =======================
router.get('/categories', adminAuth, categorycontroller.categoryinfo);
router.post('/addCategory', adminAuth, categorycontroller.addCategory);
router.put('/categories', adminAuth, categorycontroller.editCategory);
router.get('/Category', adminAuth, categorycontroller.getCategories); // ✅ Added adminAuth

// ======================= Category Offers =======================
router.get('/offers',adminAuth, offerController.loadOffersPage);
router.get('/offers/category/test/:id', adminAuth, offerController.testCategory);
router.put('/offers/category/:id',adminAuth, offerController.updateCategoryOffer);
router.put('/offers/product/:id', adminAuth, offerController.updateProductOffer);

// ======================= Product Management =======================

// ⚠️ IMPORTANT: Specific routes MUST come BEFORE parameterized routes
// Otherwise /products/add would match /products/:id

// Add product page (must be before /:id routes)
router.get('/products/add', adminAuth, productcontroller.getAddProductPage);

// Get all products (list view)
router.get('/products', adminAuth, productcontroller.getProducts);

// Edit product page (must be before generic /:id route)
router.get('/products/edit/:id', adminAuth, productcontroller.getEditProductPage);

// Get product by ID (API endpoint)
router.get('/products/api/:id', adminAuth, productcontroller.getProductById);

// Create new product
router.post(
  '/products',
  adminAuth,
  upload.array('images', 3),
  productcontroller.createProduct
);

// Update existing product
router.put(
  '/products/:id',
  adminAuth,
  upload.array('images', 3),
  productcontroller.updateProduct
);

// Toggle product block/unblock status
router.put('/products/:id/block', adminAuth, productcontroller.toggleBlock);

// Toggle product list/unlist status
router.put('/products/:id/list', adminAuth, productcontroller.toggleList);

// Toggle product active/inactive status
router.patch('/products/:id/status', adminAuth, productcontroller.toggleProductStatus);

// Delete product permanently
router.delete('/products/:id', adminAuth, productcontroller.deleteProduct);

// ⚠️ REMOVED: These routes don't have corresponding controller methods
// If you need them later, implement them in productcontroller.js first
// router.put('/products/:id/images', adminAuth, upload.array('images', 10), productcontroller.updateImages);
// router.delete('/products/:id/images', adminAuth, productcontroller.deleteImages);

// ======================= Error Handler (Optional) =======================
// Catch-all for unmatched admin routes
router.use((req, res) => {
  res.status(404).redirect('/admin/pageerror');
});

module.exports = router;