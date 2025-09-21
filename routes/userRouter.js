const express = require('express');
const router = express.Router();
const usercontroller = require('../controllers/user/usercontroller');
const passport = require('passport');
const profileController=require('../controllers/user/profileController')

router.get('/pageNotFound', usercontroller.pageNotFound);
router.get('/', usercontroller.loadHomepage);

router.get("/signup", usercontroller.loadSignup);
router.post("/signup", usercontroller.signup);
router.get("/productListing", usercontroller.loadShopping);
router.get('/pro', usercontroller.showPro);
router.post('/verifyOTP', usercontroller.verifyOtp);
router.post("/resendOTP", usercontroller.resendOtp);
router.get("/login", usercontroller.loadLogin)
router.get("/landingPage", usercontroller.loadLandingPage)
router.get('/logout', usercontroller.logout)
router.post('/login', usercontroller.login)
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