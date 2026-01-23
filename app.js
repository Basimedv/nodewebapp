// ⚡ CRITICAL FIX: Force IPv4 DNS resolution BEFORE any other requires
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const dotenv = require('dotenv');
const fs = require('fs');
const morgan = require('morgan');
const db = require('./config/db');
const mongoose = require('mongoose');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const paymentRouter = require('./routes/payment');
const cloudinary = require('./config/cloudinary');

dotenv.config();
db();

const app = express();

// 🔍 DIAGNOSTIC LOGS - Check environment variables
console.log('\n========== ENVIRONMENT CHECK ==========');
console.log('🔑 GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Loaded ✅' : 'MISSING ❌');
console.log('🔑 GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Loaded ✅' : 'MISSING ❌');
console.log('🔑 SESSION_SECRET:', process.env.SESSION_SECRET ? 'Loaded ✅' : 'MISSING ❌');
console.log('📍 PORT:', process.env.PORT || 3000);
console.log('🌐 DNS Resolution: IPv4 First ✅');
console.log('======================================\n');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test Cloudinary connection on startup
cloudinary.testConnection().then(connected => {
  if (connected) {
    console.log('✅ Cloudinary connected successfully');
  } else {
    console.error('❌ Cloudinary connection failed: ');
    console.error('❌ Check your Cloudinary credentials in .env');
  }
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 // 72 hours
    }
}));

console.log('✅ Session middleware configured');

// Passport
app.use(passport.initialize());
app.use(passport.session());

console.log('✅ Passport middleware configured');

// EJS setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static folder
app.use(express.static(path.join(__dirname, 'public')));

// Logger
app.use(morgan('dev'));

// Routes
app.use('/', userRouter);
app.use('/admin', adminRouter);
app.use('/api/payment', paymentRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).send('Something went wrong!');
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔗 Google OAuth: http://localhost:${PORT}/auth/google\n`);
});