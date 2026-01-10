const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Get Profile Page
const getProfilePage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const user = await User.findById(req.session.user._id);
    res.render('user/profile', { 
      user: user,
      title: 'My Profile'
    });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.redirect('/pageNotFound');
  }
};

// Get Edit Profile Page
const getEditProfilePage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const user = await User.findById(req.session.user._id);
    res.render('user/editProfile', { 
      user: user,
      title: 'Edit Profile'
    });
  } catch (error) {
    console.error('Error loading edit profile:', error);
    res.redirect('/pageNotFound');
  }
};

// Generate 4-digit OTP
function generateOtp() {
  const digits = '1234567890';
  let otp = "";
  for (let i = 0; i < 4; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

// Render Forgot Password Page
const getForgotPage = (req, res) => {
  try {
    res.render('user/forgotPassword', { error: null });
  } catch (error) {
    console.error(error);
    res.redirect('/user/pageNotFound');
  }
};


// Middleware: ensure OTP verified before allowing reset password
const ensureOtpVerified = (req, res, next) => {
  try {
    if (req.session && req.session.otpVerified && req.session.email) {
      return next();
    }
    return res.redirect('/forgotPassword');
  } catch (e) {
    return res.redirect('/forgotPassword');
  }
};

// Send Verification Email
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
      subject: "Your OTP for password reset",
      text: `Your OTP is ${otp}`,
      html: `<b><h4>Your OTP: ${otp}</h4></b>`
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

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.render('user/forgotPassword', {
        error: "Please enter a valid email address."
      });
    }

    const findUser = await User.findOne({ email });

    if (!findUser) {
      // Send error message to EJS
      return res.render('user/forgotPassword', {
        error: "User with this email does not exist."
      });
    }

    // If user exists, generate OTP & continue...
    const otp = generateOtp();
    console.log('OTP:',otp)
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render('user/forgotPassword', {
        error: "Failed to send OTP. Please try again."
      });
    }

    req.session.userOtp = otp;
    req.session.email = email;
    req.session.otpExpiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes

    res.render('user/verifyOTP', { email, error: null, type: 'forgot' });

  } catch (err) {
    console.error(err);
    res.redirect('/user/pageNotFound');
  }
};


// Verify OTP
const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    // Check presence
    if (!req.session.userOtp) {
      return res.json({ success: false, message: "No OTP found. Please resend." });
    }
    // Check expiry
    if (req.session.otpExpiresAt && Date.now() > req.session.otpExpiresAt) {
      return res.json({ success: false, expired: true, message: "OTP expired. Please resend and try again." });
    }
    if (enteredOtp === req.session.userOtp) {
      // Mark session as OTP-verified for reset flow and clear OTP
      req.session.otpVerified = true;
      req.session.userOtp = null;
      req.session.otpExpiresAt = null;
      // Redirect to reset password page
      res.json({ success: true, redirect: '/resetpassword' });
    } else {
      res.json({ success: false, message: "Invalid OTP, Please try again" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "An error occurred. Please try again" });
  }
};

// Reset Password Page
const getResetPassPage = async (req, res) => {
  try {
    // ✅ FIXED: Correct view path
    res.render('user/resetPassword', { error: null, success: null });
  } catch (error) {
    res.redirect('/user/pageNotFound');
  }
};
const resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const email = req.session.email; // stored earlier in OTP step

    if (!email) {
      return res.json({ success: false, message: "Session expired. Please try again." });
    }

    if (password !== confirmPassword) {
      return res.json({ success: false, message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.findOneAndUpdate(
      { email },
      { $set: { password: hashedPassword } }
    );

    req.session.email = null;
    req.session.otpVerified = null;
    req.session.userOtp = null;
    req.session.otpExpiresAt = null;

    // Success: send JSON with redirect URL
    res.json({ success: true, redirect: '/login' });

  } catch (error) {
    console.error("Error resetting password:", error);
    res.json({ success: false, message: "Something went wrong. Please try again." });
  }
};


// ======================
// 6. Resend OTP
// ======================
const resendOtp = async (req, res) => {
  try {
    const email = req.session.email || req.body.email;

    if (!email) {
      return res.status(400).json({ success: false, message: "❌ Email not found. Please try again." });
    }

    // Generate new OTP
    const otp = generateOtp();
    console.log('ResendOTP:',otp)

    // Send OTP email
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "❌ Failed to resend OTP. Try again." });
    }

    // Clear old OTP and save new OTP in session
    req.session.userOtp = null; // Clear any existing OTP
    req.session.userOtp = otp;
    console.log("Resent OTP:", otp);

    // Return success JSON
    res.json({ success: true, message: "✅ New OTP sent!" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
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
};
