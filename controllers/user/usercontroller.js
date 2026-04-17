// controllers/user/userController.js
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const { generateOtp, securePassword, sendVerificationEmail } = require("../../utils/authHelper");
const bcrypt = require('bcrypt');
const HTTP_STATUS_CODES = require("../../constants/status_codes");
const { ROUTES } = require("../../constants/routes");


const pageNotFound = async (req, res) => {
  res.render("user/pageNotFound", { user: req.session.user || null });
};


const loadHomepage = async (req, res) => {
  try {
    const userData = req.session.user || null;
    res.render('user/home', { user: userData });
  } catch (error) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};


const loadLandingPage = async (req, res) => {
  try {
    const userData = req.session.user || null;
    res.render("user/landingpage", { user: userData });
  } catch (err) {
    res.redirect(ROUTES.USER.PAGE_ERROR);
  }
};




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


    res.json({ success: true, redirectUrl: ROUTES.USER.LANDING_PAGE });
  } catch (error) {
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Verification failed" });
  }
};


const resendOtp = async (req, res) => {
  try {
    const email = req.session.userData?.email || req.session.email;
    if (!email) return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({ success: false, message: "Email not found" });

    const otp = generateOtp();
    console.log("Resend OTP :", otp);
    req.session.userOtp = otp;
    req.session.otpExpiresAt = Date.now() + 60000;

    await sendVerificationEmail(email, otp);
    res.json({ success: true, message: "OTP resent" });
  } catch (error) {
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to resend OTP" });
  }
};




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


    req.session.user = { _id: user._id, email: user.email, name: user.fullName };


    req.session.save((err) => {
      if (err) return next(err);
      res.redirect(ROUTES.USER.LANDING_PAGE);
    });
  } catch (error) {
    res.render("user/login", { message: "Login failed" });
  }
};


const loadShopping = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 8;
    const skip = (page - 1) * limit;

    const result = (req.query.result || req.query.q || '').trim();
    const pickArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
    const selectedCategories = pickArray(req.query.category).filter(Boolean);
    const sortParam = (req.query.sort || 'newest').trim();

    // Min/Max price filters
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;

    // Build filter
    const filter = {};
    filter.isBlocked = { $ne: true };
    filter.status = { $in: ['Available', 'Out of Stock'] };

    if (result) {
      filter.productName = { $regex: result, $options: 'i' };
    }

    // Category filter
    let categoriesList = await Category.find({ isListed: true }).lean();
    if (selectedCategories.length) {
      const matchCats = categoriesList.filter(c => selectedCategories.includes(c.name));
      filter.category = { $in: matchCats.length ? matchCats.map(c => c._id) : [] };
    }

    // Price filter
    const andConds = [];
    if (minPrice !== null && minPrice > 0) {
      andConds.push({ regularPrice: { $gte: minPrice } });
    }
    if (maxPrice !== null && maxPrice > 0) {
      andConds.push({ regularPrice: { $lte: maxPrice } });
    }
    andConds.push({ status: { $ne: 'Discontinued' } });

    if (andConds.length) {
      filter.$and = andConds;
    }

    // Sorting
    let sortObj = { createdAt: -1 };
    switch (sortParam) {
      case 'priceLowToHigh':  sortObj = { regularPrice: 1 };  break;
      case 'priceHighToLow':  sortObj = { regularPrice: -1 }; break;
      case 'aToZ':            sortObj = { productName: 1 };   break;
      case 'zToA':            sortObj = { productName: -1 };  break;
      default:                sortObj = { createdAt: -1 };
    }

    const [itemsRaw, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name categoryOffer')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    const items = (itemsRaw || []).map(p => {
      const regular = Number(p.regularPrice || 0);
      const productOffer = Number(p.productOffer || 0);
      const categoryOffer = Number(p.category?.categoryOffer || 0);

      let appliedOffer = 0;
      if (productOffer > categoryOffer) {
        appliedOffer = productOffer;
      } else if (categoryOffer > productOffer) {
        appliedOffer = categoryOffer;
      }

      const offerPrice = appliedOffer > 0
        ? Math.round(regular - (regular * appliedOffer / 100))
        : regular;

      const totalStock = p.stock
        ? (p.stock.S || 0) + (p.stock.M || 0) + (p.stock.L || 0) +
          (p.stock.XL || 0) + (p.stock.XXL || 0)
        : 0;

      // Auto-correct status based on stock
      let correctStatus = p.status;
      if (totalStock > 0 && p.status === 'Out of Stock') correctStatus = 'Available';
      if (totalStock === 0 && p.status === 'Available') correctStatus = 'Out of Stock';

      return {
        ...p,
        name: p.productName ?? p.name,
        images: Array.isArray(p.productImage) && p.productImage.length
          ? p.productImage
          : (Array.isArray(p.images) ? p.images : []),
        regularPrice: regular,
        offerPercent: appliedOffer,
        offerPrice,
        totalStock,
        status: correctStatus
      };
    });

    const totalPages = Math.ceil(total / limit);
    const user = req.session?.user || null;

    res.render('user/shop', {
      products: items,
      category: categoriesList,
      currentPage: page,
      totalPages,
      totalProducts: total,
      sortOption: sortParam,
      user,
      appliedFilters: {
        result,
        category: selectedCategories,
        minPrice: req.query.minPrice || '',
        maxPrice: req.query.maxPrice || '',
        sort: sortParam,
      }
    });

  } catch (error) {
    console.error('loadShopping error:', error);
    res.redirect('/pageNotFound');
  }
};

const getProductDetails = async (req, res) => {
  try {
    const id = req.params.id;
    const p = await Product.findById(id)
      .populate('category', 'name categoryOffer')
      .lean();

    if (!p) return res.status(404).render('user/page-404');

    if (p.isBlocked === true || p.status === 'Discontinued') {
      return res.status(404).render('user/page-404');
    }

    const regular = Number(p.regularPrice || 0);
    const productOffer = Number(p.productOffer || 0);
    const categoryOffer = Number(p.category?.categoryOffer || 0);

    let appliedOffer = 0;
    if (productOffer > categoryOffer) {
      appliedOffer = productOffer;
    } else if (categoryOffer > productOffer) {
      appliedOffer = categoryOffer;
    }

    const offerPrice = appliedOffer > 0
      ? Math.round(regular - (regular * appliedOffer / 100))
      : regular;

    const product = {
      ...p,
      name: p.productName ?? p.name,
      images: Array.isArray(p.productImage) && p.productImage.length
        ? p.productImage
        : (Array.isArray(p.images) ? p.images : []),
      price: regular,
      offerPercent: appliedOffer,
      offerPrice,
      regularPrice: regular,
    };

    return res.render('user/productDetails', {
      user: req.session?.user || null,
      product,
      reviewCount: 0,
      averageRating: 0,
      reviews: []
    });

  } catch (err) {
    console.error('getProductDetails error:', err);
    return res.status(500).render('user/page-404');
  }
};

// API for related products (used in productDetails page)
const getProductsApi = async (req, res) => {
  try {
    const { category, limit = 4, exclude } = req.query;

    const filter = {
      isBlocked: { $ne: true },
      status: { $in: ['Available', 'Out of Stock'] }
    };

    if (category) filter.category = category;
    if (exclude) filter._id = { $ne: exclude };

    const products = await Product.find(filter)
      .populate('category', 'name categoryOffer')
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, products });
  } catch (err) {
    console.error('getProductsApi error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


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
  logout,
   loadShopping,
  getProductDetails,
  getProductsApi,  // add this
};