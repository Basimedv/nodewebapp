const express = require('express');
const passport = require('passport');
const router = express.Router();

// Route to start Google Auth
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account' 
}));

// Google Callback Route
router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/login', 
        failureMessage: true 
    }), 
    (req, res) => {
        // Checking for blocked status before setting session
        if (req.user.isBlocked) {
            req.logout((err) => { if (err) console.log(err); });
            return res.redirect('/login?message=User is blocked');
        }

        // Setting session variables exactly like your reference
        req.session.userLogged = true;
        req.session.user = {
            _id: req.user._id, // Matching your schema's _id
            fullName: req.user.fullName,
            email: req.user.email,
        };

        // Redirecting to landing page as per your app flow
        res.redirect("/landingPage");
    }
);


module.exports = router;