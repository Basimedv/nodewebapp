const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const nodemailer = require('nodemailer')
const env = require('dotenv').config();
const bcrypt = require('bcrypt')
const pageNotFound = async (req, res) => {
  try {
    res.render('user/page-404')
  } catch (error) {
    console.error("Error rendering 404 page:", error);
    res.status(500).send("Internal Server Error");
  }
};

const loadHomepage = async (req, res) => {
  try {
    let userData = null;
    if (req.session.user && req.session.user._id) {
      userData = await User.findById(req.session.user._id).lean();
    } else if (req.session.user && req.session.user.email) {
      userData = await User.findOne({ email: req.session.user.email }).lean();
    }

    const products = await Product.find({ status: { $ne: 'Discountinued' } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    return res.render('user/home', { user: userData, products });
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

    // Fetch latest available products for homepage (e.g., 8 items)
    const products = await Product.find({ status: { $ne: 'Discountinued' } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    // ✅ Render with user and products
    return res.render("user/landingpage", { user: userData, products });
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
    // Pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 8;
    const skip = (page - 1) * limit;

    // Parse filters from query
    const result = (req.query.result || req.query.q || '').trim();
    const pickArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
    const selectedCategories = pickArray(req.query.category).filter(Boolean);
    // ❌ REMOVED: const selectedBrands = pickArray(req.query.brand).filter(Boolean);
    const maxPrice = Number.parseInt(req.query.price, 10);
    const includeOutOfStock = !!req.query.availability;
    const sortParam = (req.query.sort || 'newest').trim();

    // Build Mongo filter
    const filter = {};
    // Exclude admin-blocked products always
    filter.isBlocked = { $ne: true };
    // Availability: exclude discontinued always; include only Available unless availability checked
    const allowedStatuses = includeOutOfStock ? ['Available', 'out of stock'] : ['Available'];
    filter.status = { $in: allowedStatuses };

    // Text search by name only (removed brand search)
    if (result) {
      filter.productNmae = { $regex: result, $options: 'i' };
      // ❌ REMOVED: filter.$or with brand search
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

    // ❌ REMOVED: Brand filter
    // if (selectedBrands.length) {
    //   filter.brand = { $in: selectedBrands };
    // }

    // Price filter (treat as max price cap)
    const andConds = [];
    if (!Number.isNaN(maxPrice) && maxPrice > 0) {
      andConds.push({ 
        $or: [ 
          { regularPrice
: { $lte: maxPrice } }, 
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

    // Sorting
    let sortObj = { createdAt: -1 };
    switch (sortParam) {
      case 'priceLowToHigh':
        sortObj = { regularPrice
: 1, price: 1, createdAt: -1 };
        break;
      case 'priceHighToLow':
        sortObj = { regularPrice
: -1, price: -1, createdAt: -1 };
        break;
      case 'aToZ':
        sortObj = { productNmae: 1 };
        break;
      case 'zToA':
        sortObj = { productNmae: -1 };
        break;
      case 'ratingHighToLow':
        // Placeholder: if rating not stored, fallback to newest
        sortObj = { createdAt: -1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
    }

    // ❌ REMOVED: Brand.find() from Promise.all
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
            regularPrice: regular,   // send to UI
    salePrice: sale,         // send to UI
        offerPercent,
        offerPrice,
       
      };
    });

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    // ❌ REMOVED: brand mapping
    // const brand = (brandsDocs || []).map(b => ({
    //   name: b.brandName,
    //   image: b.brandImage || null
    // })).filter(b => b.name);

    const appliedFilters = {
      result,
      category: selectedCategories,
      price: !Number.isNaN(maxPrice) && maxPrice > 0 ? String(maxPrice) : '',
      // ❌ REMOVED: brand: selectedBrands,
      availability: includeOutOfStock ? 'outOfStock' : '',
      sort: sortParam || 'newest',
      // For pagination link builder in EJS
      minPrice: '0',
      maxPrice: !Number.isNaN(maxPrice) && maxPrice > 0 ? String(maxPrice) : '',
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
      // ❌ REMOVED: brand,
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
    const p = await Product.findById(id).populate('category', 'offer').lean();
    if (!p) return res.status(404).render('user/page-404');
    // Hide blocked or discontinued products from public
    if (p.isBlocked === true || p.status === 'Discountinued') {
      return res.status(404).render('user/page-404');
    }

    const regular = typeof p.regularPrice
 === 'number' ? p.regularPrice
 : (typeof p.price === 'number' ? p.price : 0);
    const sale = typeof p.salePrice === 'number' ? p.salePrice : 0;
    const offerPercent = Math.max(p.productOffer || 0, (p.category && p.category.offer) || 0);
    const offerPrice = offerPercent > 0 ? Math.round(regular - (regular * offerPercent / 100)) : (sale > 0 && sale < regular ? sale : regular);

    const product = {
      ...p,
      name: p.productName ?? p.name,
      images: Array.isArray(p.productImage) && p.productImage.length ? p.productImage : (Array.isArray(p.images) ? p.images : []),
      price: regular,
      sale,
      offerPercent,
      offerPrice,
      regularPrice: regular,
    };

    return res.render('user/productDetails', { user: req.session?.user || null, product });
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
    console.error("Error hashing password:", error);
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

// View Orders
const viewOrders = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const userId = req.session.user._id;
    const Order = require('../../models/orderSchema');
    
    console.log('🔍 Fetching orders for user:', userId);
    
    const orders = await Order.find({ userId })
      .sort({ createdOn: -1 })
      .populate('orderedItems.product', 'productName name productImage regularPrice salePrice')
      .lean();
    
    console.log('📦 Found orders:', orders.length);
    console.log('📦 Orders data:', JSON.stringify(orders, null, 2));
    
    // Debug: Log order details
    orders.forEach((order, index) => {
      console.log(`📋 Order ${index + 1}:`, {
        orderId: order.orderId,
        status: order.status,
        itemsCount: order.orderedItems ? order.orderedItems.length : 0,
        finalAmount: order.finalAmount
      });
      
      if (order.orderedItems) {
        order.orderedItems.forEach((item, itemIndex) => {
          console.log(`  🛍️ Item ${itemIndex + 1}:`, {
            productName: item.productName,
            hasProduct: !!item.product,
            productImage: item.productImage || (item.product ? item.product.productImage : null),
            quantity: item.quantity,
            price: item.price
          });
        });
      }
    });
    
    res.render('user/viewOrders', { 
      orders: orders,
      user: req.session.user,
      title: 'My Orders'
    });
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).render('user/page-404');
  }
};

// Load Cart
const loadCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    const userId = req.session.user._id;
    const Cart = require('../../models/cartSchema');
    
    const cart = await Cart.findOne({ userId })
      .populate('items.productId', 'productName productImage regularPrice salePrice productOffer stock')
      .lean();
    
    // Extract cart items for the view
    const cartItems = cart ? cart.items : [];
    
    // Get user data for the view
    const User = require('../../models/userSchema');
    const user = await User.findById(userId);
    
    res.render('user/cart', { 
      cart: cart,
      cartItems: cartItems,
      user: user,
      title: 'My Cart'
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.redirect('/pageNotFound');
  }
};

// Add to Cart
const addToCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const { productId, quantity, size } = req.body;
    const userId = req.session.user._id;
    
    if (!productId || !quantity) {
      return res.status(400).json({ success: false, error: 'Product ID and quantity are required' });
    }
    

    
    const Cart = require('../../models/cartSchema');
    const Product = require('../../models/productSchema');
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Validate product price
    const productPrice = product.price || product.regularPrice || 0;
    if (!productPrice || productPrice <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product price' });
    }
    
    // Find or create user cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }
    
    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(item => 
      item.productId.toString() === productId && item.size === size
    );
    
    if (existingItemIndex > -1) {
      // Update existing item
      const newQuantity = cart.items[existingItemIndex].quantity + parseInt(quantity);
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].totalPrice = productPrice * newQuantity;
    } else {
      // Add new item
      cart.items.push({
        productId: productId,
        quantity: parseInt(quantity),
        size: size,
        price: productPrice,
        totalPrice: productPrice * parseInt(quantity)
      });
    }
    
    await cart.save();
    
    res.json({ 
      success: true, 
      message: 'Item added to cart',
      cartCount: cart.items.length
    });
    
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, error: 'Failed to add item to cart' });
  }
};

// Update Cart Quantity
const updateCartQuantity = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const { userId, itemId, quantity } = req.body;
    const Cart = require('../../models/cartSchema');
    
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }
    
    // Find item in cart
    const itemIndex = cart.items.findIndex(item => 
      item._id.toString() === itemId
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: 'Item not found in cart' });
    }
    
    // Update quantity
    cart.items[itemIndex].quantity = parseInt(quantity);
    cart.items[itemIndex].totalPrice = cart.items[itemIndex].price * parseInt(quantity);
    
    await cart.save();
    
    res.json({ 
      success: true, 
      message: 'Cart updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ success: false, error: 'Failed to update cart' });
  }
};

