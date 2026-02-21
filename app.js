const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const dotenv = require('dotenv');
const morgan = require('morgan');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const googleRoutes = require('./routes/googleRoute');

dotenv.config();

// Connect to Database
db();

const app = express();

// --- View Engine Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- Standard Middlewares ---
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Session Configuration ---
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true only if using HTTPS
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 // 72 hours
    }
}));

// --- Passport Initialization ---
// IMPORTANT: Must be after session middleware
app.use(passport.initialize());
app.use(passport.session());

// --- Routes ---

app.use('/auth', googleRoutes); 

app.use('/', adminRouter);

// User routes (e.g., /login, /profile)
app.use('/', userRouter);
// This should be at the very bottom of your app.js, after all other routes
app.use((req, res) => {
    res.status(404).render('user/pageNotFound', {
        user: req.session.user || null // This fixes the "user is not defined" error
    });
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});

module.exports = app;