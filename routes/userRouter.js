const express = require('express');
const router = express.Router();
const usercontroller = require('../controllers/user/usercontroller');
const profileController = require('../controllers/user/profileController');
const addresscontroller = require('../controllers/user/addresscontroller');
const { userAuth, isGuest } = require('../middlewares/auth');
const { uploadProfile } = require('../config/cloudinary');
const { ROUTES } = require('../constants/routes');

// Public Pages
router.get(ROUTES.USER.HOME, usercontroller.loadHomepage);
router.get(ROUTES.USER.PAGE_ERROR, usercontroller.pageNotFound);


router.get(ROUTES.USER.SIGNUP, isGuest, usercontroller.loadSignup);
router.post(ROUTES.USER.SIGNUP, isGuest, usercontroller.signup);
router.post(ROUTES.USER.VERIFY_OTP, usercontroller.verifyOtp);
router.post(ROUTES.USER.RESEND_OTP, usercontroller.resendOtp);

router.get(ROUTES.USER.LOGIN, isGuest, usercontroller.loadLogin);
router.post(ROUTES.USER.LOGIN, isGuest, usercontroller.login);


router.get(ROUTES.USER.LANDING_PAGE, userAuth, usercontroller.loadLandingPage);
router.get(ROUTES.USER.LOGOUT, usercontroller.logout);

// Profile Management
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


module.exports = router;