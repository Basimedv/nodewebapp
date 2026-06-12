const Cart    = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order   = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Coupon  = require('../../models/couponSchema');
const razorpay = require('../../config/razorpay');
const crypto   = require('crypto');
const HTTP_STATUS_CODES = require('../../constants/status_codes');
const { getWalletBalance, debitWallet } = require('./walletController');

// ── HELPER: Build address string ─────────────────────────────────
const buildAddressString = (addr) =>
    `${addr.name}, ${addr.addressType}, ${addr.landMark}, ` +
    `${addr.city}, ${addr.state} - ${addr.pinCode}, ` +
    `Phone: ${addr.phone}`;

// ── HELPER: Validate stock ────────────────────────────────────────
const validateStock = async (cartItems) => {
    for (const item of cartItems) {
        const product   = item.productId;
        const available = product.stock?.[item.size] || 0;
        if (available < item.quantity) {
            return {
                valid:   false,
                message: `"${product.productName}" (${item.size}) only ${available} left`
            };
        }
    }
    return { valid: true };
};

// ── HELPER: Reduce stock (with rollback support) ──────────────────
const reduceStock = async (cartItems) => {
    const reduced = []; // track what was reduced for rollback
    try {
        for (const item of cartItems) {
            await Product.findByIdAndUpdate(
                item.productId._id,
                { $inc: { [`stock.${item.size}`]: -item.quantity } }
            );
            reduced.push({ id: item.productId._id, size: item.size, qty: item.quantity });
        }
        return { success: true, reduced };
    } catch (err) {
        // ✅ Rollback whatever was reduced
        for (const r of reduced) {
            await Product.findByIdAndUpdate(
                r.id,
                { $inc: { [`stock.${r.size}`]: r.qty } }
            ).catch(() => {});
        }
        return { success: false, reduced };
    }
};



