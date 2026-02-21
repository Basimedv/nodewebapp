// controllers/admin/admincontroller.js
const { ROUTES } = require('../../constants/routes');
const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');

const pageerror = async (req, res) => {
    // Points to views/admin/admin-error.ejs
    res.render('admin/admin-error');
};

const loadLogin = (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect(ROUTES.ADMIN.DASHBOARD);
        }
        return res.render('admin/login', { error: null });
    } catch (err) {
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.render('admin/login', { error: "Admin not found" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            return res.render('admin/login', { error: "Incorrect password" });
        }

        req.session.admin = true;

        return res.redirect(ROUTES.ADMIN.DASHBOARD);
    } catch (error) {
        return res.render('admin/login', { error: "Something went wrong" });
    }
};

const loadDashboard = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect(ROUTES.ADMIN.LOGIN);
    }
    try {
        // Pass the title and any other necessary data here
        res.render('admin/dashboard', { 
            title: 'Dashboard Overview' 
        });
    } catch (error) {
        console.error("Dashboard Load Error:", error);
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};

const logout = async (req, res) => {
    try {
        // delete req.session.admin;
        req.session.admin = false           
        req.session.save((err) => {
            if (err) console.error("Logout save error:", err);
            res.redirect(ROUTES.ADMIN.LOGIN);
        });
    } catch (error) {
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
};