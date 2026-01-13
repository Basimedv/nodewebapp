const Refund = require('../../models/refundSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Products = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');

// Request refund from user
const requestRefund = async (req, res) => {
    const { reason, productId, variant } = req.body;
    const orderId = req.query.id;
    const userId = req.session.user?.id ?? req.session.user?._id ?? null;

    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const item = order.orderItems.find(i => i._id.toString() === productId || i.product.toString() === productId);

        if (!item) return res.status(404).json({ message: 'Product not found in this order' });

        if (item.currentStatus === 'Requested' || item.currentStatus === 'Returned') {
            return res.status(400).json({ message: 'Return already requested or item already returned' });
        }

        await order.save();

        const newRefund = new Refund({
            order: orderId,
            userId,
            product: productId,
            reason,
            variant,
            status: 'Requested',
        });

        await newRefund.save();

        return res.status(201).json({ message: 'Return request submitted successfully' });
    } catch (err) {
        console.error('Refund request error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// User side cancellation
const cancelOrder = async (req, res) => {
    try {
        const orderId = req.query.id;
        const userId = req.session.user?.id ?? req.session.user?._id ?? null;
        const { productId, reason } = req.body;

        if (!orderId || !productId) {
            return res.status(400).json({ message: 'Order ID and Product ID are required' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const item = order.orderItems.find(item => item.product.toString() === productId);
        if (!item) {
            return res.status(404).json({ message: 'Product not found in order' });
        }

        const currentStatus = item.currentStatus;
        if (currentStatus === 'Cancelled') {
            return res.status(400).json({ message: 'Product is already cancelled' });
        }

        if (currentStatus === 'Delivered') {
            return res.status(400).json({ message: 'Cannot cancel a delivered product' });
        }

        // Update item status and cancel reason
        item.statusHistory.push({ status: 'Cancelled', timestamp: new Date() });
        item.currentStatus = 'Cancelled';
        item.cancelReason = reason;
        item.updatedAt = new Date();

        const allCancelled = order.orderItems.every(item => item.currentStatus === 'Cancelled');

        if (allCancelled) {
            if (order.coupon) {
                order.coupon = 0;
            }
            order.status = 'Cancelled';
        }

        // Restock the variant
        const product = await Products.findOne({
            _id: item.product,
            variants: {
                $elemMatch: {
                    color: item.variant.color,
                    weight: item.variant.weight,
                }
            }
        });

        if (product) {
            const variant = product.variants.find(v =>
                v.color === item.variant.color && v.weight === item.variant.weight
            );

            if (variant) {
                variant.stock += item.quantity;
                await product.save();
            }
        }

        // Save the order with updated status
        await order.save();

        const transactionId = `TXN${Date.now()}`;
        const refundAmount = item.discountPrice * item.quantity;

        // Wallet entry
        await Wallet.create({
            userId,
            orderId,
            address: order.address,
            transactionId,
            payment_type: 'wallet',
            type: 'cancel',
            amount: refundAmount,
            status: 'Paid',
            entryType: 'CREDIT',
        });

        // Update user wallet balance
        const updatedUser = await User.findOneAndUpdate(
            { _id: order.userId },
            { $inc: { wallet: refundAmount } },
            { new: true }
        );

        if (!updatedUser) {
            console.error('User not found for wallet refund');
        }

        return res.status(200).json({ message: 'Product cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling product from order:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// Load return requests page for admin
const loadReturnPage = async (req, res) => {
    try {
        const { status, search } = req.query;

        let query = {};

        if (status) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { 'order.orderId': { $regex: search, $options: 'i' } },
                { 'order.userId.name': { $regex: search, $options: 'i' } } 
            ];
        }

        const refundRequests = await Refund.find(query)
            .populate('order', 'orderId status')
            .populate('product', 'productName')
            .populate('userId', 'fullName')
            .sort({ createdAt: -1 })
            .lean();

        res.render('admin/returnOrder', { 
            title: 'Return Requests', 
            refundRequests, 
            status, 
            search 
        });

    } catch (error) {
        console.error('Error loading return page:', error);
        res.status(500).send('Server Error');
    }
};

// Update refund status
const updateRefundStatus = async (req, res) => {
    const { status, orderId, productId } = req.body;
    const userId = req.session.user?.id ?? req.session.user?._id ?? null;

    try {
        const refund = await Refund.findOne({ order: orderId, product: productId });
        if (!refund) {
            return res.status(404).json({ error: "Refund not found" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        const user = await User.findById(order.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Find the specific item in the order
        const itemToUpdate = order.orderItems.find(item =>
            item.product.toString() === productId &&
            item.variant.color === refund.variant.color &&
            item.variant.weight === refund.variant.weight
        );

        if (!itemToUpdate) {
            return res.status(404).json({ error: "Matching product item in order not found" });
        }

        if (status === 'Approved') {
            // Credit wallet
            const refundAmount = itemToUpdate.discountPrice * itemToUpdate.quantity;
            user.wallet += refundAmount;
            await user.save();

            // Increase stock
            const product = await Products.findOne({
                _id: productId,
                variants: {
                    $elemMatch: {
                        color: refund.variant.color,
                        weight: refund.variant.weight
                    }
                }
            });

            if (product) {
                const variant = product.variants.find(v =>
                    v.color === refund.variant.color && v.weight === refund.variant.weight
                );

                if (variant) {
                    variant.stock += itemToUpdate.quantity;
                    await product.save();
                }
            }

            // Update refund
            refund.status = status;
            await refund.save();

            // Update order status to show return request
            await Order.findByIdAndUpdate(order._id, { status: 'Return Requested' });

            // Log to wallet
            const transactionId = `TXN${Date.now()}`;

            await Wallet.create({
                userId,
                orderId,
                address: order.address,
                transactionId,
                payment_type: 'wallet',
                type: 'refund',
                amount: refundAmount,
                status: 'Paid',
                entryType: 'CREDIT',
            });

            return res.status(200).json({ message: `Refund of ₹${refundAmount} processed successfully` });
        } else {
            refund.status = status;
            await refund.save();

            return res.status(400).json({ message: `Refund for order #${order.orderId} rejected` });
        }
    } catch (error) {
        console.error("Error updating refund status:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = { 
    requestRefund, 
    cancelOrder, 
    loadReturnPage, 
    updateRefundStatus 
};
