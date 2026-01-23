const User = require('../../models/userSchema')
const Cart = require('../../models/cartSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema')
const Coupon = require('../../models/couponSchema')

// HTTP Status Codes
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const INTERNAL_SERVER_ERROR = 500;
const CREATED = 201;
const OK = 200;

const loadCheckout = async (req, res) => {
    try {
        const user = req.user;
        const userId = user._id;

        const addressDoc = await Address.find({ userId });
        const cart = await Cart.findOne({ userId }).populate('items.productId', 'productName productImage regularPrice productOffer stock category');
        
        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        let cartTotal = 0;
        let deliveryCharge = 0;
        let grandTotal = 0;

        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => {
                const regularPrice = item.productId.regularPrice || 0;
                const productOffer = item.productId.productOffer || 0;
                const categoryOffer = item.productId.category?.categoryOffer || 0;
                
                let itemPrice = regularPrice;
                
                // Apply product offer if exists
                if (productOffer > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
                }
                // Apply category offer if no product offer
                else if (categoryOffer > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
                }
                
                return acc + (itemPrice * item.quantity);
            }, 0);
            deliveryCharge = cartTotal < 499 ? 39 : 0;
            grandTotal = cartTotal + deliveryCharge;
        }

        // Only apply coupon discount if user explicitly applied it (not automatic)
        let couponDiscount = 0;
        let appliedCoupon = null;
        
        // Check if coupon was manually applied by user (not automatic)
        const hasUserAppliedCoupon = req.session.userAppliedCoupon || false;
        
        if (hasUserAppliedCoupon && cart.discount && cart.discount > 0 && cart.appliedCoupon) {
            couponDiscount = cart.discount;
            appliedCoupon = cart.appliedCoupon;
            grandTotal = grandTotal - couponDiscount; // Include coupon discount in final total
        }

        const currentDate = new Date();

        const coupons = await Coupon.find({
            status: 'Active',
            startDate: { $lte: currentDate },
            expiryDate: { $gte: currentDate },
            minPrice: { $lte: grandTotal }
        });

        // Extract addresses from address documents using correct schema structure
        const addresses = addressDoc.reduce((acc, doc) => {
            const addressesWithId = doc.address.map(addr => ({
                ...addr.toObject(),
                _id: doc._id.toString() + '_' + doc.address.indexOf(addr) // Create unique ID
            }));
            return acc.concat(addressesWithId);
        }, []);

        // Map cart items
        const cartItems = cart.items.map(item => {
            const regularPrice = item.productId.regularPrice || 0;
            const productOffer = item.productId.productOffer || 0;
            const categoryOffer = item.productId.category?.categoryOffer || 0;
            
            let finalPrice = regularPrice;
            let offerPercent = 0;
            
            // Apply product offer if exists
            if (productOffer > 0) {
                finalPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
                offerPercent = productOffer;
            }
            // Apply category offer if no product offer
            else if (categoryOffer > 0) {
                finalPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
                offerPercent = categoryOffer;
            }
            
            return {
                ...item.toObject(),
                regularPrice: regularPrice,
                offerPercent: offerPercent,
                finalPrice: finalPrice,
                productId: item.productId
            };
        });

        res.render('user/checkout', { 
            siteName: 'COLINGUEST',
            title: "Checkout", 
            coupons, 
            user, 
            address: addressDoc,
            addresses, 
            cart,
            cartItems,
            subtotal: cartTotal,
            deliveryCharge,
            discount: couponDiscount,
            total: grandTotal,
            appliedCoupon: appliedCoupon,
            couponDiscount: couponDiscount,
            calculatedValues: { cartTotal, deliveryCharge, grandTotal, couponDiscount }
        });
    } catch (error) {
        console.error('Error loading checkout:', error);
        res.status(500).send('Server Error');
    }
};

