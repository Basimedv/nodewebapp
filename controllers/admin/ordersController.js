// controllers/admin/ordersController.js
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Refund=require('../../models/refundSchema')
const Wallet=require('../../models/walletSchema');


// GET admin orders page
const loadOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    // Get filter parameters
    const statusFilter = req.query.status || '';
    const paymentFilter = req.query.payment || '';
    
    // Build query object
    const query = {};
    if (statusFilter) query.status = statusFilter;
    if (paymentFilter) query.paymentMethod = paymentFilter;

    // Get orders with filters and pagination
    const orders = await Order.find(query)
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName productImage')
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    // Calculate statistics
    const stats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsObj = {
      total: totalOrders,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0
    };

    stats.forEach(stat => {
      if (stat._id === 'Pending') statsObj.pending = stat.count;
      else if (stat._id === 'Processing') statsObj.processing = stat.count;
      else if (stat._id === 'Shipped') statsObj.shipped = stat.count;
      else if (stat._id === 'Delivered') statsObj.delivered = stat.count;
      else if (stat._id === 'Cancelled') statsObj.cancelled = stat.count;
    });

    res.render('admin/orders', {
      orders,
      stats: statsObj,
      filters: {
        status: statusFilter,
        payment: paymentFilter
      },
      currentPage: page,
      totalPages,
      totalOrders,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });
  } catch (error) {
    console.error('Error loading orders:', error);
    res.redirect('/admin/pageerror');
  }
};
// GET order details
const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Fetching order with ID:', id);
    
    const order = await Order.findById(id)
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName productImage regularPrice productOffer')
      .lean();

    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    console.log('✅ Order found:', order.orderId);
    console.log('📦 Order data:', JSON.stringify(order, null, 2));

    // Get shipping address
    let shippingAddress = null;
    if (order.address) {
      console.log('📍 Address field:', order.address);
      
      if (order.address.includes('_')) {
        const [docId, addressIndex] = order.address.split('_');
        console.log('🔑 Looking up address - docId:', docId, 'index:', addressIndex);
        
        const addressDoc = await Address.findOne({ userId: order.userId._id || order.userId });
        
        if (addressDoc && addressDoc.address && addressDoc.address.length > parseInt(addressIndex)) {
          shippingAddress = addressDoc.address[parseInt(addressIndex)];
          console.log('✅ Shipping address found:', shippingAddress);
        } else {
          console.log('⚠️ Address not found in address document');
        }
      } else {
        // If address is stored directly as an object ID
        console.log('🔑 Looking up address by ID:', order.address);
        const addressDoc = await Address.findById(order.address);
        if (addressDoc) {
          shippingAddress = addressDoc;
          console.log('✅ Shipping address found by ID:', shippingAddress);
        }
      }
    } else {
      console.log('⚠️ No address field in order');
    }

    // Also check if shippingAddress exists directly on the order
    if (!shippingAddress && order.shippingAddress) {
      console.log('✅ Using shippingAddress from order object');
      shippingAddress = order.shippingAddress;
    }

    // ✅ Fetch return request if order has Return Request status
    let returnRequest = null;
    console.log('🔍 Checking order status for return request:', order.status);
    console.log('🔍 Order _id:', order._id);
    
    if (order.status === 'Return Request' || order.status === 'Return Requested') {
      console.log('🔍 Fetching return request for order');
      try {
        const Refund = require('../../models/refundSchema');
        const Product = require('../../models/productSchema');
        
        // First, let's see if there are any return requests for this order
        const allReturnRequests = await Refund.find({ order: order._id }).lean();
        console.log('🔍 All return requests for this order:', allReturnRequests);
        
        returnRequest = await Refund.findOne({ 
          order: order._id
        })
        .populate({
          path: 'product',
          model: Product,
          select: 'productName productImage'
        })
        .populate({
          path: 'userId',
          model: require('../../models/userSchema'),
          select: 'fullName email'
        })
        .sort({ createdAt: -1 })
        .lean();
        
        if (returnRequest) {
          console.log('✅ Return request found:', {
            id: returnRequest._id,
            reason: returnRequest.reason,
            status: returnRequest.status,
            productName: returnRequest.product?.productName,
            customerName: returnRequest.userId?.fullName
          });
        } else {
          console.log('⚠️ No return request found for order:', order._id);
        }
      } catch (returnError) {
        console.error('❌ Error fetching return request:', returnError);
      }
    }

    console.log('📤 Sending response with return request');

    res.json({ 
      success: true, 
      order: {
        ...order,
        returnRequest: returnRequest,  // ✅ Include return request data
        orderedItems: order.orderedItems.map(item => ({
          ...item,
          product: item.productId || item.product  // Handle both field names
        }))
      },
      shippingAddress 
    });
    
  } catch (error) {
    console.error('❌ Error getting order details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: error.message 
    });
  }
};

// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log('🔄 Updating order status - ID:', id, 'New status:', status);

    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!order) {
      console.log('❌ Order not found for status update');
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    console.log('✅ Order status updated successfully');
    res.json({ success: true, message: 'Order status updated successfully' });
    
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: error.message 
    });
  }
};

