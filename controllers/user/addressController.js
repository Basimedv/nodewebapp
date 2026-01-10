const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');

// HTTP Status Codes
const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const INTERNAL_SERVER_ERROR = 500;

// Load Checkout Page
const loadCheckout = async (req, res) => {
    try {
        const user = req.user;
        const userId = user._id;

        // Fetch addresses - note the structure returns array of address documents
        const addressDocs = await Address.find({ userId });
        
        // Extract all addresses from all documents (though usually there's only one doc per user)
        const addresses = addressDocs.reduce((acc, doc) => {
            return acc.concat(doc.address);
        }, []);

        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        let cartTotal = 0;
        let deliveryCharge = 0;
        let grandTotal = 0;

        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => acc + item.quantity * item.price, 0);
            deliveryCharge = cartTotal < 499 ? 39 : 0;
            grandTotal = cartTotal + deliveryCharge;
        }

        const currentDate = new Date();

        const coupons = await Coupon.find({
            status: 'Active',
            startDate: { $lte: currentDate },
            expiryDate: { $gte: currentDate },
            minPrice: { $lte: grandTotal }
        });

        // Map cart items to include finalPrice
        const cartItems = cart.items.map(item => ({
            ...item.toObject(),
            finalPrice: item.price,
            productId: item.productId
        }));

        res.render('user/checkout', { 
            siteName: 'COLINGUEST',
            title: "Checkout", 
            coupons, 
            user, 
            address: addressDocs, // Keep original name for compatibility
            addresses, // Also provide as addresses for new template
            cart, // Keep original cart object
            cartItems, // Also provide processed items
            subtotal: cartTotal,
            deliveryCharge,
            total: grandTotal,
            couponDiscount: 0,
            calculatedValues: { cartTotal, deliveryCharge, grandTotal }
        });
    } catch (error) {
        console.error('Error loading checkout:', error);
        res.redirect('/user/cart');
    }
};

// Add Address from Checkout Page
const addShoppingAddress = async (req, res) => {
    try {
        // Map field names from your form to schema
        const { 
            name,           // from your EJS form
            phone, 
            altPhone,       // from your EJS form
            landMark,       // from your EJS form
            city, 
            state, 
            pinCode,        // from your EJS form
            addressType 
        } = req.body;

        const userId = req.session.user?.id ?? req.session.user?._id ?? null;

        if (!userId) {
            return res.status(UNAUTHORIZED).json({ 
                success: false,
                message: "Please login to continue" 
            });
        }

        // Validation
        if (!name || !phone || !landMark || !city || !state || !pinCode || !addressType) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "All required fields must be filled." 
            });
        }

        // Validate phone numbers
        if (!/^\d{10}$/.test(phone.toString().trim())) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Phone number must be 10 digits" 
            });
        }

        if (altPhone && !/^\d{10}$/.test(altPhone.toString().trim())) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Alternate phone number must be 10 digits" 
            });
        }

        // Validate pincode
        if (!/^\d{6}$/.test(pinCode.toString().trim())) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Pin code must be 6 digits" 
            });
        }

        let userAddress = await Address.findOne({ userId });

        if (!userAddress) {
            userAddress = new Address({ userId, address: [] });
        }

        userAddress.address.push({
            addressType,
            name: name.trim(),
            city: city.trim(), 
            landMark: landMark.trim(), 
            state: state.trim(),
            pinCode: parseInt(pinCode),
            phone: phone.toString().trim(), 
            altPhone: altPhone ? altPhone.toString().trim() : phone.toString().trim()
        });

        await userAddress.save();

        return res.status(CREATED).json({ 
            success: true,
            message: "Address added successfully"
        });

    } catch (error) {
        console.error("Error adding address:", error);
        return res.status(INTERNAL_SERVER_ERROR).json({ 
            success: false,
            message: error.message || "Address creation error" 
        });
    }
};

