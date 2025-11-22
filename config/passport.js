const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback", // Changed to relative path
    passReqToCallback: true // Enable request object in callback
},
async (req, accessToken, refreshToken, profile, done) => {
    try {
        console.log("🔍 Google OAuth callback triggered");
        console.log("📧 Email:", profile.emails?.[0]?.value);
        
        // Extract email
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        
        if (!email) {
            return done(new Error('No email from Google'), null);
        }
        
        // Check if user exists by email OR googleId
        let user = await User.findOne({ 
            $or: [
                { googleId: profile.id },
                { email: email }
            ]
        });
        
        if (user) {
            // Update googleId if user exists via email but doesn't have googleId
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
            console.log("✅ Existing user found:", user.email);
            return done(null, user);
        } else {
            // Create new user
            user = new User({
                fullName: profile.displayName,
                email: email,
                googleId: profile.id,
                isAdmin: 0,
                isBlocked: false
            });
            await user.save();
            console.log("✅ New user created:", user.email);
            return done(null, user);
        }
    } catch (error) {
        console.error("❌ Google OAuth error:", error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    console.log("🔐 Serializing user:", user._id);
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        console.log( user?._id);
        done(null, user);
    } catch (err) {
        console.error("❌ Deserialize error:", err);
        done(err, null);
    }
});

module.exports = passport;