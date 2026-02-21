const User = require('../models/userSchema');

// Utility to prevent browser caching (Back Button Fix)
const setNoCache = (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
};

// 1. User Authentication (Checks session AND if user is blocked)
const userAuth = async (req, res, next) => {
    setNoCache(res);
    
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user._id);
            if (user && !user.isBlocked) {
                return next();
            }
            // If blocked or not found, clear session and redirect
            req.session.user = null;
        } catch (error) {
            console.error("Auth Middleware Error", error);
        }
    }
    res.redirect('/login');
};

// 2. Admin Authentication
const adminAuth = (req, res, next) => {
    setNoCache(res);
    if (req.session.admin) {
        return next();
    }
    res.redirect('/admin/adminLogin');
};

const isGuest = (req, res, next) => {
    // If we are on a USER guest page (like /login), only check for USER session
    if (req.path.includes('admin')) {
        if (req.session.admin) return res.redirect('/admin/dashboard');
    } else {
        if (req.session.user) return res.redirect('/landingPage');
    }
    next();
};

module.exports = { userAuth, adminAuth, isGuest };