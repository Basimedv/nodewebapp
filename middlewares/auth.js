const User=require('../models/userSchema')

// Prevent caching so back button can't show protected pages after logout
function setNoCache(res){
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

// Clear session data while maintaining the session
function clearAllSessionData(req, res, next) {
    // Clear any existing admin session data
    if (req.session.admin) {
        delete req.session.admin;
    }
    
    // Clear any existing user session data
    if (req.session.user) {
        delete req.session.user;
    }
    
    // Save the empty session
    req.session.save((err) => {
        if (err) {
            console.error('Error saving cleared session:', err);
        }
        next();
    });
} 

const preventBack = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
};

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

const ensureAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    console.log('⚠️  Not authenticated, redirecting to login');
    res.redirect('/login');
};

const ensureGuest = (req, res, next) => {
    if (req.session && req.session.user) {
        console.log('⚠️  Already authenticated, redirecting to landing page');
        return res.redirect('/landingPage');
    }
    next();
};

// If a user is already logged in, keep them on landing page when they hit public pages like homepage (/)


// Admin auth: require admin session and confirm isAdmin
// middlewares/adminAuth.js (or wherever your auth is)
const adminAuth = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  }
  
  // Check if it's an API/AJAX request
  const isApiRequest = req.xhr || 
                       req.headers.accept?.includes('application/json') ||
                       req.headers['content-type']?.includes('multipart/form-data');
  
  if (isApiRequest) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please login.'
    });
  }
  
  // Otherwise redirect to login
  res.redirect('/admin/adminLogin');
};



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
    adminAuth,
    ensureAdminGuest,
    preventBack,
    clearAllSessionData
}
