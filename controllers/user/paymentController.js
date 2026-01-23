const razorpay = require('../../config/razorpay');
const crypto = require('crypto');

// Create Razorpay Order
const createOrder = async (req, res) => {
  try {
    console.log('🔍 Creating Razorpay order');
    console.log('🔍 Request body:', req.body);
    console.log('🔍 Authenticated user:', req.user);
    
    const { currency = 'INR' } = req.body;
    const userId = req.user._id || req.user.id;

    if (!userId) {
      console.log('❌ User not authenticated');
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    // Import required models
    const Cart = require('../../models/cartSchema');

    // Get cart and calculate total amount
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      populate: {
        path: 'category',
        model: 'Category'
      }
    });
    
    if (!cart || cart.items.length === 0) {
      console.log('❌ Cart is empty');
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

    // Apply coupon discount if available in cart
    let discount = 0;
    
    if (cart.discount && cart.discount > 0 && cart.appliedCoupon) {
      discount = cart.discount;
    }

    const finalAmount = grandTotal - discount;

    console.log('🔍 Calculated Order Amount:', {
      cartTotal: cartTotal,
      deliveryCharge: deliveryCharge,
      discount: discount,
      finalAmount: finalAmount
    });

    const options = {
      amount: finalAmount * 100, // amount in paise
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1 // auto capture
    };

    console.log('🔍 Razorpay order options:', options);
    const order = await razorpay.orders.create(options);
    console.log('✅ Razorpay order created:', order);

    res.json({
      success: true,
      order: order,
      key: process.env.RZP_TEST_KEY,
      calculatedAmount: finalAmount
    });

  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating order',
      error: error.message 
    });
  }
};

// Verify Payment
const verifyPayment = async (req, res) => {
  try {
    console.log('🔍 Payment verification started');
    console.log('🔍 Request body:', req.body);
    console.log('🔍 Authenticated user:', req.user);
    
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      paymentMethod = 'card'
    } = req.body;
 

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log('❌ Missing payment details');
      return res.status(400).json({ 
        success: false, 
        message: 'Missing payment details' 
      });
    }

    // Create signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RZP_TEST_SECRET)
      .update(sign.toString())
      .digest("hex");

    console.log('🔍 Signature verification:', {
      sign: sign,
      expectedSign: expectedSign,
      receivedSignature: razorpay_signature,
      matches: razorpay_signature === expectedSign
    });

    if (razorpay_signature === expectedSign) {
      console.log('✅ Payment signature verified successfully');
      
      // Payment is verified - create order and clear cart
      const userId = req.user._id || req.user.id;
      
      console.log('🔍 User ID:', userId);
      
      if (!userId) {
        console.log('❌ User not authenticated');
        return res.status(401).json({ 
          success: false, 
          message: 'User not authenticated' 
        });
      }

      // Import required models
      const Cart = require('../../models/cartSchema');
      const Order = require('../../models/orderSchema');
      const Product = require('../../models/productSchema');
      const Address = require('../../models/addressSchema');

      // Get cart and calculate totals
      console.log('🔍 Looking for cart for userId:', userId);
      const cart = await Cart.findOne({ userId }).populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          model: 'Category'
        }
      });
      
      console.log('🔍 Cart found:', cart);
      console.log('🔍 Cart items count:', cart ? cart.items.length : 0);
      
      if (!cart || cart.items.length === 0) {
        console.log('❌ Cart is empty or not found');
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

      // Apply coupon discount if available in cart
      let discount = 0;
      let appliedCoupon = null;
      
      if (cart.discount && cart.discount > 0 && cart.appliedCoupon) {
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

      // Create order items and update stock
      const orderItems = [];
      
      for (const item of cart.items) {
        const product = item.productId;
        
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
        
        // Add to order items
        orderItems.push({
          product: product._id,
          productName: product.productName,
          productImage: product.productImage || [],
          quantity: item.quantity,
          size: item.size,
          price: item.price || 0
        });
      }

      // Create order
      const order = new Order({
        userId: userId,
        orderedItems: orderItems,
        address: req.session.selectedAddressId,
        totalPrice: grandTotal,
        dicount: discount,
        finalAmount: finalTotal,
        paymentMethod: paymentMethod,
        deliveryCharge: deliveryCharge,
        status: 'Pending',
        createdOn: new Date(),
        couponApplied: discount > 0,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        paymentStatus: 'Paid'
      });

      await order.save();
      
      console.log('✅ Order created successfully:', {
        orderId: order.orderId,
        userId: userId,
        itemsCount: orderItems.length,
        finalAmount: finalTotal,
        paymentMethod: paymentMethod,
        razorpayPaymentId: razorpay_payment_id
      });

      // Clear cart
      console.log('🔍 Clearing cart for userId:', userId);
      const deleteResult = await Cart.findOneAndDelete({ userId });
      console.log('🔍 Cart deletion result:', deleteResult);

      // Clear session data
      console.log('🔍 Clearing session data');
      delete req.session.selectedAddressId;
      delete req.session.couponDiscount;
      delete req.session.couponId;

      console.log('🔍 Sending success response');
      res.json({ 
        success: true, 
        message: "Payment verified successfully and order created",
        orderId: order.orderId,
        paymentId: razorpay_payment_id,
        orderCreated: true
      });
      
    } else {
      res.status(400).json({ 
        success: false, 
        message: "Invalid signature" 
      });
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    
    // For missing payment details, redirect to confirm order (as requested earlier)
    if (error.message && error.message.includes('Missing payment details')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing payment details',
        redirectTo: '/confirm-order'
      });
    }
    
    // For other payment errors, redirect to payment failure page
    return res.redirect('/payment-failure');
  }
};

// Get Payment Details
const getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await razorpay.payments.fetch(paymentId);

    res.json({
      success: true,
      payment: payment
    });

  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching payment details',
      error: error.message 
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentDetails
};