const getCheckout = async (req, res) => {
    try {
        const userId = req.session.user?._id;

        const cart = await Cart.findOne({ userId })
            .populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const cartItems = cart.items.map(item => {
            const product = item.productId;
            return {
                _id:         item._id,
                productId:   product._id,
                productName: product.productName,
                image:       product.productImage?.[0] || '/images/placeholder.png',
                size:        item.size,
                quantity:    item.quantity,
                price:       item.price,
                totalPrice:  item.price * item.quantity,
                stock:       product.stock?.[item.size] || 0
            };
        });

        const addressDoc    = await Address.findOne({ userId });
        const addresses     = addressDoc ? addressDoc.address : [];
        const subtotal      = cartItems.reduce((s, i) => s + i.totalPrice, 0);
        const delivery      = 0;

        // ✅ Get wallet balance to show on checkout
        const walletBalance = await getWalletBalance(userId);

        res.render('user/checkout', {
            user: req.session.user,
            cartItems,
            addresses,
            subtotal,
            delivery,
            total:         subtotal + delivery,
            walletBalance  // ✅ passed to EJS
        });

    } catch (error) {
        console.error('getCheckout error:', error);
        res.redirect('/pageNotFound');
    }
};
// ── APPLY COUPON ─────────────────────────────────────────────────
const applyCoupon = async (req, res) => {
    try {
        const userId             = req.session.user?._id;
        const { code, subtotal } = req.body;

        if (!code?.trim()) {
            return res.status(400).json({
                success: false, message: 'Please enter a coupon code'
            });
        }

        const coupon = await Coupon.findOne({
            name:     code.trim().toUpperCase(),
            isList:   true,
            expireOn: { $gte: new Date() }
        });

        if (!coupon) {
            return res.status(404).json({
                success: false, message: 'Invalid or expired coupon'
            });
        }

        const alreadyUsed = coupon.userId.some(
            id => id.toString() === userId.toString()
        );
        if (alreadyUsed) {
            return res.status(400).json({
                success: false, message: 'You have already used this coupon'
            });
        }

        if (subtotal < coupon.minimumPrice) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount is ₹${coupon.minimumPrice.toLocaleString('en-IN')}`
            });
        }

        const discount   = coupon.offerPrice;
        const finalTotal = Math.max(subtotal - discount, 0);

        return res.status(200).json({
            success:    true,
            message:    `Coupon applied! You saved ₹${discount.toLocaleString('en-IN')}`,
            discount,
            finalTotal,
            couponCode: coupon.name
        });

    } catch (error) {
        console.error('applyCoupon error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
};

const placeOrder = async (req, res) => {
    let savedOrder = null;

    try {
        const userId = req.session.user?._id;
        const { addressId, paymentMethod, couponCode, couponDiscount } = req.body;

        // ── 1. Validate address ──────────────────────────────────
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(400).json({
                success: false,
                message: 'No address found. Please add an address.'
            });
        }

        const selectedAddress = addressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Selected address not found'
            });
        }

        // ── 2. Get cart ──────────────────────────────────────────
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        // ── 3. Validate stock ────────────────────────────────────
        const stockCheck = await validateStock(cart.items);
        if (!stockCheck.valid) {
            return res.status(400).json({
                success: false,
                message: stockCheck.message
            });
        }

        // ── 4. Build orderedItems ────────────────────────────────
        const orderedItems = cart.items.map(item => ({
            product:      item.productId._id,
            productName:  item.productId.productName,
            productImage: item.productId.productImage || [],
            quantity:     item.quantity,
            size:         item.size,
            price:        item.price
        }));

        // ── 5. Calculate totals ──────────────────────────────────
        const totalPrice  = orderedItems.reduce(
            (s, i) => s + i.price * i.quantity, 0
        );
        const discount    = Number(couponDiscount) || 0;
        const finalAmount = Math.max(totalPrice - discount, 0);

        // ── 6. Wallet payment — check balance BEFORE saving order
        if (paymentMethod === 'Wallet') {
            const walletBalance = await getWalletBalance(userId);

            if (walletBalance < finalAmount) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient wallet balance. Available: ₹${walletBalance.toLocaleString('en-IN')}, Required: ₹${finalAmount.toLocaleString('en-IN')}`
                });
            }
        }

        // ── 7. Address string ────────────────────────────────────
        const addressString = buildAddressString(selectedAddress);

        // ── 8. Validate coupon ───────────────────────────────────
        if (couponCode) {
            const coupon = await Coupon.findOne({
                name:     couponCode.toUpperCase(),
                isList:   true,
                expireOn: { $gte: new Date() }
            });
            if (!coupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon is no longer valid'
                });
            }
            if (!coupon.userId.includes(userId)) {
                coupon.userId.push(userId);
                await coupon.save();
            }
        }

        // ── 9. Save order FIRST ──────────────────────────────────
        const order = new Order({
            userId,
            orderedItems,
            totalPrice,
            dicount:        discount,
            finalAmount,
            paymentMethod,
            deliveryCharge: 0,
            address:        addressString,
            invoiceDate:    new Date(),
            status:         'Pending',
            couponApplied:  !!couponCode
        });

        await order.save();
        savedOrder = order;

        // ── 10. Debit wallet AFTER order saved ───────────────────
        // ✅ Only runs if paymentMethod is Wallet
        if (paymentMethod === 'Wallet') {
            try {
                await debitWallet({
                    userId,
                    amount:      finalAmount,
                    orderId:     order.orderId,
                    description: `Payment for order #${order.orderId}`
                });
            } catch (walletErr) {
                // ✅ Rollback: delete order if wallet debit fails
                await Order.findByIdAndDelete(savedOrder._id).catch(() => {});
                return res.status(400).json({
                    success: false,
                    message: walletErr.message || 'Wallet payment failed'
                });
            }
        }

        // ── 11. Reduce stock AFTER order saved ───────────────────
        const stockResult = await reduceStock(cart.items);
        if (!stockResult.success) {
            // ✅ Rollback order
            await Order.findByIdAndDelete(savedOrder._id).catch(() => {});

            // ✅ Refund wallet if wallet was used
            if (paymentMethod === 'Wallet') {
                const { creditWallet } = require('./walletController');
                await creditWallet({
                    userId,
                    amount:      finalAmount,
                    orderId:     order.orderId,
                    type:        'refund',
                    description: `Refund for failed order #${order.orderId}`
                }).catch(() => {});
            }

            return res.status(500).json({
                success: false,
                message: 'Stock update failed. Order cancelled. Please try again.'
            });
        }

        // ── 12. Clear cart ───────────────────────────────────────
        try {
            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [] } }
            );
        } catch (cartErr) {
            console.error('Cart clear failed (non-critical):', cartErr);
        }

        return res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.orderId,
            _id:     order._id
        });

    } catch (error) {
        if (savedOrder) {
            await Order.findByIdAndDelete(savedOrder._id).catch(() => {});
        }
        console.error('placeOrder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to place order. Please try again.'
        });
    }
};