// Mark order as Out for Delivery
const markOutForDelivery = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🚚 Marking order as Out for Delivery - ID:', id);

    const order = await Order.findByIdAndUpdate(
      id,
      { status: 'Out for Delivery' },
      { new: true }
    );

    if (!order) {
      console.log('❌ Order not found for Out for Delivery');
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    console.log('✅ Order marked as Out for Delivery successfully');
    res.json({ 
      success: true, 
      message: 'Order marked as Out for Delivery successfully',
      newStatus: 'Out for Delivery'
    });
    
  } catch (error) {
    console.error('❌ Error marking order as Out for Delivery:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: error.message 
    });
  }
};

// Mark order as Delivered
const markAsDelivered = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('📦 Marking order as Delivered - ID:', id);

    const order = await Order.findByIdAndUpdate(
      id,
      { status: 'Delivered' },
      { new: true }
    );

    if (!order) {
      console.log('❌ Order not found for Delivered status');
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    console.log('✅ Order marked as Delivered successfully');
    res.json({ 
      success: true, 
      message: 'Order marked as Delivered successfully',
      newStatus: 'Delivered'
    });
    
  } catch (error) {
    console.error('❌ Error marking order as Delivered:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: error.message 
    });
  }
};
const approveReturnRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const refund = await Refund.findOne({
      order: order._id,
      status: 'Requested'
    });
    if (!refund) return res.status(400).json({ message: 'No return request found' });

    // Step 1: approve refund
    refund.status = 'Approved';
    await refund.save();

    // Step 2: update order
    order.status = 'Returned';
    await order.save();

    // Step 3: COD check
    if (order.paymentMethod === 'COD' && order.status !== 'Delivered') {
      return res.json({ message: 'Return approved (no wallet refund for COD)' });
    }

    // Step 4: prevent duplicate refund
    const exists = await Wallet.findOne({
      orderId: order._id.toString(),
      type: 'refund',
      entryType: 'CREDIT'
    });
    if (exists) return res.json({ message: 'Wallet already refunded' });

    // Step 5: calculate amount
    const refundAmount = order.orderedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Step 6: CREATE wallet transaction
    await Wallet.create({
      userId: refund.userId,
      orderId: order._id.toString(),
      transactionId: `REF-${Date.now()}`,
      payment_type: order.paymentMethod,
      amount: refundAmount,
      entryType: 'CREDIT',
      type: 'refund',
      status: 'success',
      description: 'Refund for returned order'
    });

    res.json({ success: true, message: 'Return approved & wallet refunded' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reject return request
const rejectReturnRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const Order = require('../../models/orderSchema');
    const Refund = require('../../models/refundSchema');
    
    console.log('🔄 Rejecting return request - Order ID:', id, 'Reason:', rejectionReason);

    const order = await Order.findById(id).lean();
    
    if (!order) {
      console.log('❌ Order not found for return rejection');
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    // Find the return request for this order
    const returnRequest = await Refund.findOne({ 
      order: order._id,
      status: 'Requested'
    }).lean();

    if (!returnRequest) {
      console.log('❌ No return request found for this order');
      return res.status(400).json({ 
        success: false, 
        error: 'No return request found for this order' 
      });
    }

    // Update return request status to Rejected with reason
    await Refund.findByIdAndUpdate(
      returnRequest._id,
      { 
        status: 'Rejected',
        rejectionReason: rejectionReason
      },
      { new: true }
    );

    console.log('✅ Return request rejected');
    res.json({ 
      success: true, 
      message: 'Return request rejected successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error rejecting return request:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: error.message 
    });
  }
};

// Update refund status for individual products
const updateRefundStatus = async (req, res) => {
  try {
    const { orderId, productId, status } = req.body;
    const Order = require('../../models/orderSchema');
    const Refund = require('../../models/refundSchema');
    const Wallet = require('../../models/walletSchema');
    
    console.log('🔄 Updating refund status - Order ID:', orderId, 'Product ID:', productId, 'Status:', status);

    // Find the order
    const order = await Order.findById(orderId)
      .populate('userId', 'fullName email')
      .populate('orderedItems.product', 'productName');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Find the specific refund for this product
    const refund = await Refund.findOne({ 
      orderId, 
      productId,
      status: { $in: ['Requested', 'Approved', 'Rejected'] }
    });

    if (!refund) {
      return res.status(404).json({ 
        success: false, 
        message: 'Refund request not found' 
      });
    }

    // Update refund status
    await Refund.findByIdAndUpdate(
      refund._id,
      { status },
      { new: true }
    );

    // If approved, process wallet refund
    if (status === 'Approved') {
      const productItem = order.orderedItems.find(item => 
        item.product._id.toString() === productId
      );
      
      if (productItem) {
        const refundAmount = productItem.discountPrice * productItem.quantity;
        
      
      }
    }

    console.log(`✅ Refund ${status.toLowerCase()} successfully`);
    res.json({ 
      success: true, 
      message: `Refund ${status.toLowerCase()} successfully` 
    });
    
  } catch (error) {
    console.error('❌ Error updating refund status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update refund status' 
    });
  }
};

module.exports = {
  loadOrders,
  getOrderDetails,
  updateOrderStatus,
  markOutForDelivery,
  markAsDelivered,
  approveReturnRequest,
  rejectReturnRequest,
  updateRefundStatus
};
