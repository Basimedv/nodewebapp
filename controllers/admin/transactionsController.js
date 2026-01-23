const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');

// Render Transactions Page
const renderTransactions = async (req, res) => {
    try {
        res.render('admin/transactions', {
            title: 'Transactions',
            currentPage: 'transactions'
        });
    } catch (error) {
        console.error('Error rendering transactions:', error);
        res.status(500).send('Error loading transactions');
    }
};

// Get transactions data for different periods
const getTransactionsData = async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const currentDate = new Date();
        let start, end;

        // Calculate date range based on period or custom dates
        if (period === 'custom' && startDate && endDate) {
            // Use custom date range
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            // Use predefined periods
            switch(period) {
                case 'today':
                    start = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                    end = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59, 999);
                    break;
                case 'week':
                    const weekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
                    start = new Date(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate());
                    end = currentDate;
                    break;
                case 'month':
                    start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
                case 'year':
                    start = new Date(currentDate.getFullYear(), 0, 1);
                    end = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59, 999);
                    break;
                default:
                    start = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                    end = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59, 999);
            }
        }

        console.log('📊 Transactions Query:', {
            period: period,
            startDate: start,
            endDate: end
        });

        // Get orders (successful transactions)
        const orders = await Order.find({
            createdOn: {
                $gte: start,
                $lte: end
            }
        }).populate('userId', 'fullName email phone address')
          .lean() // Use lean() to get plain JavaScript objects
          .sort({ createdOn: -1 });

        // Get wallet transactions
        const walletTransactions = await Wallet.find({
            createdAt: {
                $gte: start,
                $lte: end
            }
        }).populate('userId', 'fullName email phone address')
          .sort({ createdAt: -1 });

        // Combine and format all transactions
        const allTransactions = [];

        // Add order transactions
        orders.forEach(order => {
            const orderType = order.status === 'Cancelled' || order.status === 'Failed' ? 'Order Cancelled' : 'Product Purchased';
            
            // Debug: Log the order structure to see available fields
            console.log('🔍 Order structure:', {
                orderId: order.orderId,
                shippingAddress: order.shippingAddress,
                deliveryAddress: order.deliveryAddress,
                address: order.address,
                guestDetails: order.guestDetails,
                userId: order.userId
            });
            
            // Format shipping address properly - check multiple possible field names
            let shippingAddress = null;
            let formattedAddress = 'N/A';
            
            // Check for shipping address with different field names
            if (order.shippingAddress) {
                shippingAddress = order.shippingAddress;
                console.log('📦 Found shippingAddress:', shippingAddress);
            } else if (order.deliveryAddress) {
                shippingAddress = order.deliveryAddress;
                console.log('🚚 Found deliveryAddress:', shippingAddress);
            } else if (order.address) {
                shippingAddress = order.address;
                console.log('🏠 Found address:', shippingAddress);
            } else if (order.guestDetails?.address) {
                shippingAddress = order.guestDetails.address;
                console.log('👥 Found guestDetails.address:', shippingAddress);
            } else if (order.userId?.address) {
                shippingAddress = order.userId.address;
                console.log('👤 Found userId.address:', shippingAddress);
            }
            
            // Format address for display
            if (shippingAddress) {
                const addr = shippingAddress;
                formattedAddress = `${addr.house || ''} ${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.pincode || ''}`.trim();
                if (!formattedAddress) formattedAddress = 'N/A';
            }
            
            allTransactions.push({
                _id: order._id,
                type: orderType,
                transactionId: order.orderId || order._id,
                date: order.createdOn,
                user: order.userId?.fullName || order.guestDetails?.name || 'Guest',
                userId: order.userId?._id || 'Guest',
                phoneNumber: order.userId?.phone || order.guestDetails?.phone || shippingAddress?.phone || 'N/A',
                email: order.userId?.email || order.guestDetails?.email || 'N/A',
                address: formattedAddress,
                shippingAddress: shippingAddress, // Pass the full shipping address object
                amount: order.finalAmount || 0,
                status: order.status,
                paymentMethod: order.paymentMethod || 'N/A',
                totalItems: order.orderedItems?.length || 0,
                description: `Order #${order.orderId || order._id}`
            });
        });

        // Add wallet transactions
        walletTransactions.forEach(wallet => {
            // Format address properly
            let address = 'N/A';
            if (wallet.userId?.address) {
                const addr = wallet.userId.address;
                address = `${addr.house || ''} ${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.pincode || ''}`.trim();
                if (!address) address = 'N/A';
            }
            
            allTransactions.push({
                _id: wallet._id,
                type: 'Wallet Updated',
                transactionId: wallet._id,
                date: wallet.createdAt,
                user: wallet.userId?.fullName || 'Unknown',
                userId: wallet.userId?._id || 'N/A',
                phoneNumber: wallet.userId?.phone || 'N/A',
                email: wallet.userId?.email || 'N/A',
                address: address,
                amount: wallet.amount || 0,
                status: wallet.type === 'credit' ? 'Completed' : 'Processed',
                paymentMethod: 'Wallet',
                description: wallet.description || wallet.type || 'Wallet Transaction'
            });
        });

        // Sort all transactions by date (newest first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate statistics
        const totalTransactions = allTransactions.length;
        const totalAmount = allTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
        const successfulTransactions = allTransactions.filter(t => t.status === 'Completed' || t.status === 'Delivered').length;
        const failedTransactions = allTransactions.filter(t => t.status === 'Failed' || t.status === 'Cancelled').length;

        const stats = {
            totalTransactions: totalTransactions,
            totalAmount: Math.round(totalAmount),
            successfulTransactions: successfulTransactions,
            failedTransactions: failedTransactions
        };

        console.log('📊 Transactions Statistics:', stats);

        res.json({
            success: true,
            stats,
            transactions: allTransactions
        });

    } catch (error) {
        console.error('❌ Error fetching transactions data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching transactions data',
            error: error.message
        });
    }
};

module.exports = {
    renderTransactions,
    getTransactionsData
};
