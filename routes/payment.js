const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/user/paymentController');
const { ensureAuth } = require('../middlewares/auth');

// Create Razorpay Order
router.post('/create-order', ensureAuth, paymentController.createOrder);

// Verify Payment
router.post('/verify-payment', ensureAuth, paymentController.verifyPayment);

// Get Payment Details
router.get('/payment/:paymentId', ensureAuth, paymentController.getPaymentDetails);

module.exports = router;
