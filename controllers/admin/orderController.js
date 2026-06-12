const Order   = require('../../models/orderSchema');
const User    = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const { creditWallet } = require('../user/walletController');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

// ── GET ALL ORDERS ───────────────────────────────────────────────
const getOrders = async (req, res) => {
    try {
        const page   = parseInt(req.query.page) || 1;
        const limit  = 10;
        const skip   = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';

        const filter = {};
        if (status) filter.status = status;
        if (search) filter.orderId = { $regex: search, $options: 'i' };

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .populate('userId', 'fullName email')
                .sort({ createdOn: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter)
        ]);

        res.render('admin/orders', {
            orders,
            currentPage:  page,
            totalPages:   Math.ceil(total / limit),
            totalOrders:  total,
            search,
            statusFilter: status
        });

    } catch (error) {
        console.error('getOrders error:', error);
        res.redirect('/admin/pageerror');
    }
};

// ── GET ORDER DETAIL ─────────────────────────────────────────────
const getOrderDetail = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('userId', 'fullName email phone')
            .populate('orderedItems.product')
            .lean();

        if (!order) return res.redirect('/admin/orders');

        res.render('admin/orderDetail', { order });

    } catch (error) {
        console.error('getOrderDetail error:', error);
        res.redirect('/admin/orders');
    }
};

// ── UPDATE ORDER STATUS ──────────────────────────────────────────
const updateOrderStatus = async (req, res) => {
    try {
        const { id }     = req.params;
        const { status } = req.body;

        const validStatuses = [
            'Pending', 'Processing', 'Shipped',
            'Out for Delivery', 'Delivered', 'Cancelled'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // ✅ Cannot change cancelled order
        if (order.status === 'Cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update a cancelled order'
            });
        }

        // ✅ If admin cancels — restore stock + refund wallet
        if (status === 'Cancelled' && order.status !== 'Cancelled') {

            // Restore stock
            for (const item of order.orderedItems) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { [`stock.${item.size}`]: item.quantity } }
                );
            }

            // Refund wallet if not COD
            if (order.paymentMethod !== 'COD') {
                await creditWallet({
                    userId:      order.userId,
                    amount:      order.finalAmount,
                    orderId:     order.orderId,
                    type:        'cancel',
                    description: `Refund for admin cancelled order #${order.orderId}`
                });
            }
        }

        // ✅ If marking delivered — set invoice date
        if (status === 'Delivered') {
            order.invoiceDate = new Date();
        }

        order.status = status;
        await order.save();

        return res.status(200).json({
            success: true,
            message: `Order status updated to ${status}`
        });

    } catch (error) {
        console.error('updateOrderStatus error:', error);
        res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

// ── HANDLE RETURN REQUEST ────────────────────────────────────────
const handleReturn = async (req, res) => {
    try {
        const { id }             = req.params;
        const { action, reason } = req.body;

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Use approve or reject.'
            });
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.status !== 'Return Request') {
            return res.status(400).json({
                success: false,
                message: 'No return request found for this order'
            });
        }

        if (action === 'approve') {

            // ✅ Step 1 — Restore stock
            for (const item of order.orderedItems) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { [`stock.${item.size}`]: item.quantity } }
                );
            }

            // ✅ Step 2 — Credit wallet (always refund on return)
            await creditWallet({
                userId:      order.userId,
                amount:      order.finalAmount,
                orderId:     order.orderId,
                type:        'refund',
                description: `Refund for returned order #${order.orderId}`
            });

            // ✅ Step 3 — Update order
            order.status       = 'Returned';
            order.returnStatus = 'Approved';
            order.returnReason = reason || '';

            await order.save();

            return res.status(200).json({
                success: true,
                message: `Return approved. ₹${order.finalAmount.toLocaleString('en-IN')} refunded to customer wallet.`
            });

        } else {
            // Reject return — revert to Delivered
            order.status       = 'Delivered';
            order.returnStatus = 'Rejected';
            order.returnReason = reason || '';

            await order.save();

            return res.status(200).json({
                success: true,
                message: 'Return request rejected.'
            });
        }

    } catch (error) {
        console.error('handleReturn error:', error);
        res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

module.exports = {
    getOrders,
    getOrderDetail,
    updateOrderStatus,
    handleReturn
};