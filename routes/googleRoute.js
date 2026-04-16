const express = require('express');
const passport = require('passport');
const router = express.Router();


router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));


router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login',
        failureMessage: true
    }),
    (req, res) => {
      
        if (req.user.isBlocked) {
            req.logout((err) => { if (err) console.log(err); });
            return res.redirect('/login?message=User is blocked');
        }


        req.session.userLogged = true;
        req.session.user = {
            _id: req.user._id,
            fullName: req.user.fullName,
            email: req.user.email,
        };


        res.redirect("/landingPage");
    }
);


module.exports = router;