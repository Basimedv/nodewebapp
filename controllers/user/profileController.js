const User = require('../../models/userSchema');
const HTTP_STATUS_CODES = require("../../constants/status_codes");

const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { ROUTES } = require('../../constants/routes');
require('dotenv').config();


const getProfilePage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect(ROUTES.USER.LOGIN);
    }
    const user = await User.findById(req.session.user._id);
    if (!user) {
      req.session.destroy();
      return res.redirect(ROUTES.USER.LOGIN);
    }
    res.render('user/profile', { user, title: 'My Profile' });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};


const getEditProfilePage = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect(ROUTES.USER.LOGIN);
    const user = await User.findById(req.session.user._id);
    res.render("user/editProfile", { user, title: 'Edit Profile' });
  } catch (error) {
    console.error('Error loading edit profile:', error);
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};


function generateOtp() {
  const digits = '1234567890';
  let otp = "";
  for (let i = 0; i < 4; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}


const getForgotPage = (req, res) => {
  try {
    res.render('user/forgotPassword', { error: null });
  } catch (error) {
    console.error(error);
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};


const ensureOtpVerified = (req, res, next) => {
  try {
    if (req.session && req.session.otpVerified && req.session.email) {
      return next();
    }
    return res.redirect(ROUTES.USER.FORGOT_PASSWORD);
  } catch (e) {
    return res.redirect(ROUTES.USER.FORGOT_PASSWORD);
  }
};


const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Your OTP for verification",
      text: `Your OTP is ${otp}`,
      html: `<b><h4>Your OTP: ${otp}</h4><p>This OTP expires in 2 minutes.</p></b>`
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
};

// Handle Forgot Email Validation
const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.render('user/forgotPassword', { error: "Please enter a valid email address." });
    }

    const findUser = await User.findOne({ email });
    if (!findUser) {
      return res.render('user/forgotPassword', { error: "User with this email does not exist." });
    }

    const otp = generateOtp();
    console.log('OTP:', otp);
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render('user/forgotPassword', { error: "Failed to send OTP. Please try again." });
    }

    req.session.userOtp = otp;
    req.session.email = email;
    req.session.otpExpiresAt = Date.now() + 2 * 60 * 1000;

    res.render('user/verifyOTP', { email, error: null, type: 'forgot' });
  } catch (err) {
    console.error(err);
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

// Verify OTP (Forgot Password)
const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (!req.session.userOtp) {
      return res.json({ success: false, message: "No OTP found. Please resend." });
    }
    if (req.session.otpExpiresAt && Date.now() > req.session.otpExpiresAt) {
      return res.json({ success: false, expired: true, message: "OTP expired. Please resend and try again." });
    }
    if (enteredOtp === req.session.userOtp) {
      req.session.otpVerified = true;
      req.session.userOtp = null;
      req.session.otpExpiresAt = null;
      res.json({ success: true, redirect: ROUTES.USER.RESET_PASSWORD });
    } else {
      res.json({ success: false, message: "Invalid OTP, Please try again" });
    }
  } catch (error) {
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "An error occurred. Please try again" });
  }
};

