// Add this to your walletController.js

const Wallet = require('../../models/walletSchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema'); // Import your Order model
const Refund = require('../../models/refundSchema'); // Import your Refund model

// Get wallet balance for API calls
const getWalletBalance = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const balance = await calculateWalletBalance(userId);
        
        res.json({
            success: true,
            balance: balance
        });
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch wallet balance'
        });
    }
};


// Process order cancellation and refund to wallet
const processOrderCancellation = async (orderId, userId, cancelledAmount, reason = 'Order cancelled') => {
    try {
        // Get the order details
        const order = await Order.findById(orderId);
        
        if (!order) {
            throw new Error('Order not found');
        }

        // Check if user owns the order
        if (order.userId.toString() !== userId.toString()) {
            throw new Error('Unauthorized: Order does not belong to user');
        }

        // Check if order can be cancelled (only PLACED, PROCESSING, SHIPPED status)
        const cancellableStatuses = ['Placed', 'Processing', 'Shipped'];
        if (!cancellableStatuses.includes(order.status)) {
            throw new Error(`Cannot cancel order with status: ${order.status}`);
        }

        // For COD orders: NO WALLET CREDIT for cancellation (user hasn't paid)
        if (order.paymentMethod === 'COD') {
            // Just update order status to CANCELLED
            order.status = 'Cancelled';
            order.cancellationReason = reason;
            order.cancelledOn = new Date();
            order.updatedOn = new Date();
            await order.save();

            return {
                success: true,
                message: 'COD order cancelled successfully. No refund as payment was not made.',
                balance: null,
                refundAmount: 0
            };
        }

        // For Wallet/Online Payment orders: Process refund
        if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'Online Payment') {
            // Generate transaction ID
            const transactionId = 'REFUND_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            // Create wallet credit transaction
            const walletTransaction = new Wallet({
                userId: userId,
                orderId: orderId,
                transactionId: transactionId,
                payment_type: 'refund',
                amount: parseFloat(cancelledAmount),
                entryType: 'CREDIT',
                type: 'refund',
                status: 'completed',
                description: `Refund for cancelled order #${order.orderId || orderId.toString().slice(-8)}`
            });

            await walletTransaction.save();
            console.log('Refund wallet transaction created:', walletTransaction);

            // Update order status
            order.status = 'Cancelled';
            order.paymentStatus = 'Refunded';
            order.cancellationReason = reason;
            order.cancelledOn = new Date();
            order.updatedOn = new Date();
            await order.save();

            // Calculate new wallet balance
            const newBalance = await calculateWalletBalance(userId);

            return {
                success: true,
                message: `Order cancelled successfully. ₹${cancelledAmount} refunded to your wallet`,
                balance: newBalance,
                refundAmount: parseFloat(cancelledAmount),
                transactionId: transactionId
            };
        }

    } catch (error) {
        console.error('Error processing order cancellation:', error);
        throw error;
    }
};

// Process product return after delivery (credit to wallet)
const processProductReturn = async (orderId, userId, returnAmount, reason = 'Product returned') => {
    try {
        // Get the order details
        const order = await Order.findById(orderId);
        
        if (!order) {
            throw new Error('Order not found');
        }

        // Check if user owns the order
        if (order.userId.toString() !== userId.toString()) {
            throw new Error('Unauthorized: Order does not belong to user');
        }

        // Check if order is delivered (can only return delivered orders)
        if (order.status !== 'Delivered') {
            throw new Error(`Cannot return order with status: ${order.status}. Only delivered orders can be returned.`);
        }

        // Generate transaction ID
        const transactionId = 'RETURN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Create wallet credit transaction for return
        const walletTransaction = new Wallet({
            userId: userId,
            orderId: orderId,
            transactionId: transactionId,
            payment_type: 'return',
            amount: parseFloat(returnAmount),
            entryType: 'CREDIT',
            type: 'refund',
            status: 'completed',
            description: `Refund for returned product #${order.orderId || orderId.toString().slice(-8)}`
        });

        await walletTransaction.save();
        console.log('Return wallet transaction created:', walletTransaction);

        // Update order status to Returned
        order.status = 'Returned';
        order.returnReason = reason;
        order.returnedOn = new Date();
        order.updatedOn = new Date();
        await order.save();

        // Calculate new wallet balance
        const newBalance = await calculateWalletBalance(userId);

        return {
            success: true,
            message: `Product returned successfully. ₹${returnAmount} credited to your wallet`,
            balance: newBalance,
            refundAmount: parseFloat(returnAmount),
            transactionId: transactionId
        };

    } catch (error) {
        console.error('Error processing product return:', error);
        throw error;
    }
};

