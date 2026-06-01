const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require('../../models/categorySchema');
const Review = require('../../models/reviewSchema');
const { generateOtp, securePassword, sendVerificationEmail } = require("../../utils/authHelper");
const bcrypt = require('bcrypt');
const HTTP_STATUS_CODES = require("../../constants/status_codes");
const { ROUTES } = require("../../constants/routes");

const getListedCategoryIds = async () => {
    const cats = await Category.find({ isListed: true }).select('_id').lean();
    return cats.map(c => c._id);
};

const calcOfferPrice = (regular, pOffer, cOffer) => {
    const appliedOffer = Math.max(Number(pOffer || 0), Number(cOffer || 0));
    return {
        offerPercent: appliedOffer,
        offerPrice: appliedOffer > 0 ? Math.round(regular - (regular * appliedOffer / 100)) : regular
    };
};

const pageNotFound = async (req, res) => {
    res.render("user/pageNotFound", { user: req.session.user || null });
};

const loadHomepage = async (req, res) => {
    try {
        res.render('user/home', { user: req.session.user || null });
    } catch (error) {
        res.redirect(ROUTES.USER.PAGE_ERROR);
    }
};

const loadLandingPage = async (req, res) => {
    try {
        res.render("user/landingpage", { user: req.session.user || null });
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

        if (!userOtp || Date.now() > otpExpiresAt || otp.trim() !== userOtp) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({ success: false, message: "Invalid or expired OTP" });
        }

        const passwordHash = await securePassword(userData.password);
        const newUser = await User.create({ ...userData, password: passwordHash });

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
    res.render("user/login", { message: req.query.message || null });
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, isAdmin: false });

        if (!user || user.isBlocked || !(await bcrypt.compare(password, user.password))) {
            return res.render("user/login", { message: "Invalid credentials or account blocked" });
        }

        req.session.user = { _id: user._id, email: user.email, name: user.fullName };
        req.session.save(() => res.redirect(ROUTES.USER.LANDING_PAGE));
    } catch (error) {
        res.render("user/login", { message: "Login failed" });
    }
};

