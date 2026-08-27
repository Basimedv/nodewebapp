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
const applyCoupon = async (req, res) => {
    try {
        const userId             = req.session.user?._id;
        const { code, subtotal } = req.body;

        if (!code?.trim()) {
            return res.status(400).json({ success: false, message: 'Please enter a coupon code' });
        }

        const now    = new Date();
        const coupon = await Coupon.findOne({
            code:      code.trim().toUpperCase(),
            isActive:  true,
            startDate: { $lte: now },
            endDate:   { $gte: now }
        });

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
        }

        // Usage limit
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
        }

        // Already used by this user
        if (coupon.usedBy.some(id => id.toString() === userId.toString())) {
            return res.status(400).json({ success: false, message: 'You have already used this coupon' });
        }

        // Allowed users check
        if (coupon.allowedUsers.length > 0 &&
            !coupon.allowedUsers.some(id => id.toString() === userId.toString())) {
            return res.status(400).json({ success: false, message: 'This coupon is not available for your account' });
        }

        // First order only
        if (coupon.firstOrderOnly) {
            const pastOrder = await Order.findOne({ userId });
            if (pastOrder) {
                return res.status(400).json({ success: false, message: 'This coupon is for first-time orders only' });
            }
        }

        // Minimum order
        if (subtotal < coupon.minOrderAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount is ₹${coupon.minOrderAmount.toLocaleString('en-IN')}`
            });
        }

        // Calculate discount
        const discount   = coupon.calculateDiscount(subtotal);
        const finalTotal = Math.max(subtotal - discount, 0);

        return res.status(200).json({
            success:    true,
            message:    `Coupon applied! You saved ₹${discount.toLocaleString('en-IN')}`,
            discount,
            finalTotal,
            couponCode: coupon.code
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
          
// NEW — replace with this
const coupon = await Coupon.findOne({
    code:     couponCode.toUpperCase(),
    isActive: true,
    endDate:  { $gte: new Date() }
});
if (coupon && !coupon.usedBy.includes(userId)) {
    coupon.usedBy.push(userId);
    coupon.usedCount = (coupon.usedCount || 0) + 1;
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

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const { addressId, couponCode, couponDiscount } = req.body;

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(400).json({ success: false, message: 'No address found.' });
        }

        const selectedAddress = addressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Selected address not found' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        const stockCheck = await validateStock(cart.items);
        if (!stockCheck.valid) {
            return res.status(400).json({ success: false, message: stockCheck.message });
        }

        const totalPrice  = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
        const discount    = Number(couponDiscount) || 0;
        const finalAmount = Math.max(totalPrice - discount, 0);

        const razorpayOrder = await razorpay.orders.create({
            amount:   Math.round(finalAmount * 100),
            currency: 'INR',
            receipt:  `receipt_${Date.now()}`
        });

        // ── Snapshot cart items now, while we still have them ────
        const orderedItems = cart.items.map(item => ({
            product:      item.productId._id,
            productName:  item.productId.productName,
            productImage: item.productId.productImage || [],
            quantity:     item.quantity,
            size:         item.size,
            price:        item.price
        }));

        // ✅ NEW — save a draft order BEFORE payment.
        // Guarantees order-success AND order-failure always have data.
        const draftOrder = new Order({
            userId,
            orderedItems,
            totalPrice,
            dicount:         discount,
            finalAmount,
            paymentMethod:   'Online',
            deliveryCharge:  0,
            address:         buildAddressString(selectedAddress),
            invoiceDate:     new Date(),
            status:          'Payment Pending',
            couponApplied:   !!couponCode,
            razorpayOrderId: razorpayOrder.id
        });

        await draftOrder.save();

        // ✅ Only store the lookup info needed by verify/failure handlers
        req.session.pendingOrder = {
            orderDocId:      draftOrder._id,
            couponCode:      couponCode || null,
            razorpayOrderId: razorpayOrder.id
        };

        return res.status(200).json({
            success:         true,
            razorpayOrderId: razorpayOrder.id,
            amount:          razorpayOrder.amount,
            currency:        razorpayOrder.currency,
            keyId:           process.env.RAZORPAY_KEY_ID,
            orderDocId:      draftOrder._id   // frontend keeps this for failure redirect
        });

    } catch (error) {
        console.error('createRazorpayOrder error:', error);
        res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const pending = req.session.pendingOrder;
        if (!pending?.orderDocId) {
            return res.status(400).json({
                success: false, message: 'No pending order found. Please try again.'
            });
        }

        const draftOrder = await Order.findById(pending.orderDocId);
        if (!draftOrder) {
            return res.status(400).json({
                success: false, message: 'Order not found. Please try again.'
            });
        }

        // ── 1. Verify signature ──────────────────────────────────
        const body     = razorpay_order_id + '|' + razorpay_payment_id;
        const expected = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expected !== razorpay_signature) {
            draftOrder.status = 'Failed';
            await draftOrder.save();
            delete req.session.pendingOrder;
            return res.status(400).json({
                success:    false,
                message:    'Payment verification failed. Invalid signature.',
                orderDocId: draftOrder._id
            });
        }

        // ── 2. Re-check stock right before committing ───────────
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const stockCheck = (cart && cart.items.length)
            ? await validateStock(cart.items)
            : { valid: false, message: 'Cart is empty' };

        if (!stockCheck.valid) {
            draftOrder.status            = 'Failed';
            draftOrder.razorpayPaymentId = razorpay_payment_id;
            await draftOrder.save();
            delete req.session.pendingOrder;
            return res.status(400).json({
                success:    false,
                message:    `${stockCheck.message}. Your payment will be refunded within 5-7 business days.`,
                orderDocId: draftOrder._id
            });
        }

        // ── 3. Reduce stock ───────────────────────────────────────
        const stockResult = await reduceStock(cart.items);
        if (!stockResult.success) {
            draftOrder.status            = 'Failed';
            draftOrder.razorpayPaymentId = razorpay_payment_id;
            await draftOrder.save();
            delete req.session.pendingOrder;
            return res.status(500).json({
                success:    false,
                message:    'Stock update failed. Payment will be refunded.',
                orderDocId: draftOrder._id
            });
        }

        // ── 4. Mark coupon as used ────────────────────────────────
        if (pending.couponCode) {
            const coupon = await Coupon.findOne({
                code:     pending.couponCode.toUpperCase(),
                isActive: true,
                endDate:  { $gte: new Date() }
            });
            if (coupon && !coupon.usedBy.some(id => id.toString() === userId.toString())) {
                coupon.usedBy.push(userId);
                coupon.usedCount = (coupon.usedCount || 0) + 1;
                await coupon.save();
            }
        }

        // ── 5. Promote draft → real order ──────────────────────────
        draftOrder.status            = 'Pending';
        draftOrder.razorpayPaymentId = razorpay_payment_id;
        await draftOrder.save();

        // ── 6. Clear cart ───────────────────────────────────────────
        try {
            await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
        } catch (cartErr) {
            console.error('Cart clear failed (non-critical):', cartErr);
        }

        delete req.session.pendingOrder;

        return res.status(200).json({
            success: true,
            message: 'Payment verified and order placed',
            orderId: draftOrder.orderId,
            _id:     draftOrder._id
        });

    } catch (error) {
        console.error('verifyRazorpayPayment error:', error);
        const pending = req.session.pendingOrder;
        if (pending?.orderDocId) {
            await Order.findByIdAndUpdate(pending.orderDocId, { status: 'Failed' }).catch(() => {});
        }
        delete req.session.pendingOrder;
        return res.status(500).json({
            success: false, message: 'Payment verification failed. Please contact support.'
        });
    }
};
const paymentFailed = async (req, res) => {
    try {
        const pending = req.session.pendingOrder;

        if (pending?.orderDocId) {
            await Order.findByIdAndUpdate(pending.orderDocId, { status: 'Failed' });
        }

        delete req.session.pendingOrder;

        return res.status(200).json({
            success:    true,
            message:    'Payment cancelled',
            orderDocId: pending?.orderDocId || null
        });
    } catch (error) {
        console.error('paymentFailed error:', error);
        res.status(500).json({ success: false });
    }
};


const getUserCoupons = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const now    = new Date();
 
        // Fetch all coupons (active + inactive + expired)
        // so the user can see used/expired ones too
        const coupons = await Coupon.find({}).lean();
 
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
const getAvailableCoupons = async (req, res) => {
    try {
        const userId   = req.session.user?._id;
        const subtotal = parseFloat(req.query.subtotal) || 0;
        const now      = new Date();

        const mongoose = require('mongoose');
        const userObjId = new mongoose.Types.ObjectId(userId); // ✅ ensure ObjectId

        const coupons = await Coupon.find({
            isActive:  true,
            startDate: { $lte: now },
            endDate:   { $gte: now },
            usedBy:    { $ne: userObjId },        // ✅ user hasn't used it
            $or: [
                { allowedUsers: { $exists: false } },
                { allowedUsers: { $size: 0 } },
                { allowedUsers: userObjId }        // ✅ user is allowed
            ]
        }).lean();

        const eligible = coupons.filter(c =>
            subtotal >= (c.minOrderAmount || 0) &&
            (c.usageLimit === 0 || (c.usedCount || 0) < c.usageLimit)
        );

        const shaped = eligible.map(c => ({
            code:           c.code,
            type:           c.type,
            value:          c.value,
            minOrderAmount: c.minOrderAmount || 0,
            maxDiscount:    c.maxDiscount    || 0,
            endDate:        c.endDate,
            description:    c.description   || ''
        }));

        res.json({ success: true, coupons: shaped });
    } catch (err) {
        console.error('getAvailableCoupons error:', err);
        res.status(500).json({ success: false, coupons: [] });
    }
};
const getOrderFailure = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.redirect('/shop');
        res.render('user/order-failure', { user: req.session.user, order });
    } catch (error) {
        res.redirect('/shop');
    }
};
module.exports = {
    getCheckout,
    applyCoupon,
    placeOrder,
    getOrderSuccess,
    getOrderFailure, 
    createRazorpayOrder,
    verifyRazorpayPayment,
    paymentFailed,
     getUserCoupons ,
     getAvailableCoupons
};