// Add Address from Checkout Page
const addShoppingAddress = async (req, res) => {
    try {
        console.log('Request body:', req.body);
        
        // Map incoming fields to expected format
        const addressData = {
            name: req.body.name || req.body.fullName,
            phone: req.body.phone,
            altPhone: req.body.altPhone || req.body.altNumber || '',
            landmark: req.body.landmark || req.body.addressLine1 || '',
            city: req.body.city,
            state: req.body.state,
            pinCode: req.body.pinCode || req.body.zipCode,
            addressType: req.body.addressType || 'Home',
            country: req.body.country || 'India'
        };
        
        console.log('Processed address data:', addressData);
        
        // Get user ID from session
        const userId = req.session.user?._id || req.session.user?.id;
        console.log('User ID from session:', userId);
        
        // Destructure with defaults
        const {
            name,
            phone,
            altPhone,
            landmark,
            city,
            state,
            pinCode,
            addressType,
            addressLine1,
            addressLine2
        } = req.body;

        if (!userId) {
            return res.status(UNAUTHORIZED).json({ 
                success: false,
                message: "Please login to continue" 
            });
        }

        // Validation
        if (!name || !phone || !city || !state || !pinCode || !landmark) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "All required fields must be filled." 
            });
        }

        // Validate phone numbers
        if (!/^\d{10}$/.test(phone)) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Phone number must be 10 digits" 
            });
        }

        if (altPhone && !/^\d{10}$/.test(altPhone)) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Alternate phone number must be 10 digits" 
            });
        }

        // Validate pincode
        if (!/^\d{5,6}$/.test(pinCode)) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Pin code must be 5-6 digits" 
            });
        }

        try {
            let userAddress = await Address.findOne({ userId });

            if (!userAddress) {
                userAddress = new Address({ userId, address: [] });
            }

            userAddress.address.push({
                addressType: addressType || 'Home',
                name: name,
                city: city,
                landMark: landmark,
                state: state,
                pinCode: parseInt(pinCode),
                phone: phone,
                altPhone: altPhone || phone
            });

            await userAddress.save();

            return res.status(201).json({ 
                success: true,
                message: "Address added successfully"
            });
        } catch (saveError) {
            console.error('Error saving address:', saveError);
            return res.status(500).json({
                success: false,
                message: 'Failed to save address. Please try again.'
            });
        }

    } catch (error) {
        console.error("Error adding address:", error);
        return res.status(INTERNAL_SERVER_ERROR).json({ 
            error: error.message || "Address creation error" 
        });
    }
};

// Edit Address from Checkout Page
const editShoppingAddress = async (req, res) => {
    try {
        const { name, phone, addressLine1, addressLine2, landmark, city, state, pinCode, addressType, index } = req.body;

        const userId = req.session.user?.id ?? req.session.user?._id ?? null;

        if (!userId) {
            return res.status(UNAUTHORIZED).json({ 
                error: "Please login to continue" 
            });
        }

        // Validation
        if (!name || !phone || !addressLine1 || !city || !state || !pinCode || !addressType) {
            return res.status(BAD_REQUEST).json({ 
                error: "All required fields must be filled." 
            });
        }

        // Validate phone numbers
        if (!/^\d{10}$/.test(phone)) {
            return res.status(BAD_REQUEST).json({ 
                error: "Phone number must be 10 digits" 
            });
        }

        // Validate pincode
        if (!/^\d{5,6}$/.test(pinCode)) {
            return res.status(BAD_REQUEST).json({ 
                success: false,
                message: "Pin code must be 5-6 digits" 
            });
        }

        const userAddress = await Address.findOne({ userId });
        
        if (!userAddress) {
            return res.status(NOT_FOUND).json({
                success: false,
                message: 'User address not found'
            });
        }

        // Update the address at the specified index
        const addressIndex = parseInt(index);
        if (isNaN(addressIndex) || addressIndex < 0 || addressIndex >= userAddress.details.length) {
            return res.status(BAD_REQUEST).json({
                success: false,
                message: 'Invalid address index'
            });
        }

        // Update the address fields
        userAddress.details[addressIndex] = {
            ...userAddress.details[addressIndex],
            addressType: addressType || 'Home',
            name: name,
            city: city,
            landmark: landmark,
            state: state,
            pincode: parseInt(pinCode),
            phone: phone,
            altPhone: req.body.altPhone || phone,
            addressLine1: addressLine1,
            addressLine2: addressLine2 || ''
        };

        await userAddress.save();

        return res.status(200).json({ 
            success: true,
            message: 'Address updated successfully',
            address: userAddress.details[addressIndex]
        });
    } catch (error) {
        console.error("Error in editShoppingAddress:", error);
        return res.status(INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Error updating address"
        });
    }
};

