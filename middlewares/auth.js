const User = require('../models/userSchema');


const setNoCache = (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
};


const userAuth = async (req, res, next) => {
    setNoCache(res);

    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user._id);
            if (user && !user.isBlocked) {
                return next();
            }
            
            // ✅ return here so no second response is sent
            return req.session.destroy((err) => {
                if (err) console.error("Session destroy error", err);
                res.redirect('/pageNotFound');
            });

        } catch (error) {
            console.error("Auth Middleware Error", error);
            return res.redirect('/pageNotFound'); // ✅ return here too
        }
    }

    return res.redirect('/pageNotFound'); // ✅ return here
};

// 2. Admin Authentication
const adminAuth = (req, res, next) => {
    setNoCache(res);
    if (req.session.admin) {
        return next();
    }
    res.redirect('/admin/adminLogin');
};


// 3. Guest Middleware — ✅ FIX: Added DB check for user isBlocked
const isGuest = async (req, res, next) => {
       setNoCache(res);  // ✅ This prevents browser from caching login page

    if (req.path.includes('admin')) {
        if (req.session.admin) {
            return res.redirect('/admin/dashboard');
        }
    } else {
        if (req.session.user) {
            try {
                // ✅ FIX: Verify user exists and is not blocked
                const user = await User.findById(req.session.user._id);

                if (user && !user.isBlocked) {
                         return res.redirect('/landingPage');
                }

                
                req.session.destroy((err) => {
                    if (err) console.error("Session destroy error", err);
                });

            } catch (error) {
                console.error("isGuest Middleware Error", error);
            }
        }
    }

    next();
};
const logoutUser = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error("Logout Error", err);
        res.redirect('/pageNotFound'); // ✅ only logout moves user to home
    });
};

module.exports = { userAuth, adminAuth, isGuest,logoutUser };