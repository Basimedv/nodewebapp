// routes/admin.js
const express = require('express');
const router = express.Router();
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller = require('../controllers/admin/customercontroller');
const { userAuth, adminAuth, ensureAdminGuest, preventBack } = require('../middlewares/auth');
const categorycontroller = require('../controllers/admin/categorycontroller');
const categoryOfferController = require('../controllers/admin/categoryOfferController');
const productcontroller = require('../controllers/admin/productcontroller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create a temporary directory for uploads
    const tempDir = path.join(__dirname, '../public/uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG and WebP files are allowed.'), false);
  }
};

// Initialize multer with configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Maximum 10 files per upload
  }
});
const brandcontroller=require('../controllers/admin/brandcontroller')
// Prevent cached pages in admin area so Back doesn't show login/dashboard incorrectly
router.use(preventBack)
router.get('/pageerror', admincontroller.pageerror)
router.get("/adminLogin", ensureAdminGuest, admincontroller.loadLogin);
router.post("/adminLogin", ensureAdminGuest, admincontroller.login);
router.get("/dashboard", adminAuth,admincontroller.loadDashboard);
router.get('/logout',admincontroller.logout)
router.get('/customers', adminAuth, customercontroller.customerinfo)
router.put("/customers/:id", adminAuth, customercontroller.userBlock);
router.get('/customers/filter',adminAuth,customercontroller.filterCustomers);
router.get('/categories', adminAuth, categorycontroller.categoryinfo);
router.post('/addCategory', adminAuth, categorycontroller.addCategory);
router.put('/categories',adminAuth,categorycontroller.editCategory);


router.get('/offers', categoryOfferController.loadOffersPage);
router.put('/category/offer/:id', categoryOfferController.updateCategoryOffer);
router.get('/Category',categorycontroller. getCategories);


router.get('/offers', categoryOfferController.loadOffersPage);
router.put('/category/offer/:id', categoryOfferController.updateCategoryOffer);

// Brands
router.get('/brands', adminAuth, brandcontroller.brandInfo);
router.post('/brands', adminAuth, brandcontroller.addBrand);
router.put('/brands', adminAuth, brandcontroller.editBrand);
router.put('/brands/block', adminAuth, brandcontroller.blockBrand);
router.put('/brands/unblock', adminAuth, brandcontroller.unblockBrand);
router.delete('/brands', adminAuth, brandcontroller.deleteBrand);

// Products routes
router.get('/products', adminAuth, productcontroller.getProductAddPage);

// Handle product creation with file uploads
router.post('/products', 
  adminAuth, 
  upload.array('images', 10), // Allow up to 10 files
  productcontroller.createProduct
);

// Get single product
router.get('/products/:id', adminAuth, productcontroller.getOne);

// Update product details (without images)
router.put('/products/:id', adminAuth, productcontroller.updateOne);

// Update product images (replace by default; append with ?append=true)
router.put('/products/:id/images', adminAuth, upload.array('images', 8), productcontroller.updateImages);

// Delete specific product images
router.delete('/products/:id/images', adminAuth, productcontroller.deleteImages);

router.put('/products/:id/block', adminAuth, productcontroller.toggleBlock);
router.put('/products/:id/list', adminAuth, productcontroller.toggleList);
// router.post('/addproducts', adminAuth, upload.array('images', 8), productcontroller.createProduct);







module.exports = router;









