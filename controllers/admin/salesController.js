const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');

// Render Sales Report Page
const renderSalesReport = async (req, res) => {
    try {
        // Check what file name you have in views/admin folder
        // Common names: sales-report.ejs, salesReport.ejs, sales.ejs
        res.render('admin/sales-report', {
            title: 'Sales Report',
            currentPage: 'salesReport'
        });
    } catch (error) {
        console.error('Error rendering sales report:', error);
        res.status(500).send('Error loading sales report');
    }
};

// Get sales data for different periods (API endpoint)
const getSalesData = async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const currentDate = new Date();
        let start, end;

        // Calculate date range based on period or custom dates
        if (period === 'custom' && startDate && endDate) {
            // Use custom date range
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0); // Start of day
            
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // End of day
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

        console.log('📊 Sales Report Query:', {
            period: period,
            startDate: start,
            endDate: end
        });

        // Aggregate sales data
        const orders = await Order.find({
            createdOn: {
                $gte: start,
                $lte: end
            }
        }).populate('userId', 'fullName email');

        console.log('📊 Orders found:', orders.length);

        // Calculate statistics
        let totalAmount = 0;
        let totalDiscounts = 0;
        
        orders.forEach(order => {
            totalAmount += (order.finalAmount || 0);
            totalDiscounts += (order.discount || 0);
        });
        
        const totalOrders = orders.length;
        const netSales = totalAmount - totalDiscounts;

        const stats = {
            totalOrders: totalOrders,
            totalAmount: Math.round(totalAmount),
            totalDiscounts: Math.round(totalDiscounts),
            netSales: Math.round(netSales)
        };

        console.log('📊 Statistics:', stats);

        // Prepare chart data
        const chartData = {
            labels: [],
            revenue: []
        };

        // Group by date for chart
        const dailyRevenue = {};
        orders.forEach(order => {
            const date = new Date(order.createdOn).toLocaleDateString('en-IN');
            if (!dailyRevenue[date]) {
                dailyRevenue[date] = 0;
            }
            dailyRevenue[date] += (order.finalAmount || 0);
        });

        // Sort dates and prepare chart data
        const sortedDates = Object.keys(dailyRevenue).sort((a, b) => {
            return new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'));
        });
        
        chartData.labels = sortedDates;
        chartData.revenue = sortedDates.map(date => Math.round(dailyRevenue[date]));

        console.log('📊 Chart Data:', {
            labels: chartData.labels,
            revenue: chartData.revenue
        });

        // Get recent orders
        const recentOrders = orders
            .sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))
            .slice(0, 10)
            .map(order => ({
                orderId: order.orderId || order._id,
                createdAt: order.createdOn,
                customerName: order.userId?.fullName || 'Guest',
                totalAmount: order.finalAmount || 0,
                status: order.status,
                paymentMethod: order.paymentMethod || 'N/A'
            }));

        console.log('📊 Recent Orders:', recentOrders.length);

        res.json({
            success: true,
            stats,
            chartData,
            recentOrders
        });

    } catch (error) {
        console.error('❌ Error fetching sales data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sales data',
            error: error.message
        });
    }
};

module.exports = {
    renderSalesReport,
    getSalesData
};