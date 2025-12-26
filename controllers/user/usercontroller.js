const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const mongoose = require('mongoose');
const Review = require('../../models/reviewSchema');

const nodemailer = require('nodemailer')
const env = require('dotenv').config();
const bcrypt = require('bcrypt')
const pageNotFound = async (req, res) => {
  try {
    res.render('page-404')
  } catch (error) {
    console.log('user error', error)
    res.redirect('user/pageNotFound')
  }

}
const loadHomepage = async (req, res) => {
  try {
    let userData = null;
    if (req.session.user && req.session.user._id) {
      userData = await User.findById(req.session.user._id).lean();
    } else if (req.session.user && req.session.user.email) {
      userData = await User.findOne({ email: req.session.user.email }).lean();
    }

    const products = await Product.find({ status: { $ne: 'Discontinued' } })
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();

    return res.render('user/home', { user: userData, products });
  } catch (error) {
    console.log('homepage error', error);
    res.status(500).send('Server error');
  }
};

const loadLandingPage = async (req, res) => {
  try {
    let userData = null;
    if (req.session.user && req.session.user._id) {
      userData = await User.findById(req.session.user._id).lean();
    } else if (req.session.user && req.session.user.email) {
      userData = await User.findOne({ email: req.session.user.email }).lean();
    }

    // Fetch products with category populated
    const products = await Product.find({ 
      status: "Available",
      isBlocked: false 
    })
      .populate('category')
      .sort({ createdAt: -1 })
      .lean();

    return res.render('user/landingpage', { 
      user: userData, 
      products: products
    });
  } catch (error) {
    console.log('landing page error', error);
    res.status(500).send('Server error');
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
    // Pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 8;
    const skip = (page - 1) * limit;

    // Parse filters from query
    const result = (req.query.result || req.query.q || '').trim();
    const pickArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
    const selectedCategories = pickArray(req.query.category).filter(Boolean);

    const minPrice = Number.parseInt(req.query.minPrice, 10);
    const maxPrice = Number.parseInt(req.query.maxPrice, 10);
    const includeOutOfStock = !!req.query.availability;
    const sortParam = (req.query.sort || 'newest').trim();

    // Build Mongo filter
    const filter = {};
    // Exclude admin-blocked products always
    filter.isBlocked = { $ne: true };
    // Availability: exclude discontinued always; include only Available unless availability checked
    const allowedStatuses = includeOutOfStock ? ['Available', 'out of stock'] : ['Available'];
    filter.status = { $in: allowedStatuses };

    // Text search by name - FIXED TYPO
    if (result) {
      filter.productName = { $regex: result, $options: 'i' };
    }

    // Category filter: UI sends names; map to ids
    let categoriesList = await Category.find({ isListed: true }).lean();
    if (selectedCategories.length) {
      const matchCats = categoriesList.filter(c => selectedCategories.includes(c.name));
      if (matchCats.length) {
        filter.category = { $in: matchCats.map(c => c._id) };
      } else {
        // No matching categories => no products
        filter.category = { $in: [] };
      }
    }

    // Price filter
    const andConds = [];
    if (!Number.isNaN(minPrice) && minPrice > 0) {
      andConds.push({ 
        $or: [ 
          { regularPrice: { $gte: minPrice } }, 
          { price: { $gte: minPrice } } 
        ] 
      });
    }
    if (!Number.isNaN(maxPrice) && maxPrice > 0) {
      andConds.push({ 
        $or: [ 
          { regularPrice: { $lte: maxPrice } }, 
          { price: { $lte: maxPrice } } 
        ] 
      });
    }
    // Never include discontinued
    andConds.push({ status: { $ne: 'Discountinued' } });
    if (andConds.length) {
      // Merge into filter with $and if needed
      if (filter.$and) filter.$and.push(...andConds); 
      else filter.$and = andConds;
    }

    // Sorting - FIXED TYPO
    let sortObj = { createdAt: -1 };
    switch (sortParam) {
      case 'priceLowToHigh':
        sortObj = { regularPrice: 1, price: 1, createdAt: -1 };
        break;
      case 'priceHighToLow':
        sortObj = { regularPrice: -1, price: -1, createdAt: -1 };
        break;
      case 'aToZ':
        sortObj = { productName: 1 };
        break;
      case 'zToA':
        sortObj = { productName: -1 };
        break;
      case 'ratingHighToLow':
        // Placeholder: if rating not stored, fallback to newest
        sortObj = { createdAt: -1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
    }

    const [itemsRaw, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'offer')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    // Normalize fields for the view
    const items = (itemsRaw || []).map(p => {
      const regular = Number(p.regularPrice || p.price || 0);
      const sale = Number(p.salePrice || 0);
      const offerPercent = Math.max(
        p.productOffer || 0, 
        (p.category && p.category.offer) || 0
      );
      const offerPrice = offerPercent > 0 
        ? Math.round(regular - (regular * offerPercent / 100)) 
        : (sale > 0 && sale < regular ? sale : regular);
      
      return {
        ...p,
        name: p.productName ?? p.name,
        images: Array.isArray(p.productImage) && p.productImage.length 
          ? p.productImage 
          : (Array.isArray(p.images) ? p.images : []),
        regularPrice: regular,
        salePrice: sale,
        offerPercent,
        offerPrice,
      };
    });

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const appliedFilters = {
      result,
      category: selectedCategories,
      minPrice: !Number.isNaN(minPrice) && minPrice > 0 ? String(minPrice) : '',
      maxPrice: !Number.isNaN(maxPrice) && maxPrice > 0 ? String(maxPrice) : '',
      availability: includeOutOfStock ? 'outOfStock' : '',
      sort: sortParam || 'newest',
    };
    const sortOption = appliedFilters.sort;

    return res.render('user/productListing', {
      products: items,
      q: result,
      currentPage: page,
      totalPages,
      total,
      user: req.session && req.session.user ? req.session.user : null,
      category: categoriesList || [],
      appliedFilters,
      sortOption,
    });
  } catch (error) {
    console.log('shopping page not loading', error);
    res.status(500).send('Server Error');
  }
};






// Product details page
async function getProductDetails(req, res) {
  try {
    const id = req.params.id;
    
    // ✅ Populate category with name and offer
    const p = await Product.findById(id)
      .populate('category', 'name offer')  // ✅ Added 'name' to get category name
      .lean();
      
    if (!p) return res.status(404).render('user/page-404');
    
    // Hide blocked or discontinued products from public
    if (p.isBlocked === true || p.status === 'Discountinued') {
      return res.status(404).render('user/page-404');
    }

    const regular = typeof p.regularPrice === 'number' ? p.regularPrice : (typeof p.price === 'number' ? p.price : 0);
    const sale = typeof p.salePrice === 'number' ? p.salePrice : 0;
    const offerPercent = Math.max(p.productOffer || 0, (p.category && p.category.offer) || 0);
    const offerPrice = offerPercent > 0 ? Math.round(regular - (regular * offerPercent / 100)) : (sale > 0 && sale < regular ? sale : regular);

    const product = {
      ...p,
      name: p.productNmae ?? p.name,
      images: Array.isArray(p.productImage) && p.productImage.length ? p.productImage : (Array.isArray(p.images) ? p.images : []),
      price: regular,
      sale,
      offerPercent,
      offerPrice,
      regularPrice: regular,
      categoryName: p.category?.name || 'Uncategorized',  // ✅ Added category name
    };

    // ✅ Fetch reviews for this product
    const reviews = await Review.find({ productId: id })
      .sort({ createdAt: -1 })  // Newest first
      .lean();
    
    // ✅ Calculate average rating
    const averageRating = reviews.length > 0 
      ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
      : 0;

    return res.render('user/productDetails', { 
      user: req.session?.user || null, 
      product,
      reviews,              // ✅ Pass reviews
      reviewCount: reviews.length,
      averageRating
    });
    
  } catch (err) {
    console.error('getProductDetails error:', err);
    return res.status(500).render('user/page-404');
  }
}




// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
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
    req.session.userOtp = otp; // ✅ Store as simple string like profileController
    req.session.otpExpiresAt = Date.now() + 60 * 1000; // 1 minute expiry

    // 🔹 Store user data temporarily until OTP is verified
    req.session.userData = { fullName, phone, email, password };
    // also persist email separately to support resend in case userData is pruned by store
    req.session.email = email;

    // Show OTP verify page
    res.render('user/verifyOTP', { email: email, type: 'signup' });

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

    // check expiry
    if (req.session.otpExpiresAt && Date.now() > req.session.otpExpiresAt) {
      return res.status(400).json({ success: false, expired: true, message: "OTP expired. Please resend and try again." });
    }
    // check value - now expecting simple string
    if (otp.trim() !== req.session.userOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP, Please try again"
      });
    }

    // ✅ OTP is valid
    const userData = req.session.userData;
    if (!userData || !userData.email || !userData.password) {
      return res.status(400).json({ success: false, message: "Session expired. Please redo signup." });
    }
    const passwordHash = await securePassword(userData.password);

    const saveUserData = new User({
      fullName: userData.fullName,
      email: userData.email,
      phone: userData.phone,
      password: passwordHash,
    });

    await saveUserData.save();

    req.session.user = {
      _id: saveUserData._id,
      fullName: saveUserData.fullName,
      email: saveUserData.email
    };

    // clear OTP after success
    req.session.userOtp = null;
    req.session.otpExpiresAt = null;
    return res.json({ success: true, redirectUrl: "/landingPage" });

  } catch (error) {
    console.error("Error verifying OTP:", error);
    const msg = (error && error.code === 11000)
      ? "Account already exists for this email. Please login."
      : "Server error during verification. Please try again.";
    return res.status(500).json({ success: false, message: msg });
  }
};

