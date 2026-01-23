// controllers/admin/admincontroller.js
const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');



const pageerror = async (req, res) => {
  res.render('admin/admin-error')
}
// GET admin login page
const loadLogin = (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    // error message is optional
    return res.render("admin/login", { error: null });
  } catch (err) {
    console.error("Error loading admin login:", err);
    res.redirect("/pageNotFound");
  }
};

// POST admin login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // check if admin exists
    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      // email not found → show error
      return res.render("admin/login", { error: "Admin email not found" });
    }

    // compare password
    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      // wrong password → show error
      return res.render("admin/login", { error: "Incorrect password" });
    }

    // ✅ login successful - only set admin session, preserve user session if exists
    req.session.admin = { _id: admin._id, email: admin.email };
    return res.redirect("/admin/dashboard");

  } catch (error) {
    console.error("Login error:", error);
    return res.render("admin/login", { error: "Something went wrong, try again" });
  }
};

// GET admin dashboard
const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
      // Import required models
      const Order = require('../../models/orderSchema');
      const Product = require('../../models/productSchema');
      const Category = require('../../models/categorySchema');
      const User = require('../../models/userSchema');
      
      console.log('🔍 Loading data-driven dashboard...');
      
      // ==================== KEY METRICS OVERVIEW ====================
      
      // Total revenue
      const revenueResult = await Order.aggregate([
        { $group: { _id: null, totalRevenue: { $sum: '$finalAmount' } } }
      ]);
      const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
      
      // Total orders
      const totalOrders = await Order.countDocuments();
      
      // Total users
      const totalUsers = await User.countDocuments({ isAdmin: { $ne: true } });
      
      // Conversion rate (checkout → successful payment)
      const successfulOrders = await Order.countDocuments({ 
        $or: [
          { paymentStatus: 'Paid' },
          { paymentStatus: 'Completed' },
          { status: 'Delivered' }
        ]
      });
      const conversionRate = totalOrders > 0 ? ((successfulOrders / totalOrders) * 100).toFixed(2) : 0;
      
      // ==================== TRANSACTION DATA ====================
      
      // Total transactions
      const totalTransactions = await Order.countDocuments();
      
      // Payment status breakdown
      const paymentStats = await Order.aggregate([
        { $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }},
        { $sort: { count: -1 } }
      ]);
      
      // Recent transactions
      const recentTransactions = await Order.find()
        .sort({ createdOn: -1 })
        .limit(10)
        .select('orderId finalAmount paymentStatus paymentMethod createdOn userId')
        .populate('userId', 'fullName email')
        .lean();
      
      // ==================== BEST SELLING PRODUCTS ====================
      
      // Best selling products with revenue
      const bestProducts = await Order.aggregate([
        { $unwind: '$orderedItems' },
        { $group: {
          _id: '$orderedItems.product',
          totalQuantity: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.discountPrice'] } }
        }},
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 }
      ]);
      
      // Populate product details
      const productIds = bestProducts.map(p => p._id);
      const products = await Product.find({ _id: { $in: productIds } })
        .select('productName productImage')
        .lean();
      
      const bestSellingProducts = bestProducts.map(stat => {
        const product = products.find(p => p._id.toString() === stat._id.toString());
        return {
          _id: stat._id,
          productName: product ? product.productName : 'Unknown Product',
          unitsSold: stat.totalQuantity,
          revenue: stat.totalRevenue
        };
      });
      
      // ==================== BEST SELLING CATEGORIES ====================
      
      // Best selling categories with revenue
      const bestCategories = await Order.aggregate([
        { $unwind: '$orderedItems' },
        { $lookup: {
          from: 'products',
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'productInfo'
        }},
        { $unwind: '$productInfo' },
        { $lookup: {
          from: 'categories',
          localField: 'productInfo.category',
          foreignField: '_id',
          as: 'categoryInfo'
        }},
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: '$productInfo.category',
          categoryName: { 
            $first: { 
              $ifNull: [
                '$categoryInfo.categoryName',
                '$categoryInfo.name',
                'Unknown Category'
              ]
            }
          },
          totalUnitsSold: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.discountPrice'] } }
        }},
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]);
      
      console.log('🏷️ Best selling categories raw data:', bestCategories);
      
      // ==================== SALES BY LOCATION ====================
      
      // Sales by location with order count and revenue
      const salesByLocation = await Order.aggregate([
        { $unwind: '$orderedItems' },
        { $match: { 
          $or: [
            { "shippingAddress.city": { $exists: true, $ne: null, $ne: "" } },
            { "shippingAddress.state": { $exists: true, $ne: null, $ne: "" } },
            { "address.city": { $exists: true, $ne: null, $ne: "" } },
            { "address.state": { $exists: true, $ne: null, $ne: "" } }
          ]
        }},
        { 
          $group: {
            _id: { 
              $ifNull: [
                "$shippingAddress.city",
                { $ifNull: ["$shippingAddress.state", "$address.city", "$address.state"] }
              ]
            },
            locationName: { 
              $first: { 
                $ifNull: [
                  "$shippingAddress.city",
                  { $ifNull: ["$shippingAddress.state", "$address.city", "$address.state"] }
                ]
              }
            },
            orderCount: { $sum: 1 },
            totalRevenue: { $sum: '$finalAmount' }
          }
        },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]);
      
      console.log('📊 Complete data-driven dashboard data:', {
        totalRevenue,
        totalOrders,
        totalUsers,
        conversionRate,
        totalTransactions,
        paymentStats,
        recentTransactions,
        bestSellingProducts,
        bestCategories,
        salesByLocation
      });
      
      return res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        admin: req.session.admin,
        
        // Key Metrics
        totalRevenue,
        totalOrders,
        totalUsers,
        conversionRate,
        
        // Transaction Data
        totalTransactions,
        paymentStats,
        recentTransactions,
        
        // Best Selling Products
        bestSellingProducts,
        
        // Best Selling Categories
        bestCategories,
        
        // Sales by Location
        salesByLocation,
        
        currentFilter: 'monthly'
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      return res.redirect('/admin/pageerror');
    }
  } else {
    return res.redirect('/admin/adminLogin');
  }
};
const logout = async (req, res) => {
  try {
    // Only clear admin session data, preserving user session if it exists
    delete req.session.admin;
    req.session.save(() => {
      res.clearCookie('connect.sid');
      res.redirect('/admin/adminLogin');
    });
  } catch (error) {
    console.log("Unexpected error during logout", error);
    res.redirect('/pageerror');
  }
};

// Load order detail page
const loadOrderDetailPage = async (req, res) => {
  try {
    const { id } = req.params;
    const Order = require('../../models/orderSchema');
    
    // Find order and populate user and product details
    const order = await Order.findById(id)
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName productImage')
      .lean();
    
    if (!order) {
      console.log('❌ Order not found for detail page:', id);
      return res.redirect('/admin/pageerror');
    }
    
    console.log('✅ Loading order detail page:', order.orderId);
    res.render('admin/order-detail', { 
      order: order,
      title: 'Order Details - Admin Panel'
    });
  } catch (error) {
    console.error('Error loading order detail page:', error);
    res.redirect('/admin/pageerror');
  }
};


module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
  loadOrderDetailPage,
};



