const express = require('express');
const router = express.Router();
const usercontroller = require('../controllers/user/usercontroller');
const passport = require('passport');
const profileController = require('../controllers/user/profileController');
const walletController = require('../controllers/user/walletController');
const checkoutcontroller = require('../controllers/user/checkoutcontroller');
const { ensureAuth, ensureGuest, preventBack } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

// Prevent cached pages after logout
router.use(preventBack);

router.get('/pageNotFound', usercontroller.pageNotFound);
router.get('/', usercontroller.loadHomepage);

router.get("/signup", ensureGuest, usercontroller.loadSignup);
router.post("/signup", ensureGuest, usercontroller.signup);
router.get("/productListing", usercontroller.loadShopping);
router.get('/shop', usercontroller.loadShopping);
router.get('/productDetails/:id', usercontroller.getProductDetails);
router.get('/api/products', usercontroller.apiProducts);
router.get('/pro', usercontroller.showPro);

router.post('/verifyOtp', usercontroller.verifyOtp);
router.post('/verifyOTP', usercontroller.verifyOtp);
router.post('/resendOtp', usercontroller.resendOtp);
router.post("/resendOTP", usercontroller.resendOtp);

router.get("/login", ensureGuest, usercontroller.loadLogin);
router.post('/login', ensureGuest, usercontroller.login);
router.get("/landingPage", ensureAuth, usercontroller.loadLandingPage);
router.get('/logout', usercontroller.logout);
router.get('/profile', ensureAuth, profileController.getProfilePage);
router.get('/user/profile', ensureAuth, profileController.getProfilePage);
router.get('/profile/edit', ensureAuth, profileController.getEditProfilePage);
router.post('/profile/update', ensureAuth, upload.single('profileImage'), profileController.updateProfile);
router.delete('/profile/image', ensureAuth, profileController.deleteProfileImage);
router.get('/wallet', ensureAuth, walletController.loadWallet);
router.get('/my-wallet', ensureAuth, walletController.loadWallet);

// Your existing routes
router.get('/orders', ensureAuth, usercontroller.viewOrders);
router.get('/orders/:id', ensureAuth, usercontroller.getOrderDetails);
router.get('/user/orders', ensureAuth, usercontroller.viewOrders);
router.get('/user/orders/:id', ensureAuth, usercontroller.getOrderDetails);
router.post('/user/orders/:orderId/cancel', ensureAuth, usercontroller.cancelOrder);
router.post('/user/orders/:orderId/return', ensureAuth, usercontroller.returnOrder);
router.get('/user/order/:id/invoice', ensureAuth, usercontroller.getOrderInvoice);

router.get('/cart', ensureAuth, usercontroller.loadCart);
router.post('/addToCart', ensureAuth, usercontroller.addToCart);
router.post('/user/updateCartQuantity', ensureAuth, usercontroller.updateCartQuantity);
router.post('/user/removeFromCart', ensureAuth, usercontroller.removeFromCart);
router.post('/user/addToCart', ensureAuth, usercontroller.addToCart);

// Wishlist routes
router.get('/wishlist', ensureAuth, usercontroller.viewWishlist);
router.post('/user/addToWishlist', ensureAuth, usercontroller.addToWishlist);
router.post('/user/removeFromWishlist', ensureAuth, usercontroller.removeFromWishlist);

router.get('/forgotPassword', profileController.getForgotPage);
router.post('/forgot-Email-valid', profileController.forgotEmailValid);
router.post('/verify-passForgot-otp', profileController.verifyForgotPassOtp);
router.get('/resetpassword', profileController.ensureOtpVerified, profileController.getResetPassPage);
router.post('/resetpassword', profileController.ensureOtpVerified, profileController.resetPassword);
router.post('/resend-otp', profileController.resendOtp);

// Checkout routes
router.get('/checkout', ensureAuth, checkoutcontroller.loadCheckout);
router.post('/shoppingAddress', ensureAuth, checkoutcontroller.addShoppingAddress);
router.put('/shoppingAddress', ensureAuth, checkoutcontroller.editShoppingAddress);
router.put('/checkout/edit-address', ensureAuth, checkoutcontroller.editShoppingAddress);
router.post('/checkout', ensureAuth, checkoutcontroller.checkoutDetails);
router.get('/order-confirmation', ensureAuth, checkoutcontroller.confirmOrder);
router.get('/confirm-order', ensureAuth, checkoutcontroller.confirmOrder);
router.post('/checkout/save-address', ensureAuth, checkoutcontroller.saveAddressToSession);
router.get('/payment', ensureAuth, checkoutcontroller.loadPayment);
router.get('/user/payment', ensureAuth, checkoutcontroller.loadPayment);
router.get('/payments', ensureAuth, checkoutcontroller.loadPayment);
router.get('/user/payments', ensureAuth, checkoutcontroller.loadPayment);
router.post('/payment/process', ensureAuth, checkoutcontroller.processPayment);

// ===== GOOGLE OAUTH ROUTES =====

// Initiate Google OAuth
router.get('/auth/google', 
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account' // Force account selection
    })
);

// Google OAuth callback
router.get('/auth/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/signup?error=oauth_failed',
        failureMessage: true
    }),
    async (req, res) => {
        try {
            // Check if user is blocked
            if (req.user.isBlocked) {
                req.logout((err) => {
                    if (err) console.error('Logout error:', err);
                });
                return res.redirect('/login?error=blocked');
            }
            
            // Set session data
            req.session.user = {
                _id: req.user._id,
                fullName: req.user.fullName,
                email: req.user.email
            };
            
            // Save session before redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.redirect('/login?error=session_failed');
                }
                
                console.log("✅ Google login successful for:", req.user.email);
                console.log("📦 Session user:", req.session.user);
                return res.redirect('/landingPage');
            });
            
        } catch (error) {
            console.error('❌ OAuth callback error:', error);
            return res.redirect('/signup?error=server_error');
        }
    }
);

module.exports = router;