const resendOtp = async (req, res) => {
  try {
    const email = (req.session.userData && req.session.userData.email) || req.session.email || req.body.email;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email not found. Please request again." });
    }

    const otp = generateOtp();
    req.session.userOtp = null; // Clear any existing OTP
    req.session.userOtp = otp; // ✅ Store as simple string like profileController
    req.session.otpExpiresAt = Date.now() + 60 * 1000; // refresh 1 minute expiry for new OTP

    // send OTP via email (using nodemailer or your service)
    await sendVerificationEmail(email, otp);

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

    // ✅ Save user in session with consistent property name
    req.session.user = {
      _id: findUser._id,
      email: findUser.email,
      fullName: findUser.fullName,  // ✅ Changed to 'fullName'
    };

    // ✅ Explicitly save the session
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.render("user/login", { message: "Session error, please try again" });
      }
      res.redirect("/user/landingPage");  // ✅ Added leading slash for proper redirect
    });

  } catch (error) {
    console.error("login error", error);
    res.render("user/login", { message: "Login failed, please try again later" });
  }
};
const logout = async (req, res) => {
  try {
    // Only clear user session data, preserving admin session if it exists
    delete req.session.user;
    req.session.save(() => {
      return res.redirect('/');
    });
  } catch (error) {
    console.log('Logout error', error);
    return res.redirect('user/pageNotFound');
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

       // Store OTP in session instead of undefined otpStore
       req.session.userOtp = otp;
       req.session.email = email;

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
            subject:'COLINGUEST password Reset OTP',
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

// JSON API: /api/products?q=&page=&limit=&category=&exclude=&brand=
async function apiProducts(req, res){
  try{
    const q = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 48);
    const skip = (page - 1) * limit;

    // Get category filter from query params
    const categoryIds = (req.query.category || '').split(',').filter(Boolean);
    const brandNames = (req.query.brand || '').split(',').filter(Boolean);
    const excludeIds = (req.query.exclude || '').split(',').filter(Boolean);

    const filter = { status: { $ne: 'Discountinued' }, isBlocked: { $ne: true } };

    // Text search by name/brand
    if (q) {
      filter.$or = [
        { productNmae: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
      ];
    }

    // Category filter
    if (categoryIds.length) {
      filter.category = { $in: categoryIds };
    }

    // Brand filter
    if (brandNames.length) {
      filter.brand = { $in: brandNames };
    }

    // Exclude specific products
    if (excludeIds.length) {
      filter._id = { $nin: excludeIds };
    }

    const [itemsRaw, total] = await Promise.all([
      Product.find(filter).populate('category', 'offer').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    const items = (itemsRaw || []).map(p => {
      const regular = typeof p.regularPrice
 === 'number' ? p.regularPrice
 : (typeof p.price === 'number' ? p.price : 0);
      const sale = typeof p.salePrice === 'number' ? p.salePrice : 0;
      const offerPercent = Math.max(p.productOffer || 0, (p.category && p.category.offer) || 0);
      const offerPrice = offerPercent > 0 ? Math.round(regular - (regular * offerPercent / 100)) : (sale > 0 && sale < regular ? sale : regular);
      return {
        ...p,
        name: p.productNmae ?? p.name,
        images: Array.isArray(p.productImage) && p.productImage.length ? p.productImage : (Array.isArray(p.images) ? p.images : []),
        price: regular,
        sale,
        offerPercent,
        offerPrice,
        regularPrice: regular,
      };
    });
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ products: items, page, totalPages, total });
  } catch (err){
    console.error('apiProducts error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
// // View wishlist
// async function viewWishlist(req, res) {
//   try {
//     const user = req.session?.user || null;
//     if (!user) return res.redirect('/login');

//     const wishlist = await Wishlist.findOne({ userId: user._id }).populate('products.ProductId').lean();
//     const items = (wishlist?.products || []).map(item => ({
//       ...item,
//       product: item.ProductId,
//     }));

//     return res.render('user/wishlist', { user, items });
//   } catch (err) {
//     console.error('viewWishlist error:', err);
//     return res.status(500).render('user/page-404');
//   }
// }

// // Add to wishlist
// async function addToWishlist(req, res) {
//   try {
//     const { userId, productId } = req.body;
//     if (!userId) return res.status(401).json({ error: 'Not authenticated' });
//     if (!productId) return res.status(400).json({ error: 'Missing product' });

//     let wl = await Wishlist.findOne({ userId });
//     if (!wl) wl = new Wishlist({ userId, products: [] });

//     const exists = wl.products.some(p => String(p.ProductId) === String(productId));
//     if (exists) {
//       return res.status(200).json({ message: 'Already in wishlist' });
//     }
//     wl.products.push({ ProductId: productId });
//     await wl.save();
//     return res.status(200).json({ message: 'Added to wishlist' });
//   } catch (err) {
//     console.error('addToWishlist error:', err);
//     return res.status(500).json({ error: 'Server error' });
//   }
// }

// // Remove from wishlist
// async function removeFromWishlist(req, res) {
//   try {
//     const user = req.session?.user || null;
//     if (!user) return res.status(401).json({ error: 'Not authenticated' });
//     const { productId } = req.body;
//     if (!productId) return res.status(400).json({ error: 'Missing product' });

//     const wishlist = await Wishlist.findOne({ userId: user._id });
//     if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });

//     const before = wishlist.products.length;
//     wishlist.products = wishlist.products.filter(p => String(p.ProductId) !== String(productId));
//     if (wishlist.products.length === before) {
//       return res.status(404).json({ error: 'Item not found in wishlist' });
//     }
//     await wishlist.save();
//     return res.status(200).json({ message: 'Removed from wishlist' });
//   } catch (err) {
//     console.error('removeFromWishlist error:', err);
//     return res.status(500).json({ error: 'Server error' });
//   }
// }
 const addReview = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const userName = req.session.user?.fullName;
        const productId = req.params.id;
        const { rating, comment } = req.body;

        if (!userId || !userName) {
            return res.status(400).json({ error: "User not logged in" });
        }

        const review = new Review({
            userId,
            productId,
            userName,
            rating: Number(rating),
            comment
        });

        await review.save();
        
        // ✅ Correct redirect - matches your route
        res.redirect(`/productDetails/${productId}`);

    } catch (error) {
        console.error("Review Error:", error);
        res.status(500).send("Server Error Adding Review");
    }
};
module.exports = {
  addReview,
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
  getProductDetails,
  // addToWishlist,
  // viewWishlist,
  // removeFromWishlist,
  apiProducts,
  handleForgotPage,
}
  

