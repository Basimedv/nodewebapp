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
        const cart = await Cart.findOne({ userId }).populate('items.productId', 'productName productImage regularPrice salePrice productOffer stock');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        let cartTotal = 0;
        let deliveryCharge = 0;
        let grandTotal = 0;

        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => {
                const regularPrice = item.productId.regularPrice || 0;
                const salePrice = item.productId.salePrice || 0;
                const offerPercent = item.productId.productOffer || 0;
                
                let itemPrice = regularPrice;
                if (salePrice > 0 && salePrice < regularPrice) {
                    itemPrice = salePrice;
                } else if (offerPercent > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * offerPercent / 100));
                }
                
                return acc + (itemPrice * item.quantity);
            }, 0);
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
            const salePrice = item.productId.salePrice || 0;
            const offerPercent = item.productId.productOffer || 0;
            
            let finalPrice = regularPrice;
            if (salePrice > 0 && salePrice < regularPrice) {
                finalPrice = salePrice;
            } else if (offerPercent > 0) {
                finalPrice = Math.round(regularPrice - (regularPrice * offerPercent / 100));
            }
            
            return {
                ...item.toObject(),
                regularPrice: regularPrice,
                salePrice: salePrice,
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
            total: grandTotal,
            couponDiscount: 0,
            calculatedValues: { cartTotal, deliveryCharge, grandTotal }
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
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Your cart is empty' 
            });
        }

        // Calculate totals
        let cartTotal = 0;
        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => {
                const regularPrice = item.productId.regularPrice || 0;
                const salePrice = item.productId.salePrice || 0;
                const offerPercent = item.productId.productOffer || 0;
                
                let itemPrice = regularPrice;
                if (salePrice > 0 && salePrice < regularPrice) {
                    itemPrice = salePrice;
                } else if (offerPercent > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * offerPercent / 100));
                }
                
                return acc + (itemPrice * item.quantity);
            }, 0);
        }

        const deliveryCharge = cartTotal < 499 ? 39 : 0;
        let grandTotal = cartTotal + deliveryCharge;

        // Apply coupon discount if available
        let discount = 0;
        if (req.session.couponDiscount) {
            discount = parseFloat(req.session.couponDiscount);
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

        const cart = await Cart.findOne({ userId }).populate('items.productId', 'productName productImage regularPrice salePrice productOffer stock');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        let cartTotal = 0;
        let deliveryCharge = 0;
        let grandTotal = 0;

        if (cart && cart.items.length > 0) {
            cartTotal = cart.items.reduce((acc, item) => {
                const regularPrice = item.productId.regularPrice || 0;
                const salePrice = item.productId.salePrice || 0;
                const offerPercent = item.productId.productOffer || 0;
                
                let itemPrice = regularPrice;
                if (salePrice > 0 && salePrice < regularPrice) {
                    itemPrice = salePrice;
                } else if (offerPercent > 0) {
                    itemPrice = Math.round(regularPrice - (regularPrice * offerPercent / 100));
                }
                
                return acc + (itemPrice * item.quantity);
            }, 0);
            deliveryCharge = cartTotal < 499 ? 39 : 0;
            grandTotal = cartTotal + deliveryCharge;
        }

        // Apply coupon discount if available
        let discount = 0;
        if (req.session.couponDiscount) {
            discount = parseFloat(req.session.couponDiscount);
        }

        const finalTotal = grandTotal - discount;

        // Map cart items with sale price calculation
        const cartItemsWithPrices = cart.items.map(item => {
            const regularPrice = item.productId.regularPrice || 0;
            const salePrice = item.productId.salePrice || 0;
            const offerPercent = item.productId.productOffer || 0;
            
            let finalPrice = regularPrice;
            if (salePrice > 0 && salePrice < regularPrice) {
                finalPrice = salePrice;
            } else if (offerPercent > 0) {
                finalPrice = Math.round(regularPrice - (regularPrice * offerPercent / 100));
            }
            
            return {
                ...item.toObject(),
                productName: item.productId.productName,
                regularPrice: regularPrice,
                salePrice: salePrice,
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
                total: finalTotal
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



module.exports = { 
    loadCheckout, 
    addShoppingAddress, 
    checkoutDetails, 
    processPayment,
    loadPayment,
    editShoppingAddress,
    confirmOrder,
    saveAddressToSession
};