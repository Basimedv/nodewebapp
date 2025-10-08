const User=require('../models/userSchema')

// Prevent caching so back button can't show protected pages after logout
function setNoCache(res){
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

// Enhanced session isolation for admin and user sessions
function clearAllSessionData(req, res, next) {
    // Clear any existing admin session data
    if (req.session.admin) {
        delete req.session.admin;
    }
    
    // Clear any existing user session data
    if (req.session.user) {
        delete req.session.user;
    }
    
    // Clear session completely to prevent any cross-contamination
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
    });
    next();
} 

function preventBack(req,res,next){
  // Only prevent caching for authenticated routes to avoid interfering with normal browser navigation on public pages
  if (req.session && req.session.user) {
    setNoCache(res);
  }
  next();
}

const userAuth=(req,res,next)=>{
    setNoCache(res);
    if(req.session.user && req.session.user._id){
        User.findById(req.session.user._id)
            .then(data=>{
if(data&&!data.isBlocked){
    next()
}else{
    res.redirect("/landingPage")
}
            })
            .catch(error=>{
                console.log('Error in user auth middleware');
                res.status(500).send('Internal Server Error');
            })
        
    }else{
        res.redirect("/landingPage")
    }
}

// Strong session guard for routes
const ensureAuth = async (req,res,next)=>{
  try{
    setNoCache(res);
    const u = req.session && req.session.user;
    if(!u || !u._id){
      return res.redirect('/');
    }
    const data = await User.findById(u._id).lean();
    if(data && !data.isBlocked){
      return next();
    }
    return res.redirect('/landingPage');
  }catch(err){
    console.log('Error in ensureAuth middleware', err);
    return res.status(500).send('Internal Server Error');
  }
}

// Block login/signup for authenticated users
function ensureGuest(req,res,next){
  setNoCache(res);
  if(req.session && req.session.user){
    return res.redirect('/landingPage');
  }
  return next();
}

// If a user is already logged in, keep them on landing page when they hit public pages like homepage (/)
function stayOnLandingAfterLogin(req, res, next){
  setNoCache(res);
  if (req.session && req.session.user){
    return res.redirect('/landingPage');
  }
  return next();
}

// If a normal user is logged in, block access to admin login page
function blockUserOnAdminLogin(req, res, next){
  setNoCache(res);
  if (req.session && req.session.user){
    return res.redirect('/landingPage');
  }
  return next();
}

// If an admin is logged in, block access to user login/signup pages
function blockAdminOnUserLogin(req, res, next){
  setNoCache(res);
  if (req.session && req.session.admin){
    return res.redirect('/admin/dashboard');
  }
  return next();
}

// If an admin is logged in, block access to user pages
function blockAdminFromUserPages(req, res, next){
  setNoCache(res);
  if (req.session && req.session.admin){
    return res.redirect('/admin/dashboard');
  }
  return next();
}

// Admin auth: require admin session and confirm isAdmin
const adminAuth = async (req,res,next)=>{
  try{
    setNoCache(res);
    const sess = req.session && req.session.admin;
    if(!sess || !sess._id){
      return res.redirect('/admin/adminLogin');
    }
    const admin = await User.findById(sess._id).lean();
    if (admin && admin.isAdmin){
      return next();
    }
    return res.redirect('/admin/adminLogin');
  }catch(error){
    console.log('Error in adminAuth middleware', error);
    return res.status(500).send('Internal Server Error');
  }
}

// Prevent logged-in admin from seeing admin login page
function ensureAdminGuest(req,res,next){
  setNoCache(res);
  if (req.session && req.session.admin){
    return res.redirect('/admin/dashboard');
  }
  return next();
}

module.exports={
    userAuth,
    ensureAuth,
    ensureGuest,
    stayOnLandingAfterLogin,
    preventBack,
    blockUserOnAdminLogin,
    blockAdminOnUserLogin,
    blockAdminFromUserPages,
    adminAuth,
    ensureAdminGuest,
}