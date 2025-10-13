const express = require('express');
const router = express.Router();
const usercontroller = require('../controllers/user/usercontroller');
const passport = require('passport');
const profileController=require('../controllers/user/profileController')
const { ensureAuth, ensureGuest, preventBack, blockAdminOnUserLogin, stayOnLandingAfterLogin, blockAdminFromUserPages } = require('../middlewares/auth');

// Prevent cached pages after logout
router.use(preventBack);

router.get('/pageNotFound', usercontroller.pageNotFound);
router.get('/', usercontroller.loadHomepage);

router.get("/signup", blockAdminOnUserLogin, ensureGuest, usercontroller.loadSignup);
router.post("/signup", blockAdminOnUserLogin, ensureGuest, usercontroller.signup);
router.get("/productListing", blockAdminFromUserPages, ensureAuth, usercontroller.loadShopping);
// Alias used by productListing.ejs filter/search forms
router.get('/shop', blockAdminFromUserPages, ensureAuth, usercontroller.loadShopping);
// Product details page
router.get('/productDetails/:id', blockAdminFromUserPages, ensureAuth, usercontroller.getProductDetails);
// Public API for products (client-side fetch)
router.get('/api/products', usercontroller.apiProducts);
router.get('/pro', usercontroller.showPro);
router.post('/verifyOTP', usercontroller.verifyOtp);
router.post("/resendOTP", usercontroller.resendOtp);
router.get("/login", blockAdminOnUserLogin, ensureGuest, usercontroller.loadLogin)
router.get("/landingPage", ensureAuth, usercontroller.loadLandingPage)
router.get('/logout', usercontroller.logout)
router.post('/login', blockAdminOnUserLogin, ensureGuest, usercontroller.login)
router.get('/forgotPassword', profileController.getForgotPage);
router.post('/forgot-Email-valid', profileController.forgotEmailValid)
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp);
router.get('/resetpassword', (req, res) => {
  res.render('user/resetPassword', { error: null });
});
router.post('/resetpassword',profileController.resetPassword);
router.post('/resend-otp', profileController.resendOtp);

// router.get('/test-otp', (req, res) => {
//   res.render("user/verifyPasswordOTP", { email: "test@example.com", error: null });
// });








// router.get('/resetPassword', preventBackAfterLogout, usercontroller.getResetPassword);
// router.post('/resetPassword', usercontroller.handleResetPassword);

// Wishlist add route (EJS uses POST /user/addToWishlist)
router.post('/user/addToWishlist', ensureAuth, usercontroller.addToWishlist);

// Wishlist routes (paths aligned with EJS fetch and links)
router.get('/user/wishlist', ensureAuth, usercontroller.viewWishlist);
router.post('/user/removeFromWishlist', ensureAuth, usercontroller.removeFromWishlist);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signup' }),
  async (req, res) => {
    try {
      //  Save Google user in session
      req.session.user = {
        _id: req.user._id,
        fullName: req.user.fullName,
        email: req.user.email
      };

      console.log("Google login successful, session user:", req.session.user);

      res.redirect('/landingPage');
    } catch (err) {
      console.error(" Google callback error:", err);
      res.redirect('/signup');
    }
  }
);

module.exports = router