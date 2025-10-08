// routes/admin.js
const express = require('express');
const router = express.Router();
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller=require('../controllers/admin/customercontroller')
const {userAuth,adminAuth, blockUserOnAdminLogin, ensureAdminGuest, preventBack}=require('../middlewares/auth')
const categorycontroller=require('../controllers/admin/categorycontroller')
const categoryOfferController = require('../controllers/admin/categoryOfferController');
const productcontroller = require('../controllers/admin/productcontroller')

const multer=require('multer')
const storage=require('../utils/imageStorage')
const upload=multer({storage:storage})
const brandcontroller=require('../controllers/admin/brandcontroller')
// Prevent cached pages in admin area so Back doesn't show login/dashboard incorrectly
router.use(preventBack)
router.get('/pageerror', admincontroller.pageerror)
router.get("/adminLogin", blockUserOnAdminLogin, ensureAdminGuest, admincontroller.loadLogin);
router.post("/adminLogin", blockUserOnAdminLogin, ensureAdminGuest, admincontroller.login);
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

router.get('/products', adminAuth, productcontroller.getProductAddPage);
router.post('/products', adminAuth, upload.array('images', 8), productcontroller.createProduct);
router.get('/products/:id', adminAuth, productcontroller.getOne);
router.put('/products/:id', adminAuth, productcontroller.updateOne);
// Update product images (replace by default; append with ?append=true)
router.put('/products/:id/images', adminAuth, upload.array('images', 8), productcontroller.updateImages);
router.put('/products/:id/block', adminAuth, productcontroller.toggleBlock);
router.put('/products/:id/list', adminAuth, productcontroller.toggleList);
// router.post('/addproducts', adminAuth, upload.array('images', 8), productcontroller.createProduct);







module.exports = router;