// Return order endpoint (for delivered orders)
const returnOrder = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        // Get order to find amount
        const order = await Order.findById(req.body.orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        // Check if user owns the order
        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized: Order does not belong to user' 
            });
        }

        // Check if order is delivered
        if (order.status !== 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                error: 'Only delivered orders can be returned' 
            });
        }

        // Extract product information from order
        let productId = null;
        let refundAmount = 0;

        if (order.orderedItems && order.orderedItems.length > 0) {
            const firstItem = order.orderedItems[0];
            productId = firstItem.product || firstItem.productId;
            refundAmount = firstItem.price * firstItem.quantity;
        }

        if (!productId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Unable to extract product information from order. Order items: ' + JSON.stringify(order.orderedItems) 
            });
        }

        console.log('Return request received:', {
            orderId: req.body.orderId,
            userId: userId,
            productId: productId,
            reason: req.body.reason,
            refundAmount: refundAmount
        });

        // Create return request document
        const returnRequest = new ReturnRequest({
            userId: userId,
            orderId: order._id,
            productId: productId,
            returnReason: req.body.reason,
            refundAmount: refundAmount,
            status: 'Pending',
            requestedOn: new Date()
        });

        // Handle image uploads if provided
        if (req.files && req.files.returnImages) {
            const returnImages = Array.isArray(req.files.returnImages) 
                ? req.files.returnImages 
                : [req.files.returnImages];

            const imagePaths = returnImages.map(file => file.path);
            returnRequest.returnImages = imagePaths;
            
            console.log('Return images uploaded:', imagePaths);
        }

        // Save return request
        await returnRequest.save();

        res.json({
            success: true,
            message: 'Return request submitted successfully. Admin will review your request.',
            returnRequestId: returnRequest._id
        });

    } catch (error) {
        console.error('Error returning order:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to return order' 
        });
    }
};

// Calculate wallet balance
const calculateWalletBalance = async (userId) => {
    try {
        // Get all wallet transactions
        const transactions = await Wallet.find({ userId });
        
        console.log('🔍 Wallet transactions found:', transactions.length);
        console.log('🔍 Transaction details:', JSON.stringify(transactions, null, 2));
        
        // Calculate transaction balance
        const transactionBalance = transactions.reduce((total, transaction) => {
            console.log('🔍 Processing transaction:', {
                amount: transaction.amount,
                type: transaction.amount?.constructor?.name,
                entryType: transaction.entryType,
                description: transaction.description
            });
            
            const amount = parseFloat(transaction.amount) || 0;
            console.log('🔍 Parsed amount:', amount, 'isNaN:', isNaN(amount));
            
            if (transaction.entryType === 'CREDIT') {
                return total + amount;
            } else {
                return total - amount;
            }
        }, 0);
        
        console.log('Transaction balance:', transactionBalance);
        console.log('Total balance:', transactionBalance);
        
        return Math.max(0, transactionBalance); // Ensure balance doesn't go negative
    } catch (error) {
        console.error('Error calculating balance:', error);
        return 0;
    }
};
// Load wallet page
const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.redirect('/login');
        }

        // Get user with wallet balance
        const user = await User.findById(userId);
        
        // Get wallet transactions
        const transactions = await Wallet.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10);

        // Calculate current balance
        const balance = await calculateWalletBalance(userId);
        
        // Get last transaction
        const lastTransaction = transactions.length > 0 ? transactions[0] : null;

        res.render('user/wallet', {
            title: 'Wallet',
            siteName: 'COLINGUEST',
            user: user,
            wallet: { balance: balance },
            transactions,
            lastTransaction,
            balance
        });

    } catch (error) {
        console.error('Error loading wallet:', error);
        res.status(500).render('user/page-404', { 
            title: "Error", 
            user: req.session?.user || null,
            message: 'Failed to load wallet' 
        });
    }
};