// Remove from Cart
const removeFromCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const { userId, productId: itemId } = req.body;
    const Cart = require('../../models/cartSchema');
    
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }
    
    // Remove item from cart
    cart.items = cart.items.filter(item => 
      !(item.productId.toString() === productId && item._id.toString() === itemId)
    );
    
    await cart.save();
    
    res.json({ 
      success: true, 
      message: 'Item removed from cart',
      cartCount: cart.items.length
    });
    
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ success: false, error: 'Failed to remove item from cart' });
  }
};

// GET order details
const getOrderDetails = async (req, res) => {
  try {
    if (!req.session.user) {
      console.log('❌ No user session, redirecting to login');
      return res.redirect('/login');
    }
    
    const { id } = req.params;
    const userId = req.session.user._id;
    const Order = require('../../models/orderSchema');
    const Address = require('../../models/addressSchema');
    
    console.log('🔍 Fetching order details for ID:', id, 'User:', userId);
    
    // Check if ID is valid
    if (!id || id === 'undefined' || id === 'null') {
      console.log('❌ Invalid order ID:', id);
      return res.redirect('/pageNotFound');
    }
    
    // Find the order
    let order = null;
    try {
      order = await Order.findOne({ _id: id, userId: userId })
        .populate('orderedItems.product', 'productName productImage regularPrice salePrice productOffer')
        .lean();
    } catch (dbError) {
      console.error('❌ Database error finding order:', dbError);
      return res.redirect('/pageNotFound');
    }

    if (!order) {
      console.log('❌ Order not found for user:', userId, 'Order ID:', id);
      return res.redirect('/pageNotFound');
    }

    console.log('✅ Order found:', order.orderId, 'Status:', order.status);

    // Get shipping address
    let shippingAddress = null;
    if (order.address) {
      console.log('📍 Address field:', order.address);
      
      if (order.address.includes('_')) {
        const [docId, addressIndex] = order.address.split('_');
        console.log('🔑 Looking up address - docId:', docId, 'index:', addressIndex);
        
        const addressDoc = await Address.findOne({ userId: userId });
        
        if (addressDoc && addressDoc.address && addressDoc.address.length > parseInt(addressIndex)) {
          shippingAddress = addressDoc.address[parseInt(addressIndex)];
          console.log('✅ Shipping address found:', shippingAddress);
        } else {
          console.log('⚠️ Address not found in address document');
        }
      } else {
        console.log('🔑 Looking up address by ID:', order.address);
        const addressDoc = await Address.findById(order.address);
        if (addressDoc) {
          shippingAddress = addressDoc;
          console.log('✅ Shipping address found by ID:', shippingAddress);
        }
      }
    } else {
      console.log('⚠️ No address field in order');
    }

    // Also check if shippingAddress exists directly on the order
    if (!shippingAddress && order.shippingAddress) {
      console.log('✅ Using shippingAddress from order object');
      shippingAddress = order.shippingAddress;
    }

    // ✅ Fetch return request if order has Return Request status
    let returnRequest = null;
    if (order.status === 'Return Request' || order.returnRequest) {
      console.log('🔍 Fetching return request for order');
      try {
        const Refund = require('../../models/refundSchema');
        
        returnRequest = await Refund.findOne({ 
          order: order._id
        })
        .populate('product', 'productName productImage')
        .populate('userId', 'fullName email')
        .sort({ createdAt: -1 })
        .lean();
        
        if (returnRequest) {
          console.log('✅ Return request found:', {
            id: returnRequest._id,
            reason: returnRequest.reason,
            status: returnRequest.status,
            productName: returnRequest.product?.productName,
            customerName: returnRequest.userId?.fullName
          });
        } else {
          console.log('⚠️ No return request found for order:', order._id);
        }
      } catch (returnError) {
        console.error('❌ Error fetching return request:', returnError);
      }
    }

    console.log('📤 Rendering order details page');
    console.log('🔍 returnRequest value:', returnRequest);
    console.log('🔍 returnRequest type:', typeof returnRequest);

    // Ensure returnRequest is defined
    const returnRequestData = returnRequest || null;

    res.render('user/orderDetails', { 
      title: 'Order Details',
      user: req.session.user,
      order: {
        ...order,
        orderedItems: order.orderedItems.map(item => ({
          ...item,
          product: item.productId || item.product
        }))
      },
      address: shippingAddress,  // ✅ Pass as 'address' to match template
      returnRequest: returnRequestData
    });
    
  } catch (error) {
    console.error('❌ Error getting order details:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).render('user/page-404');
  }
};
// Cancel Order
const cancelOrder = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to continue' 
      });
    }

    const { orderId } = req.params;
    const userId = req.session.user._id;
    const Order = require('../../models/orderSchema');
    const Wallet = require('../../models/walletSchema');

    // Find the order and populate product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product', 'productName');
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Check if order can be cancelled (not delivered)
    if (order.status === 'Delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Delivered orders cannot be cancelled. Please request a return instead.' 
      });
    }

    if (order.status === 'Cancelled') {
      return res.status(400).json({ 
        success: false, 
        message: 'Order is already cancelled' 
      });
    }

    // Update order status
    order.status = 'Cancelled';
    
    // Ensure productName is set from populated product data
    order.orderedItems.forEach(item => {
      if (!item.productName && item.product && item.product.productName) {
        item.productName = item.product.productName;
      }
    });
    
    await order.save();

    // Restore stock for cancelled items
    const Product = require('../../models/productSchema');
    for (const item of order.orderedItems) {
      const product = await Product.findById(item.product);
      if (product) {
        const sizeKey = item.size || 'M';
        const currentStock = product.stock[sizeKey] || 0;
        product.stock[sizeKey] = currentStock + item.quantity;
        await product.save();
        
        console.log(`🔄 Stock restored for ${product.productName} size ${sizeKey}: ${currentStock} → ${product.stock[sizeKey]}`);
      }
    }

    // Process refund for online payments
    if (order.paymentMethod !== 'Cash on Delivery') {
      // Create a new wallet transaction for the refund
      const refundTransaction = await Wallet.create({
        userId: userId,
        transactionId: `refund_${order.orderId}_${Date.now()}`,
        payment_type: 'refund',
        amount: order.finalAmount,
        status: 'completed',
        entryType: 'CREDIT',
        type: 'refund',
        description: `Refund for cancelled order ${order.orderId}`
      });
      
      console.log(`💰 Refund transaction created: ${refundTransaction.transactionId} for ₹${order.finalAmount}`);
    }

    console.log(`❌ Order ${order.orderId} cancelled successfully`);

    res.json({ 
      success: true, 
      message: order.paymentMethod !== 'Cash on Delivery' 
        ? 'Order cancelled successfully. Refund has been added to your wallet.' 
        : 'Order cancelled successfully.',
      refundAmount: order.paymentMethod !== 'Cash on Delivery' ? order.finalAmount : 0
    });

  } catch (error) {
    console.error('❌ Cancel order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel order. Please try again.' 
    });
  }
};
// Return Order
const returnOrder = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to continue' 
      });
    }

    // Get orderId from URL params (just like cancelOrder does)
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.session.user._id;
    
    console.log('🔄 Processing return request for order:', orderId);
    console.log('📝 Return reason:', reason);
    console.log('👤 User ID:', userId);
    
    const Order = require('../../models/orderSchema');
    const Refund = require('../../models/refundSchema');

    // Find order by orderId (the UUID string like "ae8c73...")
    const order = await Order.findOne({ orderId: orderId, userId: userId })
      .populate('orderedItems.product');
    
    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    console.log('✅ Order found, MongoDB _id:', order._id, 'Status:', order.status);

    // Check if order is delivered
    if (order.status !== 'Delivered') {
      console.log('❌ Order not delivered yet, status:', order.status);
      return res.status(400).json({ 
        success: false, 
        message: 'Only delivered orders can be returned' 
      });
    }

    // Check for existing return request
    const existingReturn = await Refund.findOne({ 
      order: order._id,
      userId: userId,
      status: { $in: ['Requested', 'Approved', 'Rejected'] }
    });

    if (existingReturn) {
      console.log('⚠️ Return request already exists');
      return res.status(400).json({ 
        success: false, 
        message: 'Return request already exists for this order' 
      });
    }

    // Get the first product from the order
    const firstProduct = order.orderedItems[0].product;
    
    if (!firstProduct) {
      console.log('❌ No product found in order');
      return res.status(400).json({ 
        success: false, 
        message: 'No product found in order' 
      });
    }

    console.log('📦 Creating return request for product:', firstProduct._id);

    // Create return request matching your Refund schema
    const returnRequest = await Refund.create({
      order: order._id,           // ObjectId reference to Order
      product: firstProduct._id,   // ObjectId reference to Product
      userId: userId,              // ObjectId reference to User
      reason: reason || 'No reason provided',
      status: 'Requested'
    });

    // Update order status to Return Request
    await Order.findByIdAndUpdate(order._id, { 
      status: 'Return Request',
      returnRequest: returnRequest._id
    });

    console.log('✅ Return request created:', returnRequest._id);
    console.log('✅ Order status updated to Return Request');
    
    res.json({ 
      success: true, 
      message: 'Return request submitted successfully. Please wait for admin approval.' 
    });
    
  } catch (error) {
    console.error('❌ Error creating return request:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit return request. Please try again.',
      error: error.message
    });
  }
};
// Get Order Invoice
const getOrderInvoice = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Please login to download invoice' });
    }
    
    const { id } = req.params;
    const userId = req.session.user._id;
    
    console.log('📄 Generating invoice for order:', id, 'User:', userId);
    
    // For now, just return a simple response
    res.status(404).json({ success: false, message: 'Invoice generation not available yet' });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate invoice. Please try again.' 
    });
    res.status(500).json({ success: false, message: 'Failed to generate invoice' });
  }
};

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
  getProductDetails,
  // addToWishlist,
  // viewWishlist,
  // removeFromWishlist,
  apiProducts,
  handleForgotPage,
  viewOrders,
  getOrderDetails,
  cancelOrder,
  returnOrder,
  getOrderInvoice,
  loadCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
}
  

