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
const cloudinary = require('./config/cloudinary');

dotenv.config();
db();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Test Cloudinary connection on startup
cloudinary.testConnection().then(connected => {
  if (connected) {
    console.log('✅ Cloudinary connected successfully');
  } else {
    console.error('❌ Check your Cloudinary credentials in .env');
  }
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 // 72 hours
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

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

// Server start
app.listen(process.env.PORT || 3000, () => {
    console.log('✅ Server started on port', process.env.PORT || 3000);
});