// ── ORDER SUCCESS PAGE ───────────────────────────────────────────
const getOrderSuccess = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.redirect('/shop');
        res.render('user/orderSuccess', { user: req.session.user, order });
    } catch (error) {
        res.redirect('/shop');
    }
};

// ── CREATE RAZORPAY ORDER ────────────────────────────────────────
const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const { addressId, couponCode, couponDiscount } = req.body;

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(400).json({
                success: false, message: 'No address found.'
            });
        }

        const selectedAddress = addressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({
                success: false, message: 'Selected address not found'
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false, message: 'Your cart is empty'
            });
        }

        // ✅ Validate stock before creating Razorpay order
        const stockCheck = await validateStock(cart.items);
        if (!stockCheck.valid) {
            return res.status(400).json({
                success: false, message: stockCheck.message
            });
        }

        const totalPrice  = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
        const discount    = Number(couponDiscount) || 0;
        const finalAmount = Math.max(totalPrice - discount, 0);

        const razorpayOrder = await razorpay.orders.create({
            amount:   Math.round(finalAmount * 100),
            currency: 'INR',
            receipt:  `receipt_${Date.now()}`
        });

        // ✅ Store everything needed for verify step
        req.session.pendingOrder = {
            addressId,
            couponCode:      couponCode  || null,
            couponDiscount:  discount,
            totalPrice,
            finalAmount,
            razorpayOrderId: razorpayOrder.id
        };

        return res.status(200).json({
            success:         true,
            razorpayOrderId: razorpayOrder.id,
            amount:          razorpayOrder.amount,
            currency:        razorpayOrder.currency,
            keyId:           process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('createRazorpayOrder error:', error);
        res.status(500).json({
            success: false, message: 'Failed to create payment order'
        });
    }
};