const loadShopping = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 8;
    const skip  = (page - 1) * limit; // ✅ FIX: skip now calculated

    // ── parse all filters from query ──
    const q        = (req.query.q || req.query.result || '').trim();
    const category = req.query.category;
    const sort     = req.query.sort || 'newest';
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;

    // ── build DB filter ──
    const listedCategoryIds = await Category.find({ isListed: true }).distinct('_id');

    const filter = {
      isBlocked: { $ne: true },
      status:    { $ne: 'Discontinued' },
      category:  { $in: listedCategoryIds }
    };

    // search
    if (q) {
      filter.productName = { $regex: q, $options: 'i' };
    }

    // category filter
    if (category) {
      const selectedArr = Array.isArray(category) ? category : [category];
      const validCatIds = await Category.find({
        isListed: true,
        name: { $in: selectedArr }
      }).distinct('_id');
      filter.category = { $in: validCatIds };
    }

    // price filter — do it in DB not in JS
    if (minPrice !== null || maxPrice !== null) {
      filter.$or = [
        {
          salePrice: {
            ...(minPrice !== null ? { $gte: minPrice } : {}),
            ...(maxPrice !== null ? { $lte: maxPrice } : {}),
            $gt: 0
          }
        },
        {
          salePrice: { $in: [0, null] },
          regularPrice: {
            ...(minPrice !== null ? { $gte: minPrice } : {}),
            ...(maxPrice !== null ? { $lte: maxPrice } : {})
          }
        }
      ];
    }

    // ── fetch categoriesList (always needed) ──
    const categoriesList = await Category.find({ isListed: true }).sort({ name: 1 }).lean();

    let itemsRaw;
    let total;

    // ✅ FIX: price sorts use aggregation with computed finalPrice field
    const needsPriceSort = sort === 'priceLowToHigh' || sort === 'priceHighToLow';

    if (needsPriceSort) {
      // ── aggregation pipeline: add finalPrice field, then sort on it ──
      const priceDirection = sort === 'priceLowToHigh' ? 1 : -1;

      const pipeline = [
        { $match: filter },
        {
          // compute the effective display price (salePrice if valid, else regularPrice)
          $addFields: {
            computedFinalPrice: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ['$salePrice', 0] },
                    { $lt: ['$salePrice', '$regularPrice'] }
                  ]
                },
                then: '$salePrice',
                else: '$regularPrice'
              }
            }
          }
        },
        { $sort: { computedFinalPrice: priceDirection } },
        {
          // facet: paginated data + total count in one query
          $facet: {
            data:  [{ $skip: skip }, { $limit: limit }],
            count: [{ $count: 'total' }]
          }
        }
      ];

      const [result] = await Product.aggregate(pipeline);
      itemsRaw = result.data;
      total    = result.count[0]?.total || 0;

      // populate category after aggregation
      await Product.populate(itemsRaw, { path: 'category', select: 'name categoryOffer' });

    } else {
      // ── non-price sorts: simple find with sort + skip + limit ──
      const sortMap = {
        newest: { createdAt: -1 },
        aToZ:   { productName:  1 },
        zToA:   { productName: -1 }
      };
      const dbSort = sortMap[sort] || { createdAt: -1 };

      // ✅ FIX: .skip() and .limit() now applied
      [itemsRaw, total] = await Promise.all([
        Product.find(filter)
          .populate('category', 'name categoryOffer')
          .sort(dbSort)
          .skip(skip)   // ✅ was missing before
          .limit(limit) // ✅ was missing before
          .lean(),
        Product.countDocuments(filter)
      ]);
    }

    // ── map products ──
    const products = itemsRaw.map(p => {
      const regular  = Number(p.regularPrice || 0);
      const sale     = Number(p.salePrice    || 0);
      const isOnSale = sale > 0 && sale < regular;
      const finalPrice = isOnSale ? sale : regular;
      const discountPercent = isOnSale
        ? Math.round((regular - sale) / regular * 100)
        : 0;

      const totalStock = Object.values(p.stock || {})
        .reduce((a, b) => a + (parseInt(b) || 0), 0);

      return {
        ...p,
        name:            p.productName,
        images:          p.productImage || [],
        regularPrice:    regular,
        salePrice:       sale,
        finalPrice,
        discountPercent,
        totalStock,
        status: totalStock > 0 ? 'Available' : 'Out of Stock'
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    res.render('user/productListing', {
      products,
      category:      categoriesList,
      currentPage:   page,
      totalPages,
      totalProducts: total,
      sortOption:    sort,
      user:          req.session.user || null,
      appliedFilters: {
        q,
        result:   q,
        category: category || '',
        minPrice: req.query.minPrice || '',
        maxPrice: req.query.maxPrice || '',
        sort
      }
    });

  } catch (error) {
    console.error('loadShopping error:', error);
    res.redirect('/pageNotFound');
  }
};
const getProductDetails = async (req, res) => {
    try {
        const p = await Product.findById(req.params.id).populate('category').lean();

        if (!p || p.isBlocked || p.status === 'Discontinued' || !p.category?.isListed) {
            return res.status(404).render('user/pageNotFound', { user: req.session.user || null });
        }

        const { offerPercent, offerPrice } = calcOfferPrice(p.regularPrice, p.productOffer, p.category?.categoryOffer);
        const reviews = await Review.find({ product: p._id }).sort({ createdAt: -1 }).lean();
        const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;

        res.render('user/productDetails', {
            user: req.session.user || null,
            product: { ...p, name: p.productName, images: p.productImage || [], offerPercent, offerPrice },
            reviews,
            reviewCount: reviews.length,
            averageRating: avgRating
        });
    } catch (err) {
        res.status(500).render('user/pageNotFound', { user: req.session.user || null });
    }
};

const getProductsApi = async (req, res) => {
    try {
        const { category, limit = 4, exclude } = req.query;
        const listedIds = await getListedCategoryIds();

        const filter = { isBlocked: { $ne: true }, status: { $ne: 'Discontinued' }, category: { $in: listedIds } };
        if (category) filter.category = category;
        if (exclude) filter._id = { $ne: exclude };

        const products = await Product.find(filter).populate('category').limit(parseInt(limit)).lean();
        res.json({ success: true, products });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

const logout = (req, res) => {
    delete req.session.user;
    req.session.save(() => res.redirect(ROUTES.USER.HOME));
};

module.exports = {
    pageNotFound, loadHomepage, loadLandingPage, loadSignup, signup,
    verifyOtp, resendOtp, loadLogin, login, logout, loadShopping,
    getProductDetails, getProductsApi
};