const getResetPassPage = async (req, res) => {
  try {
    res.render('user/resetPassword', { error: null, success: null, formType: 'reset' });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const email = req.session.email;

    if (!email) {
      return res.json({ success: false, message: "Session expired. Please try again." });
    }
    if (password !== confirmPassword) {
      return res.json({ success: false, message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findOneAndUpdate({ email }, { $set: { password: hashedPassword } });

    req.session.email = null;
    req.session.otpVerified = null;
    req.session.userOtp = null;
    req.session.otpExpiresAt = null;

    res.json({ success: true, redirect: ROUTES.USER.LOGIN });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.json({ success: false, message: "Something went wrong. Please try again." });
  }
};

// Resend OTP
const resendOtp = async (req, res) => {
  try {
    const email = req.session.email || req.body.email;
    if (!email) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Email not found. Please try again." });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to resend OTP. Try again." });
    }

    req.session.userOtp = otp;
    req.session.otpExpiresAt = Date.now() + 2 * 60 * 1000;
    console.log("Resent OTP:", otp);

    res.json({ success: true, message: "New OTP sent!" });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { firstName, lastName, phone, username, gender } = req.body;

    const updateData = {
      fullName: `${firstName} ${lastName}`.trim(),
      gender: gender || "",
      phone: (phone && phone.trim()) ? phone.trim() : undefined,
      username: (username && username.trim()) ? username.trim() : undefined
    };

    if (req.file) {
      updateData.profileImage = req.file.path;
    }

    await User.findByIdAndUpdate(userId, { $set: updateData });
    res.json({ success: true, message: 'Profile updated!' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(HTTP_STATUS_CODES.CONFLICT).json({ success: false, message: 'Username or Phone already taken' });
    }
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
  }
};

const deleteProfileImage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    await User.findByIdAndUpdate(userId, { $set: { profileImage: null } });
    res.json({ success: true, message: 'Photo removed successfully' });
  } catch (error) {
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error removing photo' });
  }
};

// Get Privacy Page
const getPrivacyPage = async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    const isGoogleUser = !!(user.googleId && user.googleId.trim() !== "");
    res.render('user/privacy', { user, isGoogleUser, activePage: 'privacy' });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

// EMAIL CHANGE — Step 1: Send OTP to new email
const requestEmailChange = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const user = await User.findById(req.session.user._id);

    if (user.googleId && user.googleId.trim() !== "") {
      return res.json({ success: false, message: "Google accounts cannot change email here." });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(newEmail)) {
      return res.json({ success: false, message: "Please enter a valid email address." });
    }

    if (newEmail === user.email) {
      return res.json({ success: false, message: "This is already your current email." });
    }

    const exists = await User.findOne({ email: newEmail });
    if (exists) return res.json({ success: false, message: "Email already in use by another account." });

    const otp = generateOtp();
    console.log("Email change OTP:", otp);

    const emailSent = await sendVerificationEmail(newEmail, otp);
    if (!emailSent) return res.json({ success: false, message: "Failed to send OTP. Try again." });

    // Store in session — do NOT update DB yet
    req.session.pendingEmail = newEmail;
    req.session.emailChangeOtp = otp;
    req.session.emailOtpExpiresAt = Date.now() + 2 * 60 * 1000;
    req.session.emailChangeType = 'email_change'; // so OTP page knows the flow

    res.json({ success: true, message: "OTP sent!", redirect: ROUTES.USER.VERIFY_EMAIL_OTP_PAGE });
  } catch (error) {
    console.error("Email change request error:", error);
    res.json({ success: false, message: "Error sending OTP." });
  }
};

// EMAIL CHANGE — OTP page (reusing verifyOTP.ejs)
const getVerifyEmailOtpPage = (req, res) => {
  try {
    if (!req.session.pendingEmail) {
      return res.redirect(ROUTES.USER.PRIVACY);
    }
    res.render('user/verifyOTP', {
      email: req.session.pendingEmail,
      type: 'email_change',
      error: null
    });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

// EMAIL CHANGE — Step 2: Verify OTP → update DB
const verifyEmailChangeOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.emailChangeOtp || !req.session.pendingEmail) {
      return res.json({ success: false, message: "Session expired. Please start again." });
    }

    if (Date.now() > req.session.emailOtpExpiresAt) {
      req.session.emailChangeOtp = null;
      req.session.pendingEmail = null;
      req.session.emailOtpExpiresAt = null;
      return res.json({ success: false, expired: true, message: "OTP expired. Please resend." });
    }

    if (otp !== req.session.emailChangeOtp) {
      return res.json({ success: false, message: "Invalid OTP. Please try again." });
    }

    // OTP correct — now update email in DB
    await User.findByIdAndUpdate(req.session.user._id, { email: req.session.pendingEmail });
    req.session.user.email = req.session.pendingEmail;

    // Clear temp session data
    req.session.pendingEmail = null;
    req.session.emailChangeOtp = null;
    req.session.emailOtpExpiresAt = null;
    req.session.emailChangeType = null;

    res.json({ success: true, message: "Email updated successfully!", redirect: ROUTES.USER.PRIVACY });
  } catch (error) {
    console.error("Email OTP verify error:", error);
    res.json({ success: false, message: "Error verifying OTP." });
  }
};

