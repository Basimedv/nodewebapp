const express = require('express');
const router = express.Router();
const usercontroller = require('../controllers/user/usercontroller');
const passport = require('passport');

router.get('/pageNotFound', usercontroller.pageNotFound);
router.get('/', usercontroller.loadHomepage);
router.get("/signup", usercontroller.loadSignup);
router.post("/signup", usercontroller.signup);
router.get("/productListing", usercontroller.loadShopping);
router.get('/pro', usercontroller.showPro);
router.post('/verifyOTP',usercontroller.verifyOtp);
router.post("/resendOTP",usercontroller.resendOtp);
router.get("/login",usercontroller.loadLogin)
router.post('/login',usercontroller.login)

router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    res.redirect('/')
});

module.exports = router