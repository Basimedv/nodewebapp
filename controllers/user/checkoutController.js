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

        const address = await Address.find({ userId });
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

        // Extract addresses from address documents using new schema structure
        const addresses = address.reduce((acc, doc) => {
            return acc.concat(doc.details);
        }, []);

        // Map cart items
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
            address,
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
        res.redirect('/user/cart');
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
            landMark,
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
        if (!name || !phone || !city || !state || !pinCode) {
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
                userAddress = new Address({ userId, details: [] });
            }

            userAddress.details.push({
                addressType: addressType || 'Home',
                name: name,
                city: city,
                landmark: landMark,
                state: state,
                pincode: parseInt(pinCode),
                phone: phone,
                altPhone: altPhone || phone,
                addressLine1: addressLine1,
                addressLine2: addressLine2 || ''
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

        // Verify address exists
        console.log('🔍 Looking for address document...');
        const userAddressDoc = await Address.findOne({ userId });
        console.log('Address document found:', !!userAddressDoc);
        
        if (!userAddressDoc || !userAddressDoc.details) {
            console.log('❌ No address document or details found');
            return res.status(400).json({ 
                success: false, 
                message: 'No addresses found for this user' 
            });
        }

        // Find specific address in details array
        console.log('🔍 Searching for address in details array...');
        const selectedAddress = userAddressDoc.details.find(addr => 
            addr._id.toString() === selectedAddressId.toString()
        );

        console.log('Selected address found:', !!selectedAddress);
        if (!selectedAddress) {
            console.log('❌ Address not found for ID:', selectedAddressId);
            console.log('Available addresses:', userAddressDoc.details.map(addr => ({ id: addr._id, name: addr.name })));
            return res.status(400).json({ 
                success: false, 
                message: 'Selected address not found' 
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
    editShoppingAddress,
    confirmOrder,
    saveAddressToSession
};