// EMAIL CHANGE — Resend OTP
const resendEmailChangeOtp = async (req, res) => {
  try {
    const pendingEmail = req.session.pendingEmail;
    if (!pendingEmail) {
      return res.json({ success: false, message: "Session expired. Please start again." });
    }

    const otp = generateOtp();
    console.log("Resent email change OTP:", otp);

    const emailSent = await sendVerificationEmail(pendingEmail, otp);
    if (!emailSent) return res.json({ success: false, message: "Failed to resend OTP. Try again." });

    req.session.emailChangeOtp = otp;
    req.session.emailOtpExpiresAt = Date.now() + 2 * 60 * 1000;

    res.json({ success: true, message: "New OTP sent!" });
  } catch (error) {
    console.error("Resend email OTP error:", error);
    res.json({ success: false, message: "Something went wrong." });
  }
};

// PASSWORD CHANGE — Step 1: Verify current password → redirect to reset page
const verifyCurrentPassword = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const user = await User.findById(req.session.user._id);

    if (!user) return res.json({ success: false, message: "User not found." });

    if (user.googleId && user.googleId.trim() !== "") {
      return res.json({ success: false, message: "Google accounts manage passwords via Google." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Current password is incorrect." });
    }

    // Set session flag — allows access to change password page
    req.session.passwordVerified = true;

    res.json({ success: true, redirect: ROUTES.USER.CHANGE_PASSWORD_PAGE });
  } catch (error) {
    console.error("Verify password error:", error);
    res.json({ success: false, message: "An error occurred. Please try again." });
  }
};

const getChangePasswordPage = (req, res) => {
  try {
    if (!req.session.passwordVerified) {
      return res.redirect(ROUTES.USER.PRIVACY);
    }
    res.render('user/resetPassword', { error: null, success: null, formType: 'change' });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

// PASSWORD CHANGE — Step 2: Save new password
const changePassword = async (req, res) => {
  try {
    if (!req.session.passwordVerified) {
      return res.json({ success: false, message: "Please verify your current password first." });
    }

    const { password, confirmPassword } = req.body;

    if (!password || password.length < 8) {
      return res.json({ success: false, message: "Password must be at least 8 characters." });
    }

    if (password !== confirmPassword) {
      return res.json({ success: false, message: "Passwords do not match." });
    }

    const user = await User.findById(req.session.user._id);
    user.password = await bcrypt.hash(password, 10);
    await user.save();

    // Clear session flag
    req.session.passwordVerified = null;

    res.json({ success: true, message: "Password updated successfully!", redirect: ROUTES.USER.LOGIN });
  } catch (error) {
    console.error("Password change error:", error);
    res.json({ success: false, message: "An internal error occurred." });
  }
};
module.exports = {
  getProfilePage,
  getEditProfilePage,
  getForgotPage,
  forgotEmailValid,
  getResetPassPage,
  verifyForgotPassOtp,
  resetPassword,
  resendOtp,
  ensureOtpVerified,
  updateProfile,
  deleteProfileImage,
  getPrivacyPage,
  requestEmailChange,
   getVerifyEmailOtpPage, 
  verifyEmailChangeOtp,
  resendEmailChangeOtp,
  verifyCurrentPassword,
  getChangePasswordPage, 
  changePassword
};