// controllers/admin/admincontroller.js
const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');



const pageerror = async (req, res) => {
  res.render('admin-error')
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

    // ✅ login successful
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
      return res.render('admin/dashboard'); // make sure your dashboard view is in views/admin/
    } catch (error) {
      return res.redirect('/pageerror');
    }
  } else {
    return res.redirect('/admin/adminLogin');
  }
};
const logout = async (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.log('Error destroying session', err);
        return res.redirect('/pageerror');
      }

      res.clearCookie('connect.sid'); // clear session cookie if using express-session
      res.redirect('/admin/adminLogin'); // ✅ absolute path
    });
  } catch (error) {
    console.log("Unexpected error during logout", error);
    res.redirect('/pageerror');
  }
};


module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
};



