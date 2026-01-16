const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RZP_TEST_KEY,
  key_secret: process.env.RZP_TEST_SECRET
});

module.exports = razorpay;