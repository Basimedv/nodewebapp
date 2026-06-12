const Order   = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { creditWallet } = require('./walletController');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

const getOrders = async (req, res) => {
    try {
        const userId       = req.session.user?._id;
        const page         = parseInt(req.query.page) || 1;
        const limit        = 10;
        const skip         = (page - 1) * limit;
        const statusFilter = req.query.status || '';  // ← ADD THIS

        const query = { userId };
        if (statusFilter) query.status = statusFilter; // ← ADD THIS

        const [orders, total] = await Promise.all([
            Order.find(query).sort({ createdOn: -1 }).skip(skip).limit(limit).lean(),
            Order.countDocuments(query)
        ]);

        res.render('user/orders', {
            user: req.session.user,
            statusFilter,            // ← was undefined before, caused crash
            orders,
            currentPage:  page,
            totalPages:   Math.ceil(total / limit),
            totalOrders:  total
        });
    } catch (error) {
        console.error('getOrders error:', error);
        res.redirect('/pageNotFound');
    }
};
// ── GET ORDER DETAIL ─────────────────────────────────────────────
const getOrderDetail = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const order  = await Order.findOne({
            _id:    req.params.id,
            userId          // ✅ ensure user owns this order
        })
        .populate('orderedItems.product')
        .lean();

        if (!order) {
            return res.redirect('/orders');
        }

        res.render('user/orderDetail', {
            user: req.session.user,
            order
        });

    } catch (error) {
        console.error('getOrderDetail error:', error);
        res.redirect('/orders');
    }
};

// ── CANCEL ORDER ─────────────────────────────────────────────────
const cancelOrder = async (req, res) => {
    try {
        const userId           = req.session.user?._id;
        const { id }           = req.params;
        const { cancelReason } = req.body;

        const order = await Order.findOne({ _id: id, userId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // ✅ Only allow cancel if order is Pending or Processing
        const cancellableStatuses = ['Pending', 'Processing'];
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel order with status "${order.status}"`
            });
        }

        // ── Restore stock ────────────────────────────────────────
        for (const item of order.orderedItems) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { [`stock.${item.size}`]: item.quantity } }
            );
        }

        // ── Update order status ──────────────────────────────────
        order.status       = 'Cancelled';
        order.cancelReason = cancelReason || 'Cancelled by user';
        await order.save();

        // ── Refund to wallet ─────────────────────────────────────
        // ✅ Refund only if paid online or wallet — not COD
        if (order.paymentMethod !== 'COD') {
            await creditWallet({
                userId,
                amount:      order.finalAmount,
                orderId:     order.orderId,
                type:        'cancel',
                description: `Refund for cancelled order #${order.orderId}`
            });

            return res.status(200).json({
                success: true,
                message: `Order cancelled. ₹${order.finalAmount.toLocaleString('en-IN')} refunded to your wallet.`,
                refunded: true,
                amount:   order.finalAmount
            });
        }

        return res.status(200).json({
            success:  true,
            message:  'Order cancelled successfully.',
            refunded: false
        });

    } catch (error) {
        console.error('cancelOrder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order. Please try again.'
        });
    }
};

// ── REQUEST RETURN ───────────────────────────────────────────────
const requestReturn = async (req, res) => {
    try {
        const userId          = req.session.user?._id;
        const { id }          = req.params;
        const { returnReason } = req.body;

        if (!returnReason?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a reason for return'
            });
        }

        const order = await Order.findOne({ _id: id, userId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // ✅ Can only return delivered orders
        if (order.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered orders can be returned'
            });
        }

        // ✅ Check if return already requested
        if (order.status === 'Return Request') {
            return res.status(400).json({
                success: false,
                message: 'Return already requested for this order'
            });
        }

        order.status       = 'Return Request';
        order.returnReason = returnReason.trim();
        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return request submitted. Admin will review it shortly.'
        });

    } catch (error) {
        console.error('requestReturn error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit return request.'
        });
    }
};

module.exports = {
    getOrders,
    getOrderDetail,
    cancelOrder,
    requestReturn
};