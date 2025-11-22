// routes/admin.js
const express = require('express');
const router = express.Router();

// ======================= Controllers =======================
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const categorycontroller = require('../controllers/admin/categorycontroller');
const categoryOfferController = require('../controllers/admin/categoryOfferController');
const productcontroller = require('../controllers/admin/productcontroller');

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

// ======================= Customer Management =======================
router.get('/customers', adminAuth, customercontroller.customerinfo);
router.put('/customers/:id', adminAuth, customercontroller.userBlock);
router.get('/customers/filter', adminAuth, customercontroller.filterCustomers);

// ======================= Category Management =======================
router.get('/categories', adminAuth, categorycontroller.categoryinfo);
router.post('/addCategory', adminAuth, categorycontroller.addCategory);
router.put('/categories', adminAuth, categorycontroller.editCategory);
router.get('/Category', adminAuth, categorycontroller.getCategories); // ✅ Added adminAuth

// ======================= Category Offers =======================
router.get('/offers', adminAuth, categoryOfferController.loadOffersPage); // ✅ Added adminAuth
router.put('/category/offer/:id', adminAuth, categoryOfferController.updateCategoryOffer); // ✅ Added adminAuth

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