// Checkout Details (Save to session and redirect to payment)
const checkoutDetails = async (req, res) => {
    const { selectedAddress, couponDiscount, couponId } = req.body;

    req.session.deliveryAddress = selectedAddress;
    req.session.couponDiscount = couponDiscount;
    req.session.couponId = couponId;

    res.redirect('/payment');
};

// Process Payment
const processPayment = async (req, res) => {
    try {
        const user = req.user;
        const userId = user._id;
        const { paymentMethod } = req.body;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please login to continue' 
            });
        }

        if (!paymentMethod) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please select a payment method' 
            });
        }

        // Get cart and calculate totals
        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category'
            }
        });
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Your cart is empty' 
            });
        }

        // Calculate totals with offers and coupon discount
        let cartTotal = 0;
        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => {
                const regularPrice = item.productId.regularPrice || 0;
                const productOffer = item.productId.productOffer || 0;
                const categoryOffer = item.productId.category?.categoryOffer || 0;
                
                let itemPrice = regularPrice;
                
                // Apply product offer if exists
                if (productOffer > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
                }
                // Apply category offer if no product offer
                else if (categoryOffer > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
                }
                
                return acc + (itemPrice * item.quantity);
            }, 0);
        }

        const deliveryCharge = cartTotal < 499 ? 39 : 0;
        let grandTotal = cartTotal + deliveryCharge;

        // Only apply coupon discount if user explicitly applied it (not automatic)
        let discount = 0;
        let appliedCoupon = null;
        
        // Check if coupon was manually applied by user (not automatic)
        const hasUserAppliedCoupon = req.session.userAppliedCoupon || false;
        
        if (hasUserAppliedCoupon && cart.discount && cart.discount > 0 && cart.appliedCoupon) {
            discount = cart.discount;
            appliedCoupon = cart.appliedCoupon;
        }

        const finalTotal = grandTotal - discount;

        // Get selected address from session
        let selectedAddress = null;
        
        if (req.session.selectedAddressId) {
            const [docId, addressIndex] = req.session.selectedAddressId.split('_');
            const addressDoc = await Address.findOne({ userId });
            if (addressDoc && addressDoc.address && addressDoc.address.length > parseInt(addressIndex)) {
                selectedAddress = addressDoc.address[parseInt(addressIndex)];
            }
        }

        // Wallet balance validation for wallet payment
        if (paymentMethod === 'wallet') {
            const Wallet = require('../../models/walletSchema');
            const walletController = require('./walletController');
            
            // Calculate current wallet balance
            const currentBalance = await walletController.calculateWalletBalance(userId);
            console.log('🔍 Wallet Balance Check:', {
                currentBalance: currentBalance,
                orderTotal: finalTotal,
                paymentMethod: paymentMethod
            });
            
            if (currentBalance < finalTotal) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance. Please choose another payment method.',
                    currentBalance: currentBalance,
                    requiredAmount: finalTotal,
                    shortfall: finalTotal - currentBalance
                });
            }
        }

        // Create order
        const Order = require('../../models/orderSchema');
        
        // Map cart items to order items format and update stock
        const orderItems = [];
        const Product = require('../../models/productSchema');
        
        for (const item of cart.items) {
            console.log('🔍 Cart Item Structure:', JSON.stringify(item, null, 2));
            
            // Get product details - item.productId is already populated
            const product = item.productId; // Since it's populated, no need for separate query
            
            if (!product) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Product not found: ${item.productId}` 
                });
            }
            
            // Check and update stock
            const sizeKey = item.size || 'M';
            const currentStock = product.stock[sizeKey] || 0;
            
            if (currentStock < item.quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient stock for ${product.productName}. Available: ${currentStock}, Requested: ${item.quantity}` 
                });
            }
            
            // Reduce stock
            product.stock[sizeKey] = currentStock - item.quantity;
            await product.save();
            
            console.log(`📦 Stock updated for ${product.productName} size ${sizeKey}: ${currentStock} → ${product.stock[sizeKey]}`);
            
            // Add to order items with complete product data
            orderItems.push({
                product: product._id, // Use product._id from populated product
                productName: product.productName,
                productImage: product.productImage || [],
                quantity: item.quantity,
                size: item.size,
                price: item.price || 0
            });
        }

        const order = new Order({
            userId: userId,
            orderedItems: orderItems,
            address: req.session.selectedAddressId, // Save the actual address ID
            totalPrice: grandTotal,
            dicount: discount,
            finalAmount: finalTotal,
            paymentMethod: paymentMethod,
            deliveryCharge: deliveryCharge,
            status: 'Pending',
            createdOn: new Date(),
            couponApplied: discount > 0
        });

        await order.save();
        
        console.log('✅ Order created successfully:', {
            orderId: order.orderId,
            userId: userId,
            itemsCount: orderItems.length,
            finalAmount: finalTotal,
            paymentMethod: paymentMethod
        });
        
        // Deduct from wallet if payment method is wallet
        if (paymentMethod === 'wallet') {
            const Wallet = require('../../models/walletSchema');
            const walletController = require('./walletController');
            
            try {
                // Create wallet transaction for the deduction
                const result = await walletController.deductMoney(userId, finalTotal, 'Order Payment', `Order #${order.orderId}`);
                console.log('💰 Wallet deducted:', {
                    userId: userId,
                    amount: finalTotal,
                    orderId: order.orderId,
                    result: result
                });
            } catch (walletError) {
                console.error('❌ Wallet deduction error:', walletError);
                // Don't fail the order, but log the error
                // The order is already created, so we should continue
            }
        }
        
        console.log('🔍 Order Items Created:', JSON.stringify(orderItems, null, 2));

        // Clear cart
        await Cart.findOneAndDelete({ userId });

        // Clear session data
        delete req.session.selectedAddressId;
        delete req.session.couponDiscount;
        delete req.session.couponId;

        res.json({ 
            success: true, 
            message: 'Order placed successfully!',
            orderId: order.orderId
        });

    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to place order. Please try again.' 
        });
    }
};

