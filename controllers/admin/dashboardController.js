// controllers/admin/dashboardController.js
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

// ==================== KEY METRICS OVERVIEW ====================

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
    try {
        console.log('📊 Fetching dashboard stats...');
        
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
        
        console.log('📈 Dashboard stats:', { totalRevenue, totalOrders, totalUsers, conversionRate });
        
        res.json({
            success: true,
            data: {
                totalRevenue,
                totalOrders,
                totalUsers,
                conversionRate
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ==================== TRANSACTION DATA ====================

// Get transaction analytics
const getTransactionAnalytics = async (req, res) => {
    try {
        console.log('💳 Fetching transaction analytics...');
        
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
        
        // Recent transactions with details
        const recentTransactions = await Order.find()
            .sort({ createdOn: -1 })
            .limit(10)
            .select('orderId finalAmount paymentStatus paymentMethod createdOn userId')
            .populate('userId', 'fullName email')
            .lean();
        
        console.log('💳 Transaction analytics:', { totalTransactions, paymentStats, recentTransactions });
        
        res.json({
            success: true,
            data: {
                totalTransactions,
                paymentStats,
                recentTransactions
            }
        });
    } catch (error) {
        console.error('Transaction analytics error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ==================== BEST SELLING PRODUCTS ====================

// Get best selling products
const getBestSellingProducts = async (req, res) => {
    try {
        console.log('🏆 Fetching best selling products...');
        
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
        
        console.log('🏆 Best selling products:', bestSellingProducts);
        
        res.json({
            success: true,
            data: bestSellingProducts
        });
    } catch (error) {
        console.error('Best selling products error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ==================== BEST SELLING CATEGORIES ====================

// Get best selling categories
const getBestSellingCategories = async (req, res) => {
    try {
        console.log('🏷️ Fetching best selling categories...');
        
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
            { $unwind: '$categoryInfo' },
            { $group: {
                _id: '$categoryInfo._id',
                categoryName: { $first: '$categoryInfo.categoryName' },
                totalUnitsSold: { $sum: '$orderedItems.quantity' },
                totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.discountPrice'] } }
            }},
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 }
        ]);
        
        console.log('🏷️ Best selling categories:', bestCategories);
        
        res.json({
            success: true,
            data: bestCategories
        });
    } catch (error) {
        console.error('Best selling categories error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ==================== SALES BY LOCATION ====================

// Get sales by location
const getSalesByLocation = async (req, res) => {
    try {
        console.log('🗺️ Fetching sales by location...');
        
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
        
        console.log('🗺️ Sales by location:', salesByLocation);
        
        res.json({
            success: true,
            data: salesByLocation
        });
    } catch (error) {
        console.error('Sales by location error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ==================== CHART DATA ====================

// Get chart data for visualization
const getChartData = async (req, res) => {
    try {
        console.log('📊 Fetching chart data...');
        
        const { period } = req.query;
        
        // Calculate date range based on period
        let dateFilter = {};
        const now = new Date();
        switch (period) {
            case 'daily':
                dateFilter = { createdOn: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } };
                break;
            case 'weekly':
                dateFilter = { createdOn: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) } };
                break;
            case 'monthly':
                dateFilter = { createdOn: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
                break;
            case 'yearly':
                dateFilter = { createdOn: { $gte: new Date(now.getFullYear(), 0, 1) } };
                break;
            default:
                dateFilter = { createdOn: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
        }
        
        console.log('📅 Date filter:', dateFilter);
        
        // Get orders grouped by date
        const orders = await Order.find(dateFilter)
            .select('createdOn finalAmount')
            .lean();
        
        // Group orders by date
        const groupedOrders = {};
        orders.forEach(order => {
            const date = new Date(order.createdOn);
            const dateKey = date.toLocaleDateString('en-IN');
            
            if (!groupedOrders[dateKey]) {
                groupedOrders[dateKey] = [];
            }
            groupedOrders[dateKey].push(order);
        });
        
        // Prepare chart data
        const labels = Object.keys(groupedOrders).sort();
        const salesData = labels.map(date => {
            return groupedOrders[date].reduce((sum, order) => sum + (order.finalAmount || 0), 0);
        });
        
        const ordersData = labels.map(date => groupedOrders[date].length);
        
        console.log('📊 Chart data prepared:', { labels, salesData, ordersData });
        
        res.json({
            success: true,
            data: {
                labels,
                sales: salesData,
                orders: ordersData
            }
        });
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

module.exports = {
    getDashboardStats,
    getTransactionAnalytics,
    getBestSellingProducts,
    getBestSellingCategories,
    getSalesByLocation,
    getChartData
};
