const { ROUTES } = require('../../constants/routes');
const User    = require('../../models/userSchema');
const Order   = require('../../models/orderSchema');
const bcrypt  = require('bcrypt');
 
// ── Page error ────────────────────────────────────────────────────
const pageerror = async (req, res) => {
    res.render('admin/admin-error');
};
 
// ── Login ─────────────────────────────────────────────────────────
const loadLogin = (req, res) => {
    if (req.session.admin) return res.redirect(ROUTES.ADMIN.DASHBOARD);
    res.render('admin/login', { error: null });
};
 
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });
        if (!admin) return res.render('admin/login', { error: 'Admin not found' });
 
        const match = await bcrypt.compare(password, admin.password);
        if (!match) return res.render('admin/login', { error: 'Incorrect password' });
 
        req.session.admin = true;
        return res.redirect(ROUTES.ADMIN.DASHBOARD);
    } catch (err) {
        return res.render('admin/login', { error: 'Something went wrong' });
    }
};
 
// ── Load dashboard (initial page render) ─────────────────────────
const loadDashboard = async (req, res) => {
    if (!req.session.admin) return res.redirect(ROUTES.ADMIN.LOGIN);
    try {
        const [users, salesAgg, totalOrders, productsAgg] = await Promise.all([
            User.countDocuments({ isAdmin: false }),
            Order.aggregate([
                { $match: { status: { $nin: ['Cancelled', 'Payment Pending', 'Failed'] } } },
                { $group: { _id: null, total: { $sum: '$finalAmount' } } }
            ]),
            Order.countDocuments({ status: { $nin: ['Cancelled', 'Payment Pending', 'Failed'] } }),
            Order.aggregate([
                { $match: { status: { $nin: ['Cancelled', 'Payment Pending', 'Failed'] } } },
                { $unwind: '$orderedItems' },
                { $group: { _id: null, total: { $sum: '$orderedItems.quantity' } } }
            ])
        ]);
 
        res.render('admin/dashboard', {
            title:         'Dashboard Overview',
            users,
            totalSales:    salesAgg[0]?.total    || 0,
            totalOrders,
            totalProducts: productsAgg[0]?.total || 0,
            path:          '/admin/dashboard'
        });
    } catch (err) {
        console.error('loadDashboard error:', err);
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};
 
// ── Helper: build date range from period string ───────────────────
const getPeriodRange = (period, startParam, endParam) => {
    // FIX: custom range now properly handled
    if (period === 'custom' && startParam && endParam) {
        return {
            start: new Date(startParam),
            end:   new Date(new Date(endParam).setHours(23, 59, 59, 999))
        };
    }
 
    const now = new Date();
    let start;
    switch (period) {
        case 'daily':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'weekly':
            start = new Date(now);
            start.setDate(now.getDate() - 7);
            break;
        case 'yearly':
            start = new Date(now.getFullYear(), 0, 1);
            break;
        case 'monthly':
        default:
            start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start, end: now };
};
 
// ── Helper: group format for chart labels ─────────────────────────
const getGroupFormat = (period) => {
    switch (period) {
        case 'daily':   return { format: '%H:00',      sort: '%Y-%m-%d %H' };
        case 'weekly':  return { format: '%Y-%m-%d',   sort: '%Y-%m-%d' };
        case 'yearly':  return { format: '%Y-%m',      sort: '%Y-%m' };
        case 'monthly':
        default:        return { format: '%Y-%m-%d',   sort: '%Y-%m-%d' };
    }
};
 
// ── Main data router ──────────────────────────────────────────────
const getDashboardData = async (req, res) => {
    try {
        const { type, period = 'monthly', start, end } = req.query;
        switch (type) {
            case 'stats':      return await getStats(req, res, period, start, end);
            case 'chart':      return await getChartData(req, res, period, start, end);
            case 'products':   return await getTopProducts(req, res);
            case 'categories': return await getTopCategories(req, res);
            case 'brands':     return await getTopLocations(req, res);
            default:
                return res.status(400).json({ success: false, error: 'Invalid type' });
        }
    } catch (err) {
        console.error('getDashboardData error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
 
// ── Stat cards ────────────────────────────────────────────────────
const getStats = async (req, res, period, startParam, endParam) => {
    // FIX: pass startParam/endParam into getPeriodRange
    const { start, end } = getPeriodRange(period, startParam, endParam);
 
    const orderFilter = {
        createdOn: { $gte: start, $lte: end },
        status:    { $nin: ['Cancelled', 'Payment Pending', 'Failed'] }
    };
 
    const [totalCustomers, salesAgg, totalOrders, productsAgg] = await Promise.all([
        // FIX: User schema uses createdAt not createdOn
        User.countDocuments({ isAdmin: false, createdAt: { $gte: start, $lte: end } }),
        Order.aggregate([
            { $match: orderFilter },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]),
        Order.countDocuments(orderFilter),
        Order.aggregate([
            { $match: orderFilter },
            { $unwind: '$orderedItems' },
            { $group: { _id: null, total: { $sum: '$orderedItems.quantity' } } }
        ])
    ]);
 
    res.json({
        success: true,
        data: {
            totalCustomers,
            totalSales:   salesAgg[0]?.total    || 0,
            totalOrders,
            productsSold: productsAgg[0]?.total || 0
        }
    });
};
 
// ── Sales & orders chart data ─────────────────────────────────────
const getChartData = async (req, res, period, startParam, endParam) => {
    // FIX: single function handles ALL periods including custom
    const { start, end } = getPeriodRange(period, startParam, endParam);
 
    // Pick grouping format based on period
    let dateFormat;
    if (period === 'yearly') {
        dateFormat = '%Y-%m';         // group by month for yearly view
    } else if (period === 'daily') {
        dateFormat = '%H:00';         // group by hour for daily view
    } else {
        dateFormat = '%Y-%m-%d';      // group by day for weekly/monthly/custom
    }
 
    const result = await Order.aggregate([
        {
            $match: {
                createdOn: { $gte: start, $lte: end },
                status:    { $nin: ['Cancelled', 'Payment Pending', 'Failed'] }
            }
        },
        {
            $group: {
                _id:    { $dateToString: { format: dateFormat, date: '$createdOn' } },
                sales:  { $sum: '$finalAmount' },
                orders: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);
 
    res.json({
        success: true,
        data: {
            labels: result.map(r => r._id),
            sales:  result.map(r => r.sales),
            orders: result.map(r => r.orders)
        }
    });
};
 
// ── Top 10 Products ───────────────────────────────────────────────
const getTopProducts = async (req, res) => {
    const top = await Order.aggregate([
        { $match: { status: { $nin: ['Cancelled', 'Payment Pending', 'Failed'] } } },
        { $unwind: '$orderedItems' },
        {
            $group: {
                _id:           '$orderedItems.product',
                name:          { $first: '$orderedItems.productName' },
                totalQuantity: { $sum: '$orderedItems.quantity' }
            }
        },
        { $sort:  { totalQuantity: -1 } },
        { $limit: 10 }
    ]);
    res.json({ success: true, data: top });
};
 
// ── Top 10 Categories ─────────────────────────────────────────────
const getTopCategories = async (req, res) => {
    const top = await Order.aggregate([
        { $match: { status: { $nin: ['Cancelled', 'Payment Pending', 'Failed'] } } },
        { $unwind: '$orderedItems' },
        {
            $lookup: {
                from:         'products',
                localField:   'orderedItems.product',
                foreignField: '_id',
                as:           'productInfo'
            }
        },
        { $unwind: '$productInfo' },
        {
            $group: {
                _id:           '$productInfo.category',
                totalQuantity: { $sum: '$orderedItems.quantity' }
            }
        },
        {
            $lookup: {
                from:         'categories',
                localField:   '_id',
                foreignField: '_id',
                as:           'categoryInfo'
            }
        },
        { $unwind: '$categoryInfo' },
        {
            $project: {
                _id:           0,
                name:          '$categoryInfo.name',
                totalQuantity: 1
            }
        },
        { $sort:  { totalQuantity: -1 } },
        { $limit: 10 }
    ]);
    res.json({ success: true, data: top });
};
 
const getTopLocations = async (req, res) => {
    const result = await Order.aggregate([
        { $match: { status: { $nin: ['Cancelled', 'Payment Pending', 'Failed'] } } },
        { $unwind: '$orderedItems' },
        {
            $group: {
                _id:           '$address',
                totalQuantity: { $sum: '$orderedItems.quantity' }
            }
        }
    ]);

    const locationMap = {};

    result.forEach(r => {
        const raw   = (r._id || '').trim();
        const parts = raw.split(',').map(p => p.trim());

        // Address format: "name, addressType, landMark, city, state - pinCode, Phone: xxx"
        // city is always index 3
        const city = parts[3] || 'Unknown';

        locationMap[city] = (locationMap[city] || 0) + r.totalQuantity;
    });

    const top = Object.entries(locationMap)
        .map(([name, totalQuantity]) => ({ name, totalQuantity }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 5);

    res.json({ success: true, data: top });
};
// ── Logout ────────────────────────────────────────────────────────
const logout = async (req, res) => {
    try {
        req.session.admin = false;
        req.session.save(err => {
            if (err) console.error('Logout save error:', err);
            res.redirect(ROUTES.ADMIN.LOGIN);
        });
    } catch (err) {
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};
 
module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
    getDashboardData
};
 