// Load Payment Page
const loadPayment = async (req, res) => {
    try {
        const user = req.user;
        const userId = user._id;

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category'
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        let cartTotal = 0;
        let deliveryCharge = 0;
        let grandTotal = 0;

        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => {
                // Calculate final price using same logic as display
                const regularPrice = item.productId.regularPrice || 0;
                const productOffer = item.productId.productOffer || 0;
                const categoryOffer = item.productId.category?.categoryOffer || 0;
                
                let finalPrice = regularPrice;
                
                // Apply product offer if exists
                if (productOffer > 0) {
                    finalPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
                }
                // Apply category offer if no product offer
                else if (categoryOffer > 0) {
                    finalPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
                }
                
                return acc + (finalPrice * item.quantity);
            }, 0);
            deliveryCharge = cartTotal < 499 ? 39 : 0;
            grandTotal = cartTotal + deliveryCharge;
        }

        // Apply coupon discount if available in cart - recalculate with correct logic
        let discount = 0;
        let appliedCoupon = null;
        
        if (cart.discount && cart.discount > 0 && cart.appliedCoupon) {
            // Recalculate coupon discount using the same logic as applyCoupon
            const coupon = cart.appliedCoupon;
            
            // Calculate original and discounted subtotals
            let originalSubtotal = 0;
            let subtotalAfterOffers = 0;
            
            cart.items.forEach(item => {
                const regularPrice = item.productId.regularPrice || 0;
                const productOffer = item.productId.productOffer || 0;
                const categoryOffer = item.productId.category?.categoryOffer || 0;
                
                // Original price calculation
                const originalItemTotal = regularPrice * item.quantity;
                originalSubtotal += originalItemTotal;
                
                // Calculate final price after offers
                let itemPrice = regularPrice;
                
                // Apply product offer if exists
                if (productOffer > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
                }
                // Apply category offer if no product offer
                else if (categoryOffer > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
                }
                
                const itemTotal = itemPrice * item.quantity;
                subtotalAfterOffers += itemTotal;
            });
            
            // Calculate coupon discount on DISCOUNTED price
            if (coupon.discountType === 'percentage') {
                discount = Math.round((subtotalAfterOffers * coupon.discountValue) / 100);
                
                // Apply maximum discount limit if specified
                if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                    discount = coupon.maxDiscount;
                }
            } else if (coupon.discountType === 'flat') {
                discount = coupon.discountValue;
            }
            
            // Ensure discount doesn't exceed subtotal after offers
            if (discount > subtotalAfterOffers) {
                discount = subtotalAfterOffers;
            }
            
            appliedCoupon = coupon;
        }

        const finalTotal = grandTotal - discount;

        // Map cart items with correct pricing
        const cartItemsWithPrices = cart.items.map(item => {
            // Calculate final price using same logic as checkout
            const regularPrice = item.productId.regularPrice || 0;
            const productOffer = item.productId.productOffer || 0;
            const categoryOffer = item.productId.category?.categoryOffer || 0;
            
            let finalPrice = regularPrice;
            let offerPercent = 0;
            
            // Apply product offer if exists
            if (productOffer > 0) {
                finalPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
                offerPercent = productOffer;
            }
            // Apply category offer if no product offer
            else if (categoryOffer > 0) {
                finalPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
                offerPercent = categoryOffer;
            }
            
            return {
                ...item.toObject(),
                productName: item.productId.productName,
                productImage: item.productId.productImage,
                regularPrice: regularPrice,
                offerPercent: offerPercent,
                finalPrice: finalPrice,
                price: finalPrice // For template compatibility
            };
        });

        res.render('user/payment', {
            siteName: 'COLINGUEST',
            title: "Payment",
            user: user,
            cart: {
                items: cartItemsWithPrices,
                subtotal: cartTotal,
                deliveryFee: deliveryCharge,
                discount: discount,
                total: finalTotal,
                appliedCoupon: appliedCoupon
            }
        });
    } catch (error) {
        console.error('Error loading payment page:', error);
        res.status(500).send('Server Error');
    }
};
const saveAddressToSession = async (req, res) => {
    try {
        console.log('🔍 saveAddressToSession called');
        console.log('Request body:', req.body);
        
        const { selectedAddressId } = req.body;
        const userId = req.session.user?._id || req.session.user?.id;

        console.log('💾 Saving address to session...');
        console.log('User ID:', userId);
        console.log('Selected Address ID:', selectedAddressId);

        if (!userId) {
            console.log('❌ No user ID in session');
            return res.status(401).json({ 
                success: false, 
                message: 'Please login to continue' 
            });
        }

        if (!selectedAddressId) {
            console.log('❌ No selectedAddressId provided');
            return res.status(400).json({ 
                success: false, 
                message: 'Please select a delivery address' 
            });
        }

        // Save to session
        console.log('💾 Saving to session...');
        req.session.selectedAddressId = selectedAddressId;

        // Explicitly save session
        req.session.save((err) => {
            if (err) {
                console.error('❌ Session save error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to save address to session' 
                });
            }
            
            console.log('✅ Address saved to session:', selectedAddressId);
            res.json({ 
                success: true, 
                message: 'Address saved successfully' 
            });
        });

    } catch (error) {
        console.error('❌ saveAddressToSession error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save address' 
        });
    }
};