// Edit Address from Checkout Page
const editShoppingAddress = async (req, res) => {
    try {
        const { 
            name, 
            phone, 
            altPhone, 
            landMark, 
            city, 
            state, 
            pinCode, 
            addressType, 
            addressIndex  // Changed from index to addressIndex
        } = req.body;

        const userId = req.session.user?.id ?? req.session.user?._id ?? null;

        if (!userId) {
            return res.status(UNAUTHORIZED).json({ 
                success: false,
                message: "Please login to continue" 
            });
        }

        // Validation
        if (!name || !phone || !landMark || !city || !state || !pinCode || !addressType || addressIndex === undefined) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "All required fields must be filled." 
            });
        }

        // Validate phone numbers
        if (!/^\d{10}$/.test(phone.toString().trim())) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Phone number must be 10 digits" 
            });
        }

        if (altPhone && !/^\d{10}$/.test(altPhone.toString().trim())) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Alternate phone number must be 10 digits" 
            });
        }

        // Validate pincode
        if (!/^\d{6}$/.test(pinCode.toString().trim())) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Pin code must be 6 digits" 
            });
        }

        let userAddress = await Address.findOne({ userId });

        if (!userAddress || !userAddress.address[addressIndex]) {
            return res.status(NOT_FOUND).json({ 
                success: false,
                message: "Address not found" 
            });
        }

        userAddress.address[addressIndex] = {
            addressType, 
            name: name.trim(),
            city: city.trim(), 
            landMark: landMark.trim(),
            state: state.trim(), 
            pinCode: parseInt(pinCode),
            phone: phone.toString().trim(), 
            altPhone: altPhone ? altPhone.toString().trim() : phone.toString().trim()
        };

        await userAddress.save();

        return res.status(OK).json({ 
            success: true,
            message: "Address updated successfully"
        });

    } catch (error) {
        console.error("Error updating address:", error);
        return res.status(INTERNAL_SERVER_ERROR).json({ 
            success: false,
            message: error.message || "Address editing error" 
        });
    }
};

// Apply Coupon
const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user?.id ?? req.session.user?._id ?? null;

        if (!userId) {
            return res.status(UNAUTHORIZED).json({ 
                success: false, 
                message: "Please login to continue" 
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(BAD_REQUEST).json({ 
                success: false, 
                message: "Your cart is empty" 
            });
        }

        // Calculate cart total
        const subtotal = cart.items.reduce((acc, item) => {
            return acc + (item.price * item.quantity);
        }, 0);

        const deliveryCharge = subtotal < 499 ? 39 : 0;
        const total = subtotal + deliveryCharge;

        const coupon = await Coupon.findOne({ 
            code: couponCode.toUpperCase(),
            status: 'Active',
            expiryDate: { $gte: new Date() },
            startDate: { $lte: new Date() }
        });

        if (!coupon) {
            return res.status(NOT_FOUND).json({ 
                success: false, 
                message: "Invalid or expired coupon code" 
            });
        }

        if (total < coupon.minPrice) {
            return res.status(BAD_REQUEST).json({ 
                success: false, 
                message: `Minimum purchase of ₹${coupon.minPrice} required to use this coupon` 
            });
        }

        // Check if user already used this coupon
        if (coupon.userId && coupon.userId.includes(userId)) {
            return res.status(BAD_REQUEST).json({ 
                success: false, 
                message: "You have already used this coupon" 
            });
        }

        const discount = Math.min(coupon.offerPrice, subtotal);

        // Store in session
        req.session.appliedCoupon = {
            code: coupon.code,
            discount: discount,
            couponId: coupon._id
        };

        return res.status(OK).json({ 
            success: true, 
            message: "Coupon applied successfully",
            discount: discount,
            couponId: coupon._id
        });

    } catch (error) {
        console.error("Error applying coupon:", error);
        return res.status(INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to apply coupon" 
        });
    }
};

// Checkout Details (Save to session and redirect to payment)
const checkoutDetails = async (req, res) => {
    const { selectedAddress, couponDiscount, couponId } = req.body;

    req.session.deliveryAddress = selectedAddress;
    req.session.couponDiscount = couponDiscount;
    req.session.couponId = couponId;

    res.redirect('/user/payments');
};

// Confirm Order
const confirmOrder = async (req, res) => {
    try {
        const user = req.user;
        const userId = user._id;

        const orders = await Order.find({ userId })
            .populate('orderItems.product')
            .sort({ createdAt: -1 })
            .limit(1);

        if (!orders.length) {
            console.error('No matching orders found.');
            return res.status(NOT_FOUND).render('error', { 
                siteName: 'COLINGUEST',
                title: "error", 
                message: 'No matching orders found.' 
            });
        }

        const addressId = orders[0].address;

        const address = await Address.findOne(
            { 'address._id': addressId }
        );

        if (!address) {
            console.error('Address not found.');
            return res.status(NOT_FOUND).render('error', {
                siteName: 'COLINGUEST',
                title: "error", 
                message: 'Shipping address not found.' 
            });
        }

        const shippingAddress = address.address.find(
            addr => addr._id.toString() === addressId.toString()
        );

        return res.render('user/confirmOrder', { 
            siteName: 'COLINGUEST',
            title: "Order Confirmation", 
            user, 
            shippingAddress, 
            orders 
        });
    } catch (error) {
        console.error(`Error confirming order: ${error}`);
        return res.status(INTERNAL_SERVER_ERROR).render('error', { 
            siteName: 'COLINGUEST',
            title: "error", 
            message: 'Something went wrong. Please try again later.' 
        });
    }
};

module.exports = { 
    loadCheckout, 
    addShoppingAddress, 
    checkoutDetails, 
    editShoppingAddress,
    applyCoupon,
    confirmOrder
};