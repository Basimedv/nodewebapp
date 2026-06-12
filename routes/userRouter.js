const express = require('express');
const router = express.Router();
const usercontroller = require('../controllers/user/usercontroller');
const profileController = require('../controllers/user/profileController');
const addresscontroller = require('../controllers/user/addresscontroller');
const { addReview } = require('../controllers/user/reviewController');
const wishlistController = require('../controllers/user/wishlistController');
const checkoutController = require('../controllers/user/checkoutController');
const cartController = require('../controllers/user/cartController');
const walletController   = require('../controllers/user/walletController');
const orderController = require("../controllers/user/orderController");
const { userAuth, isGuest } = require('../middlewares/auth');
const { uploadProfile } = require('../config/cloudinary');

const { ROUTES } = require('../constants/routes');

// Public Pages

router.get(ROUTES.USER.HOME, isGuest, usercontroller.loadHomepage);
router.get(ROUTES.USER.PAGE_ERROR, usercontroller.pageNotFound);


router.get(ROUTES.USER.SIGNUP, isGuest, usercontroller.loadSignup);
router.post(ROUTES.USER.SIGNUP, isGuest, usercontroller.signup);
router.post(ROUTES.USER.VERIFY_OTP, usercontroller.verifyOtp);
router.post(ROUTES.USER.RESEND_OTP, usercontroller.resendOtp);

router.get(ROUTES.USER.LOGIN, isGuest, usercontroller.loadLogin);
router.post(ROUTES.USER.LOGIN, isGuest, usercontroller.login);


router.get(ROUTES.USER.LANDING_PAGE, userAuth, usercontroller.loadLandingPage);
router.get(ROUTES.USER.LOGOUT, usercontroller.logout);


router.delete(ROUTES.USER.PROFILE_DELETE_IMAGE, userAuth, profileController.deleteProfileImage);
router.get(ROUTES.USER.PROFILE, userAuth, profileController.getProfilePage);
router.get(ROUTES.USER.PROFILE_GET, userAuth, profileController.getEditProfilePage);
router.post(ROUTES.USER.PROFILE_UPDATE, userAuth, uploadProfile.single('profileImage'), profileController.updateProfile);




router.get(ROUTES.USER.ADDRESS, userAuth, addresscontroller.getAddress);
router.get(ROUTES.USER.ADD_ADDRESS, userAuth, addresscontroller.getAddAddress);
router.get(ROUTES.USER.EDIT_ADDRESS, userAuth, addresscontroller.getEditAddress);

router.post(ROUTES.USER.ADD_ADDRESS, userAuth, addresscontroller.postAddAddress);
router.post(ROUTES.USER.EDIT_ADDRESS, userAuth, addresscontroller.postEditAddress);
router.delete(ROUTES.USER.DELETE_ADDRESS, userAuth, addresscontroller.deleteAddress);



router.get(ROUTES.USER.PRODUCT_LISTING, usercontroller.loadShopping);
router.get(ROUTES.USER.SHOP,            usercontroller.loadShopping);
router.get(ROUTES.USER.PRODUCT_DETAILS, usercontroller.getProductDetails);
router.get(ROUTES.USER.PRODUCT_API,     usercontroller.getProductsApi);

// Forgot Password Flow
router.get(ROUTES.USER.FORGOT_PASSWORD, profileController.getForgotPage);
router.post(ROUTES.USER.FORGOT_EMAIL_VALID, profileController.forgotEmailValid);
router.post(ROUTES.USER.VERIFY_FORGOT_OTP, profileController.verifyForgotPassOtp);
router.post(ROUTES.USER.RESEND_FORGOT_OTP, profileController.resendOtp);
router.get(ROUTES.USER.RESET_PASSWORD, profileController.ensureOtpVerified, profileController.getResetPassPage);
router.post(ROUTES.USER.RESET_PASSWORD, profileController.ensureOtpVerified, profileController.resetPassword);

// Privacy & Security
router.get(ROUTES.USER.PRIVACY,                  userAuth, profileController.getPrivacyPage);

// Email change flow
router.post(ROUTES.USER.CHANGE_EMAIL,            userAuth, profileController.requestEmailChange);
router.get(ROUTES.USER.VERIFY_EMAIL_OTP_PAGE,    userAuth, profileController.getVerifyEmailOtpPage);
router.post(ROUTES.USER.VERIFY_EMAIL_OTP,        userAuth, profileController.verifyEmailChangeOtp);
router.post(ROUTES.USER.RESEND_EMAIL_OTP,        userAuth, profileController.resendEmailChangeOtp);

// Password change flow
router.post(ROUTES.USER.VERIFY_CURRENT_PASSWORD, userAuth, profileController.verifyCurrentPassword);
router.get(ROUTES.USER.CHANGE_PASSWORD_PAGE,     userAuth, profileController.getChangePasswordPage);
router.post(ROUTES.USER.CHANGE_PASSWORD,         userAuth, profileController.changePassword);



// Wishlist
router.get(ROUTES.USER.WISHLIST,             userAuth, wishlistController.getWishlistPage);
router.post(ROUTES.USER.ADD_TO_WISHLIST,     userAuth, wishlistController.addToWishlist);
router.post(ROUTES.USER.REMOVE_FROM_WISHLIST, userAuth, wishlistController.removeFromWishlist);
router.post(ROUTES.USER.MOVE_TO_CART,        userAuth, wishlistController.moveToCart);




// Cart
router.get(ROUTES.USER.CART,             userAuth, cartController.getCart);
router.post(ROUTES.USER.ADD_TO_CART,     userAuth, cartController.addToCart);
router.post(ROUTES.USER.UPDATE_CART,     userAuth, cartController.updateQuantity);
router.post(ROUTES.USER.REMOVE_FROM_CART, userAuth, cartController.removeFromCart);



router.get(ROUTES.USER.CHECKOUT,              userAuth, checkoutController.getCheckout);
router.post(ROUTES.USER.CHECKOUT_PLACE_ORDER, userAuth, checkoutController.placeOrder);

router.get(ROUTES.USER.CHECKOUT_COUPONS, userAuth, checkoutController.getUserCoupons);
router.post(ROUTES.USER.CHECKOUT_APPLY_COUPON,userAuth, checkoutController.applyCoupon);
router.get(ROUTES.USER.ORDER_SUCCESS,         userAuth, checkoutController.getOrderSuccess);


router.post(ROUTES.USER.CHECKOUT_RAZORPAY_ORDER, userAuth, checkoutController.createRazorpayOrder);
router.post(ROUTES.USER.CHECKOUT_VERIFY_PAYMENT, userAuth, checkoutController.verifyRazorpayPayment);
router.post(ROUTES.USER.CHECKOUT_PAYMENT_FAILED, userAuth, checkoutController.paymentFailed);

router.get( ROUTES.USER.ORDERS,
    userAuth,
    orderController.getOrders
);
   

router.post(
    ROUTES.USER.ORDER_CANCEL,
    userAuth,
    orderController.cancelOrder
);

router.post(
    ROUTES.USER.ORDER_RETURN,
    userAuth,
    orderController.requestReturn
);
router.get(
    ROUTES.USER.ORDER_DETAILS,
    userAuth,
    orderController.getOrderDetail
);
router.get(ROUTES.USER.WALLET, userAuth, walletController.getWallet);
router.get(
    ROUTES.USER.CHECKOUT_COUPONS,
    userAuth,
    checkoutController.getUserCoupons
);


router.post(ROUTES.USER.ADD_REVIEW, userAuth, addReview);


module.exports = router;