// Update confirmOrder function
const confirmOrder = async (req, res) => {
  try {
    const user = req.user || req.session.user;
    const userId = user?._id || user?.id;
    
    if (!userId) {
      return res.redirect('/login');
    }

    // Get most recent order
    const orders = await Order.find({ userId })
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName productImage')
      .sort({ createdOn: -1 })
      .limit(1)
      .lean();

    if (!orders || orders.length === 0) {
      console.error('❌ No orders found');
      return res.status(404).render('user/page-404', {
        siteName: 'COLINGUEST',
        title: 'Error',
        user,
        message: 'No orders found'
      });
    }

    const order = orders[0];
    
    // ========== GET SHIPPING ADDRESS ==========
    let shippingAddress = null;
    
    if (order.address) {
      // Handle synthetic address ID format: "docId_index"
      if (order.address.includes('_')) {
        const [docId, addressIndex] = order.address.split('_');
        const addressDoc = await Address.findOne({ userId });
        if (addressDoc && addressDoc.address && addressDoc.address.length > parseInt(addressIndex)) {
          shippingAddress = addressDoc.address[parseInt(addressIndex)];
        }
      } else {
        // Handle direct ObjectId reference (fallback)
        const addressDoc = await Address.findOne({
          userId: userId,
          'address._id': order.address
        }, {
          'address.$': 1
        });
        
        if (addressDoc && addressDoc.address && addressDoc.address.length > 0) {
          shippingAddress = addressDoc.address[0];
        }
      }
    }

    console.log('✅ Order confirmed:', order.orderId);
    console.log('📦 Shipping Address:', shippingAddress);

    return res.render('user/confirmOrder', { 
      siteName: 'COLINGUEST',
      title: 'Order Confirmation', 
      user, 
      orders,
      shippingAddress
    });
    
  } catch (error) {
    console.error('❌ confirmOrder error:', error);
    return res.status(500).render('user/page-404', { 
      siteName: 'COLINGUEST',
      title: 'Error',
      user: req.session?.user || null 
    });
  }
};
// Apply Coupon - CORRECTED VERSION
const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.user._id;
        
        console.log('🎟️ Apply Coupon Request:', { couponCode, userId });
        
        if (!couponCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon code is required' 
            });
        }
        
        // Find the coupon
        const coupon = await Coupon.findOne({ 
            code: couponCode.toUpperCase(),
            isActive: true 
        });
        
        if (!coupon) {
            return res.status(404).json({ 
                success: false, 
                message: 'Invalid coupon code' 
            });
        }
        
        // Check if user has already used this coupon
        const hasUsedCoupon = coupon.usedBy.some(usedBy => usedBy.toString() === userId.toString());
        
        if (hasUsedCoupon) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already used this coupon. Each coupon can only be used once per user.' 
            });
        }
        
        // Check if coupon is expired
        const currentDate = new Date();
        if (new Date(coupon.expiryDate) < currentDate) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon has expired' 
            });
        }
        
        // Check if coupon has usage limit
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon usage limit reached' 
            });
        }
        
        // Check if user has already used this coupon
        if (coupon.usedBy && coupon.usedBy.includes(userId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already used this coupon' 
            });
        }
        
        // Get user's cart with full population
        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category'
            }
        });
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Your cart is empty' 
            });
        }
        
        // ========== STEP 1: Calculate subtotal BEFORE offers (original price) ==========
        let originalSubtotal = 0;
        let subtotalAfterOffers = 0;
        
        cart.items.forEach(item => {
            const regularPrice = item.productId.regularPrice || 0;
            const productOffer = item.productId.productOffer || 0;
            const categoryOffer = item.productId.category?.categoryOffer || 0;
            
            // Original price calculation
            const originalItemTotal = regularPrice * item.quantity;
            originalSubtotal += originalItemTotal;
            
            // Calculate final price after offers (same logic as checkout load)
            let itemPrice = regularPrice;
            
            // Apply product offer if exists
            if (productOffer > 0) {
                itemPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
            }
            // Apply category offer if no product offer
            else if (categoryOffer > 0) {
                itemPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
            }
            
            const itemTotal = itemPrice * item.quantity;
            subtotalAfterOffers += itemTotal;
        });
        
        // Check minimum purchase requirement
        if (coupon.minPrice && originalSubtotal < coupon.minPrice) {
            return res.status(400).json({ 
                success: false, 
                message: `Minimum purchase of ₹${coupon.minPrice} required to use this coupon` 
            });
        }
        
        // ========== STEP 2: Calculate coupon discount on DISCOUNTED price ==========
        let couponDiscount = 0;
        
        if (coupon.discountType === 'percentage') {
            // Apply percentage discount on the subtotal AFTER offers (discounted price)
            couponDiscount = Math.round((subtotalAfterOffers * coupon.discountValue) / 100);
            
            // Apply maximum discount limit if specified
            if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
                couponDiscount = coupon.maxDiscount;
            }
        } else if (coupon.discountType === 'flat') {
            couponDiscount = coupon.discountValue;
        }
        
        // Ensure discount doesn't exceed subtotal after offers
        if (couponDiscount > subtotalAfterOffers) {
            couponDiscount = subtotalAfterOffers;
        }
        
        console.log('🎟️ Coupon Discount Calculation:', {
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            maxDiscount: coupon.maxDiscount,
            calculatedDiscount: couponDiscount
        });
        
        // ========== STEP 3: Calculate delivery charge and final total ==========
        const deliveryCharge = subtotalAfterOffers < 499 ? 39 : 0;
        const finalTotal = subtotalAfterOffers + deliveryCharge - couponDiscount;
        
        console.log('🎟️ Final Calculation:', {
            subtotalAfterOffers: subtotalAfterOffers,
            deliveryCharge: deliveryCharge,
            couponDiscount: couponDiscount,
            finalTotal: finalTotal
        });
        
        // Update cart with discount
        cart.discount = couponDiscount;
        cart.appliedCoupon = {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            maxDiscount: coupon.maxDiscount,
            description: coupon.description
        };
        cart.total = finalTotal;
        
        await cart.save();
        
        // Add user to coupon's usedBy array
        console.log('🔍 Adding user to usedBy array:', {
            couponId: coupon._id,
            userId: userId,
            currentUsedBy: coupon.usedBy
        });
        
        await Coupon.findByIdAndUpdate(coupon._id, {
            $addToSet: { usedBy: userId }
        });
        
        console.log('🔍 Updated usedBy array:', {
            couponId: coupon._id,
            updatedUsedBy: coupon.usedBy
        });
        
        // Mark that user explicitly applied this coupon
        req.session.userAppliedCoupon = true;
        
        res.json({ 
            success: true, 
            message: `Coupon "${couponCode}" applied successfully!`,
            discount: couponDiscount,
            cart: {
                subtotal: subtotalAfterOffers,
                discount: couponDiscount,
                deliveryFee: deliveryCharge,
                total: finalTotal,
                appliedCoupon: cart.appliedCoupon
            }
        });
        
    } catch (error) {
        console.error('❌ Error applying coupon:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to apply coupon. Please try again.' 
        });
    }
};

