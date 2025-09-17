const express = require('express');
const path = require('path');
const session = require('express-session');
const passport=require('./config/passport');
const dotenv = require('dotenv');
dotenv.config();
const db = require('./config/db');
const mongoose = require('mongoose');
const userRouter = require('./routes/userRouter');
const adminRouter=require('./routes/adminRouter')
db()


const app = express();



app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))

app.use(passport.initialize());
app.use(passport.session());


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', userRouter)
app.use('/admin',adminRouter);



app.listen(process.env.PORT || 3000, () => {
    console.log('server start')
})






