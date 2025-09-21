const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Generate 6-digit OTP
function generateOtp() {
  const digits = '1234567890';
  let otp = "";
  for (let i = 0; i < 6; i++) {
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
    const findUser = await User.findOne({ email });

    if (!findUser) {
      // Send error message to EJS
      return res.render('user/forgotPassword', { 
        error: "❌ User with this email does not exist." 
      });
    }

    // If user exists, generate OTP & continue...
    const otp = generateOtp();
    console.log('OTP:',otp)
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render('user/forgotPassword', {
        error: "❌ Failed to send OTP. Please try again."
      });
    }

    req.session.userOtp = otp;
    req.session.email = email;

    res.render('user/verifyPasswordOTP', { email, error: null });

  } catch (err) {
    console.error(err);
    res.redirect('/user/pageNotFound');
  }
};


// Verify OTP
const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.userOtp) {
      // ✅ FIXED: Correct redirect
      res.json({ success: true, redirect: '/resetpassword' });
    } else {
      res.json({ success: false, message: "OTP not matching" });
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

    // Save new OTP in session
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
  getForgotPage,
  forgotEmailValid,
  getResetPassPage,
  verifyForgotPassOtp,
  resetPassword,
  resendOtp,
};