// Remove Coupon - CORRECTED VERSION
const removeCoupon = async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Get user's cart with full population
        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category'
            }
        });
        
        if (!cart) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }
        
        // Remove coupon from cart
        cart.discount = 0;
        cart.appliedCoupon = null;
        
        // Recalculate subtotal AFTER product/category offers (same logic as applyCoupon)
        let subtotalAfterOffers = 0;
        
        cart.items.forEach(item => {
            const regularPrice = item.productId.regularPrice || 0;
            const productOffer = item.productId.productOffer || 0;
            const categoryOffer = item.productId.category?.categoryOffer || 0;
            
            let itemPrice = regularPrice;
            
            // Apply product offer if exists
            if (productOffer > 0) {
                itemPrice = Math.round(regularPrice - (regularPrice * productOffer / 100));
            }
            // Apply category offer if no product offer
            else if (categoryOffer > 0) {
                itemPrice = Math.round(regularPrice - (regularPrice * categoryOffer / 100));
            }
            
            subtotalAfterOffers += itemPrice * item.quantity;
        });
        
        const deliveryCharge = subtotalAfterOffers < 499 ? 39 : 0;
        const finalTotal = subtotalAfterOffers + deliveryCharge;
        
        cart.total = finalTotal;
        
        await cart.save();
        
        // Clear user applied coupon flag
        req.session.userAppliedCoupon = false;
        
        console.log('🎟️ Coupon Removed - Recalculated:', {
            subtotalAfterOffers: subtotalAfterOffers,
            deliveryCharge: deliveryCharge,
            finalTotal: finalTotal
        });
        
        res.json({ 
            success: true, 
            message: 'Coupon removed successfully',
            cart: {
                subtotal: subtotalAfterOffers,
                discount: 0,
                deliveryFee: deliveryCharge,
                total: finalTotal,
                appliedCoupon: null
            }
        });
        
    } catch (error) {
        console.error('❌ Error removing coupon:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to remove coupon. Please try again.' 
        });
    }
};
module.exports = { 
    loadCheckout, 
    addShoppingAddress, 
    checkoutDetails, 
    processPayment,
    loadPayment,
    editShoppingAddress,
    confirmOrder,
    saveAddressToSession,
    applyCoupon,
    removeCoupon
};