// routes/admin.js
const express = require('express');
const router = express.Router();
const admincontroller = require('../controllers/admin/admincontroller');
const customercontroller=require('../controllers/admin/customercontroller')
const {userAuth,adminAuth}=require('../middlewares/auth')
const categorycontroller=require('../controllers/admin/categorycontroller')
const categoryOfferController = require('../controllers/admin/categoryOfferController');
router.get('/pageerror,',admincontroller.pageerror)
router.get("/adminLogin", admincontroller.loadLogin);
router.post("/adminLogin", admincontroller.login);
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







module.exports = router;