// ── VERIFY RAZORPAY PAYMENT ──────────────────────────────────────
const verifyRazorpayPayment = async (req, res) => {
    let savedOrder = null;  // track for rollback

    try {
        const userId = req.session.user?._id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // ── 1. Verify signature ──────────────────────────────────
        const body     = razorpay_order_id + '|' + razorpay_payment_id;
        const expected = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expected !== razorpay_signature) {
            return res.status(400).json({
                success: false, message: 'Payment verification failed. Invalid signature.'
            });
        }

        // ── 2. Get pending order from session ────────────────────
        const pending = req.session.pendingOrder;
        if (!pending) {
            return res.status(400).json({
                success: false, message: 'No pending order found. Please try again.'
            });
        }

        // ── 3. Get address ───────────────────────────────────────
        const addressDoc = await Address.findOne({ userId });
        const selectedAddress = addressDoc?.address.id(pending.addressId);
        if (!selectedAddress) {
            return res.status(400).json({
                success: false, message: 'Address not found'
            });
        }

        // ── 4. Get cart ──────────────────────────────────────────
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false, message: 'Cart is empty'
            });
        }

        // ── 5. Validate stock AGAIN before saving ────────────────
        // ✅ Stock could have changed between payment and verify
        const stockCheck = await validateStock(cart.items);
        if (!stockCheck.valid) {
            // Payment was taken but stock unavailable — flag for refund
            delete req.session.pendingOrder;
            return res.status(400).json({
                success: false,
                message: `${stockCheck.message}. Your payment will be refunded within 5-7 business days.`
            });
        }

        // ── 6. Build orderedItems ────────────────────────────────
        const orderedItems = cart.items.map(item => ({
            product:      item.productId._id,
            productName:  item.productId.productName,
            productImage: item.productId.productImage || [],
            quantity:     item.quantity,
            size:         item.size,
            price:        item.price
        }));

        // ── 7. Mark coupon as used ───────────────────────────────
        if (pending.couponCode) {
            const coupon = await Coupon.findOne({
                name:     pending.couponCode.toUpperCase(),
                isList:   true,
                expireOn: { $gte: new Date() }
            });
            if (coupon && !coupon.userId.includes(userId)) {
                coupon.userId.push(userId);
                await coupon.save();
            }
        }

        // ── 8. Save order FIRST ──────────────────────────────────
        // ✅ Order saved before touching stock or cart
        const order = new Order({
            userId,
            orderedItems,
            totalPrice:     pending.totalPrice,
            dicount:        pending.couponDiscount,
            finalAmount:    pending.finalAmount,
            paymentMethod:  'Online',
            deliveryCharge: 0,
            address:        buildAddressString(selectedAddress),
            invoiceDate:    new Date(),
            status:         'Pending',
            couponApplied:  !!pending.couponCode
        });

        await order.save();
        savedOrder = order;  // track for rollback

        // ── 9. Reduce stock AFTER order saved ────────────────────
        const stockResult = await reduceStock(cart.items);
        if (!stockResult.success) {
            // Rollback: delete the saved order
            await Order.findByIdAndDelete(savedOrder._id).catch(() => {});
            delete req.session.pendingOrder;
            return res.status(500).json({
                success: false,
                message: 'Stock update failed. Order cancelled. Payment will be refunded.'
            });
        }

        // ── 10. Clear cart AFTER stock reduced ───────────────────
        try {
            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [] } }
            );
        } catch (cartErr) {
            console.error('Cart clear failed (non-critical):', cartErr);
        }

        // ── 11. Clear pending session ────────────────────────────
        delete req.session.pendingOrder;

        return res.status(200).json({
            success: true,
            message: 'Payment verified and order placed',
            orderId: order.orderId,
            _id:     order._id
        });

    } catch (error) {
        // ✅ Rollback saved order if something failed after save
        if (savedOrder) {
            await Order.findByIdAndDelete(savedOrder._id).catch(() => {});
        }
        delete req.session.pendingOrder;
        console.error('verifyRazorpayPayment error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed. Please contact support.'
        });
    }
};

// ── PAYMENT FAILED ───────────────────────────────────────────────
const paymentFailed = async (req, res) => {
    try {
        // ✅ Just clear session — stock and cart are untouched
        // because stock is NEVER reduced until verifyRazorpayPayment succeeds
        delete req.session.pendingOrder;
        res.status(200).json({ success: true, message: 'Payment cancelled' });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};


// ── GET /user/coupons ─────────────────────────────────────────────
const getUserCoupons = async (req, res) => {
    try {
        const userId = req.session.user?._id;

        const coupons = await Coupon.find({}).sort({ expireOn: 1 }).lean();

        res.render('user/coupons', {
            user:    req.session.user,
            coupons,
            userId
        });
    } catch (err) {
        console.error('getUserCoupons error:', err);
        res.redirect('/pageNotFound');
    }
};

module.exports = {
    getCheckout,
    applyCoupon,
    placeOrder,
    getOrderSuccess,
    createRazorpayOrder,
    verifyRazorpayPayment,
    paymentFailed,
     getUserCoupons 
};