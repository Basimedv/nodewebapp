const User = require("../../models/userSchema");
const nodemailer = require('nodemailer')
const env = require('dotenv').config();
const bcrypt = require('bcrypt')
const pageNotFound = async (req, res) => {
  try {
    res.render('page-404')
  } catch (error) {
    console.log('user error', error)
    res.redirect('/pageNotFound')
  }
}



const loadHomepage = async (req, res) => {
  try {
    res.render('user/home')
  } catch (error) {
    console.log('homepage error', error)
    res.status(500).send('Server error')
  }

};
const loadLandingPage = async (req, res) => {
  try {
    // console.log("Session user:", req.session.user); // debug log

    let userData = null;

    // If session has _id → query by id
    if (req.session.user && req.session.user._id) {
      console.log("Looking up user by ID:", req.session.user._id);
      userData = await User.findById(req.session.user._id).lean();
    }
    // Else if session has email → query by email
    else if (req.session.user && req.session.user.email) {
      console.log("Looking up user by email:", req.session.user.email);
      userData = await User.findOne({ email: req.session.user.email }).lean();
    }

    // ✅ Always render with user (null if not found)
    return res.render("user/landingpage", { user: userData });
  } catch (err) {
    console.error("❌ Homepage error:", err);
    return res.status(500).send("Server error");
  }
};



const loadSignup = async (req, res) => {
  try {
    return res.render('user/signup', {
      msg: req.query.msg,
      type: req.query.type
    });
  } catch (error) {
    console.log('Signup page not found', error);
    res.status(500).send('Server Error');
  }
};

const loadShopping = async (req, res) => {
  try {
    return res.render('user/productListing')
  } catch (error) {
    console.log('shopping page not loading', error)
    res.status(500).send('Server Error')

  }

}








// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,     // ✅ put your Gmail here
        pass: process.env.NODEMAILER_PASSWORD       // ✅ put your Gmail App Password here
      },
    });
    console.log("Using email:", process.env.NODEMAILER_EMAIL);
    console.log("Sending OTP:", otp, "to", email);  // ✅ print OTP here
    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP is ${otp}</b>`

    })

    return info.accepted.length > 0



  } catch (error) {

    console.error('Error sending email', error)
    return false

  }
}
async function handleSendOTP(email) {
  const otp = generateOtp();
  const emailSent = await sendVerificationEmail(email, otp);

  if (emailSent) {
    console.log("OTP sent successfully:", otp);
    return otp; // You may want to store it in DB or session
  } else {
    console.error("Failed to send OTP");
    return null;
  }
}

// Usage
// handleSendOTP("recipient@example.com");













const signup = async (req, res) => {
  try {
    const { fullName, password, phone, email, confirmPassword } = req.body;

    // Password check
    if (password !== confirmPassword) {
      return res.redirect('/signup?msg=Password not match&type=error');
    }

    // Check existing user
    const existing = await User.findOne({ email: email });
    if (existing) {
      return res.redirect('/signup?msg=User already exists&type=error');
    }

    // Generate OTP
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json('email-error');
    }

    // 🔹 Store OTP with expiry (60 seconds)
    req.session.userOtp = {
      code: otp,
      expires: Date.now() + 60 * 1000 // valid for 1 minute
    };

    // 🔹 Store user data temporarily until OTP is verified
    req.session.userData = { fullName, phone, email, password };

    // Show OTP verify page
    res.render('user/verifyOTP', { email: email });

    console.log('OTP sent:', otp);

  } catch (error) {
    console.error('signup', error);
    res.redirect('/pageNotFound');
  }
};



const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error("Password hash error:", error);
    throw error;
  }
}


const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    // check if OTP exists
    if (!req.session.userOtp) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request again."
      });
    }

    const { code, expires } = req.session.userOtp;

    // check expiry (60 seconds)
    if (Date.now() > expires) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please resend."
      });
    }

    // check value
    if (otp.trim() !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP, Please try again"
      });
    }

    // ✅ OTP is valid
    const userData = req.session.userData;
    const passwordHash = await securePassword(userData.password);

    const saveUserData = new User({
      fullName: userData.fullName,
      email: userData.email,
      phone: userData.phone,
      password: passwordHash,
    });

    await saveUserData.save();
    await saveUserData.save();

    req.session.user = {
      _id: saveUserData._id,
      fullName: saveUserData.fullName,
      email: saveUserData.email
    };


    return res.json({ success: true, redirectUrl: "/landingPage" });

  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred"
    });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const otp = generateOtp();
    req.session.userOtp = {
      code: otp,
      expires: Date.now() + 60 * 1000 // ✅ 60 seconds expiry
    };


    // send OTP via email (using nodemailer or your service)
    // await sendVerificationEmail(email, otp);

    console.log("Resent OTP:", otp);

    return res.json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ success: false, message: "Failed to resend OTP" });
  }
};
const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render("user/login", { message: null });
    } else {
      return res.redirect("user/landingPage"); // user home page
    }
  } catch (error) {
    console.error("Error loading user login:", error);
    res.redirect("user/pageNotFound");
  }
};


const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: 0, email: email });

    if (!findUser) {
      return res.render("user/login", { message: "User not found" });
    }

    if (findUser.isBlocked) {
      return res.render("user/login", { message: "User is blocked by admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch) {
      return res.render("user/login", { message: "Incorrect Password" });
    }

    // ✅ Save user in session
    req.session.user = {
      _id: findUser._id,
      email: findUser.email,
      name: findUser.fullName,
    };

    res.redirect("landingPage"); // redirect to home
  } catch (error) {
    console.error("login error", error);
    res.render("user/login", { message: "Login failed, please try again later" });
  }
};
const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log('session destruction error', err.message);
        return res.redirect('user/pageNotFound')
      }
      return res.redirect('login')
    })
  } catch (error) {
    console.log('Logout error', error)
    return res.redirect('user/pageNotFound')
  }
}

 const handleForgotPage = async (req,res) => {
    try{
        const {email} = req.body
        const userEmail = await User.findOne({email})
        if(!userEmail){
            return res.render('user/forgotPassword',{error:'Email not found'})
        }
       // generate OTP

       const otp = Math.floor(1000+Math.random()*9000);
       otpStore.set(email,{ otp, expiresAt: Date.now()+30000})

       //configure nodemailer
       const transporter = nodemailer.createTransport({
        host: 'basimedv7736@gmail.com',
        port: 587,
        secure: false, // Use TLS
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      
       transporter.verify((error) => {
        if (error) {
          console.error('Email transporter configuration error:', error);
        } else {
          console.log('Email transporter is ready');
        }
      });

        //SEND OTP 
        const mailOptions = {
            to:email,
            subject:'U-Craft password Reset OTP',
            html: `<p> Hi ${email} , <br> OTP for password reset is : <strong> ${otp}</strong></p>`
        }
        console.log(otp)
        await transporter.sendMail(mailOptions)
        console.log('OTP sent to :',email)

        res.redirect(`/verifyOTP?email=${email}`)
    }catch(error){
        res.render('user/forgotPassword',{error:`Something Went Wrong ${error.message}`})
    }

}



const showPro = (req, res) => {
  res.render('practise')
}
module.exports = {
  pageNotFound,
  loadHomepage,
  loadShopping,
  loadSignup,
  showPro,
  signup,
  verifyOtp,
  resendOtp,
  loadLogin,
  login,
  loadLandingPage,
  logout,



}