// Add money to wallet (simple implementation without Razorpay)
const addMoneyToWallet = async (req, res) => {
    try {
        console.log('Add money request received:', req.body);
        console.log('Session user:', req.session.user);
        
        const userId = req.session.user?._id || req.session.user?.id;
        const { amount, paymentMethod } = req.body;

        if (!userId) {
            console.log('User not authenticated');
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        if (!amount || isNaN(amount) || amount <= 0) {
            console.log('Invalid amount:', amount);
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid amount' 
            });
        }

        // Generate a simple transaction ID
        const transactionId = 'WALLET_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        console.log('Generated transaction ID:', transactionId);

        // Create wallet transaction
        const transaction = new Wallet({
            userId,
            transactionId,
            payment_type: paymentMethod || 'manual',
            amount: parseFloat(amount),
            entryType: 'CREDIT',
            type: 'add_money',
            status: 'completed',
            description: `Money added via ${paymentMethod || 'manual'}`
        });

        await transaction.save();
        console.log('Transaction saved:', transaction);

        // Update user wallet balance
        await User.findByIdAndUpdate(userId, {
            $inc: { wallet: parseFloat(amount) }
        });
        console.log('User wallet updated with amount:', amount);

        const newBalance = await calculateWalletBalance(userId);
        console.log('New balance calculated:', newBalance);

        res.json({
            success: true,
            message: 'Money added to wallet successfully',
            balance: newBalance,
            transactionId
        });

    } catch (error) {
        console.error('Error adding money to wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add money to wallet' 
        });
    }
};

// Get wallet transactions
const getWalletTransactions = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        const transactions = await Wallet.find({ userId })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({
            success: true,
            transactions
        });

    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get transactions' 
        });
    }
};

// Process wallet refund
const processWalletRefund = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        const { orderId, amount, reason } = req.body;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        // Generate transaction ID
        const transactionId = 'REFUND_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Create refund transaction
        const transaction = new Wallet({
            userId,
            orderId,
            transactionId,
            payment_type: 'refund',
            amount: parseFloat(amount),
            entryType: 'CREDIT',
            type: 'refund',
            status: 'completed'
        });

        await transaction.save();

        // Update user wallet balance
        await User.findByIdAndUpdate(userId, {
            $inc: { wallet: parseFloat(amount) }
        });

        const newBalance = await calculateWalletBalance(userId);

        res.json({
            success: true,
            message: 'Refund processed successfully',
            balance: newBalance,
            transactionId
        });

    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process refund' 
        });
    }
};

// Deduct money from wallet (for purchases) - HTTP endpoint
const deductFromWallet = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        const { orderId, amount } = req.body;

        const result = await deductMoney(userId, amount, 'Payment for order', orderId);

        if (!result.success) {
            return res.status(400).json({ 
                success: false, 
                error: 'Insufficient wallet balance' 
            });
        }

        res.json({
            success: true,
            message: 'Payment successful',
            transactionId: result.transactionId,
            newBalance: result.newBalance
        });

    } catch (error) {
        console.error('Error deducting from wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process payment' 
        });
    }
};

// Internal function to deduct money from wallet (for internal calls)
const deductMoney = async (userId, amount, description, reference) => {
    try {
        // Check current balance
        const currentBalance = await calculateWalletBalance(userId);
        
        if (currentBalance < parseFloat(amount)) {
            throw new Error('Insufficient wallet balance');
        }

        // Generate transaction ID
        const transactionId = 'PURCHASE_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Create debit transaction
        const transaction = new Wallet({
            userId,
            orderId: reference.includes('Order #') ? reference.replace('Order #', '') : null,
            transactionId,
            payment_type: 'wallet',
            amount: parseFloat(amount),
            entryType: 'DEBIT',
            type: 'product_purchase',
            status: 'completed'
        });

        await transaction.save();

        // Update user wallet balance
        await User.findByIdAndUpdate(userId, {
            $inc: { wallet: -parseFloat(amount) }
        });

        const newBalance = await calculateWalletBalance(userId);
        
        console.log('Wallet deduction successful:', {
            userId,
            amount,
            newBalance,
            transactionId
        });

        return {
            success: true,
            newBalance,
            transactionId
        };

    } catch (error) {
        console.error('Error deducting from wallet:', error);
        throw error;
    }
};

module.exports = {
    loadWallet,
    calculateWalletBalance,
    addMoneyToWallet,
    getWalletTransactions,
    processWalletRefund,
    getWalletBalance,
    deductFromWallet,
    deductMoney,
    processOrderCancellation,
    processProductReturn,
    returnOrder
};