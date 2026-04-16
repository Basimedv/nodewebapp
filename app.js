const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const dotenv = require('dotenv');
const morgan = require('morgan');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const { ROUTES } = require('./constants/routes');
const googleRoutes = require('./routes/googleRoute');

dotenv.config();


db();

const app = express();


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    },
}));



app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});



app.use('/auth', googleRoutes);

app.use('/', adminRouter);

app.use('/', userRouter);


app.use((req, res) => {
    // If the URL starts with /admin, redirect to the admin error page
    if (req.originalUrl.startsWith('/admin')) {
        return res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }


    res.status(404).render('user/pageNotFound', {
        user: req.session.user || null
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

module.exports = app;