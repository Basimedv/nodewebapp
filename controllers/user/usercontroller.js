const User = require("../../models/userSchema");

const pageNotFound = async (req, res) => {
    try {
        res.render('page-404')
    } catch (error) {
        console.log('user error', error)
        res.redirect('/pageNotFound')
    }
}



const loadHomepage = async (req, res) => {

    try {
        return res.render('home')
    } catch (error) {
        console.log('page not found', error)
        res.status(500).send('server error')
    }
}
const loadSignup = async (req, res) => {
    try {
        return res.render('signup', {
            msg: req.query.msg,
            type: req.query.type
        });
    } catch (error) {
        console.log('Signup page not found', error);
        res.status(500).send('Server Error');
    }
};

const loadShopping = async (req, res) => {
    try {
        return res.render('productListing')
    } catch (error) {
        console.log('shopping page not loading', error)
        res.status(500).send('Server Error')

    }

}



const signup = async (req, res) => {
    const { fullName, password, phone, email, confirmPassword } = req.body;
    try {
        const existing = await User.findOne({ email })
        if (existing) {
            return res.redirect('/signup?msg=User already exists&type=error');
        } else {
            const newuser = new User({
                fullName, email, phone, password, confirmPassword
            })


            console.log(newuser)
            await newuser.save()

        }


        if (password !== confirmPassword) {
            return res.redirect('/signup?msg=Password not match&type=error');
        }

        return res.redirect('/signup?msg=User created successfully&type=success');

    } catch (error) {
        return res.status(500).send(`server error${error}`)
    }
}




const showPro = (req, res) => {
    res.render('practise')
}
module.exports = {
    pageNotFound,
    loadHomepage,
    loadShopping,
    loadSignup,
    showPro,
    signup,
}
