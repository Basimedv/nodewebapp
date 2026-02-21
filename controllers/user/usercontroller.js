// controllers/user/userController.js
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const { generateOtp, securePassword, sendVerificationEmail } = require("../../utils/authHelper");
const bcrypt = require('bcrypt');
const HTTP_STATUS_CODES = require("../../constants/status_codes");
const { ROUTES } = require("../../constants/routes");

// 🟢 404 Page
const pageNotFound = async (req, res) => {
  res.render("user/pageNotFound", { user: req.session.user || null });
};

// 🟢 Home Page
const loadHomepage = async (req, res) => {
  try {
    const userData = req.session.user || null;
    res.render('user/home', { user: userData });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

// 🟢 Landing Page
const loadLandingPage = async (req, res) => {
  try {
    const userData = req.session.user || null;
    res.render("user/landingpage", { user: userData });
  } catch (err) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

// --- Signup & OTP Logic ---

// 🟢 Load Signup
const loadSignup = (req, res) => {
  if (req.session.user) return res.redirect(ROUTES.USER.LANDING_PAGE);
  res.render('user/signup', { msg: req.query.msg, type: req.query.type });
};

const signup = async (req, res) => {
  try {
    const { fullName, email, phone, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.redirect(`${ROUTES.USER.SIGNUP}?msg=Passwords do not match&type=error`);
    }

    if (await User.findOne({ email })) {
      return res.redirect(`${ROUTES.USER.SIGNUP}?msg=User already exists&type=error`);
    }

    const otp = generateOtp();
    console.log("Generated OTP:", otp); 
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) return res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).send("Email failed");

    req.session.userOtp = otp;
    req.session.otpExpiresAt = Date.now() + 60000;
    req.session.userData = { fullName, email, phone, password };

    // Rendering view file path
    res.render('user/verifyOTP', { email, type: 'signup' });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const { userOtp, otpExpiresAt, userData } = req.session;

    if (!userOtp || Date.now() > otpExpiresAt) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({ success: false, message: "OTP expired" });
    }
    if (otp.trim() !== userOtp) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid OTP" });
    }

    const passwordHash = await securePassword(userData.password);
    const newUser = await User.create({
      fullName: userData.fullName,
      email: userData.email,
      phone: userData.phone,
      password: passwordHash
    });

    req.session.user = { _id: newUser._id, fullName: newUser.fullName, email: newUser.email };
    
    // Using constant for JSON response redirect
    res.json({ success: true, redirectUrl: ROUTES.USER.LANDING_PAGE });
  } catch (error) {
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Verification failed" });
  }
};

// 🟢 Resend OTP
const resendOtp = async (req, res) => {
  try {
    const email = req.session.userData?.email || req.session.email;
    if (!email) return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Email not found" });

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpExpiresAt = Date.now() + 60000;

    await sendVerificationEmail(email, otp);
    res.json({ success: true, message: "OTP resent" });
  } catch (error) {
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to resend OTP" });
  }
};

// --- Login & Logout ---

// 🟢 Load Login
const loadLogin = (req, res) => {
  if (req.session.user) return res.redirect(ROUTES.USER.LANDING_PAGE);
  res.render("user/login", { message: null });
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isAdmin: false });

    if (!user || user.isBlocked) {
      return res.render("user/login", { message: "Access denied or user not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.render("user/login", { message: "Incorrect password" });

    // SET SESSION
    req.session.user = { _id: user._id, email: user.email, name: user.fullName };
    
    // SAVE SESSION EXPLICITLY
    req.session.save((err) => {
        if (err) return next(err);
        res.redirect(ROUTES.USER.LANDING_PAGE);
    });
  } catch (error) {
    res.render("user/login", { message: "Login failed" });
  }
};

// 🟢 Logout
const logout = (req, res) => {
  delete req.session.user;
  req.session.save(() => res.redirect(ROUTES.USER.HOME));
};

module.exports = {
  pageNotFound,
  loadHomepage,
  loadLandingPage,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  loadLogin,
  login,
  logout
};