const Order        = require('../../models/orderSchema');
const User         = require('../../models/userSchema');
const { ROUTES }   = require('../../constants/routes');
const PDFDocument  = require('pdfkit');

// ── Helper: build date filter ────────────────────────────────────
const getDateFilter = (filter, startDate, endDate) => {
    const now = new Date();
    let start, end;

    switch (filter) {
        case 'today':
            start = new Date(now); start.setHours(0, 0, 0, 0);
            end   = new Date(now); end.setHours(23, 59, 59, 999);
            break;
        case 'weekly':
            start = new Date(now); start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0);
            end   = new Date(now); end.setHours(23, 59, 59, 999);
            break;
        case 'monthly':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
        case 'custom':
            start = startDate ? new Date(startDate) : new Date(now.getFullYear(), 0, 1);
            end   = endDate   ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
            break;
        case 'yearly':
        default:
            start = new Date(now.getFullYear(), 0, 1);
            end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }
    return { start, end };
};

// ── Helper: fetch all report data ────────────────────────────────
const getReportData = async (filter, startDate, endDate) => {
    const { start, end } = getDateFilter(filter, startDate, endDate);
    const dateMatch = { createdOn: { $gte: start, $lte: end } };

    const [statsAgg, statusAgg, orders] = await Promise.all([
        Order.aggregate([
            { $match: { ...dateMatch, status: { $ne: 'Cancelled' } } },
            {
                $group: {
                    _id:           null,
                    totalAmount:   { $sum: '$finalAmount' },
                    totalDiscount: { $sum: '$dicount' },
                    totalCoupon:   { $sum: { $cond: ['$couponApplied', '$dicount', 0] } },
                    count:         { $sum: 1 }
                }
            }
        ]),
        Order.aggregate([
            { $match: dateMatch },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Order.find(dateMatch).sort({ createdOn: -1 }).lean()
    ]);

    const stats = statsAgg[0] || { totalAmount: 0, totalDiscount: 0, totalCoupon: 0, count: 0 };
    const statusMap = {};
    statusAgg.forEach(s => { statusMap[s._id] = s.count; });

    return { stats, statusMap, orders, start, end };
};

// ── GET /admin/sales-report ──────────────────────────────────────
const getSalesReport = async (req, res) => {
    try {
        const { filter = 'yearly', startDate = '', endDate = '', page = 1 } = req.query;
        const LIMIT       = 10;
        const currentPage = Math.max(parseInt(page) || 1, 1);
        const { start, end } = getDateFilter(filter, startDate, endDate);
        const dateMatch = { createdOn: { $gte: start, $lte: end } };

        const [statsAgg] = await Promise.all([
            Order.aggregate([
                { $match: { ...dateMatch, status: { $ne: 'Cancelled' } } },
                {
                    $group: {
                        _id:           null,
                        totalAmount:   { $sum: '$finalAmount' },
                        totalDiscount: { $sum: '$dicount' },
                        totalCoupon:   { $sum: { $cond: ['$couponApplied', '$dicount', 0] } },
                        count:         { $sum: 1 }
                    }
                }
            ])
        ]);

        const stats = statsAgg[0] || { totalAmount: 0, totalDiscount: 0, totalCoupon: 0, count: 0 };

        const chartRaw = await Order.aggregate([
            { $match: { ...dateMatch, status: { $ne: 'Cancelled' } } },
            {
                $group: {
                    _id:    { $dateToString: { format: '%Y-%m-%d', date: '$createdOn' } },
                    sales:  { $sum: '$finalAmount' },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const statusAgg = await Order.aggregate([
            { $match: dateMatch },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const statusMap = {};
        statusAgg.forEach(s => { statusMap[s._id] = s.count; });

        const totalDocs  = await Order.countDocuments(dateMatch);
        const totalPages = Math.ceil(totalDocs / LIMIT);
        const skip       = (currentPage - 1) * LIMIT;

        const orders = await Order.find(dateMatch)
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(LIMIT)
            .lean();

        res.render('admin/salesReport', {
            title:      'Sales Report',
            path:       ROUTES.ADMIN.SALES_REPORT,
            filter,
            startDate,
            endDate,
            salesCount:       stats.count,
            totalAmount:      stats.totalAmount,
            totalDiscount:    stats.totalDiscount,
            couponDeductions: stats.totalCoupon,
            chartLabels: chartRaw.map(r => r._id),
            chartSales:  chartRaw.map(r => r.sales),
            chartOrders: chartRaw.map(r => r.orders),
            statusMap,
            orders,
            currentPage,
            totalPages
        });

    } catch (err) {
        console.error('getSalesReport error:', err);
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};

// ── GET /admin/sales-report/export-pdf ──────────────────────────
const exportPDF = async (req, res) => {
    try {
        const { filter = 'yearly', startDate = '', endDate = '' } = req.query;
        const { stats, orders, start, end } = await getReportData(filter, startDate, endDate);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        const filename = `sales-report-${filter}-${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        // ── Colors & helpers ─────────────────────────────────────
        const COLOR_PRIMARY   = '#4361ee';
        const COLOR_DARK      = '#1a1a1a';
        const COLOR_GRAY      = '#888888';
        const COLOR_LIGHT_BG  = '#f4f6f9';
        const COLOR_WHITE     = '#ffffff';
        const PAGE_W          = doc.page.width  - 80; // usable width
        const LEFT            = 40;

        const drawRect = (x, y, w, h, color, radius = 0) => {
            doc.roundedRect(x, y, w, h, radius).fill(color);
        };

        const fmtCurrency = (n) =>
            '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const fmtDate = (d) =>
            new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        // ── Header banner ────────────────────────────────────────
        drawRect(0, 0, doc.page.width, 90, COLOR_PRIMARY);

        doc.fillColor(COLOR_WHITE)
           .fontSize(22).font('Helvetica-Bold')
           .text('Sales Report', LEFT, 22);

        doc.fillColor('rgba(255,255,255,0.75)')
           .fontSize(10).font('Helvetica')
           .text(
               `Period: ${filter.charAt(0).toUpperCase() + filter.slice(1)}  •  ` +
               `${fmtDate(start)} – ${fmtDate(end)}  •  Generated: ${fmtDate(new Date())}`,
               LEFT, 52
           );

        let y = 110;

        // ── Stat cards (2×2 grid) ─────────────────────────────────
        const cardW = (PAGE_W - 16) / 2;
        const cards = [
            { label: 'Overall Sales Count',  value: stats.count.toLocaleString('en-IN'),  sub: 'orders' },
            { label: 'Overall Order Amount', value: fmtCurrency(stats.totalAmount),        sub: 'revenue' },
            { label: 'Overall Discount',     value: fmtCurrency(stats.totalDiscount),      sub: 'order-level discounts' },
            { label: 'Coupon Deductions',    value: fmtCurrency(stats.totalCoupon),        sub: 'product-level coupons' }
        ];

        cards.forEach((card, i) => {
            const cx = LEFT + (i % 2) * (cardW + 16);
            const cy = y    + Math.floor(i / 2) * 80;

            drawRect(cx, cy, cardW, 68, COLOR_LIGHT_BG, 8);

            doc.fillColor(COLOR_GRAY).fontSize(7).font('Helvetica-Bold')
               .text(card.label.toUpperCase(), cx + 14, cy + 12, { width: cardW - 28 });

            doc.fillColor(COLOR_DARK).fontSize(18).font('Helvetica-Bold')
               .text(card.value, cx + 14, cy + 25, { width: cardW - 28 });

            doc.fillColor(COLOR_GRAY).fontSize(8).font('Helvetica')
               .text(card.sub, cx + 14, cy + 50, { width: cardW - 28 });
        });

        y += 180;

        // ── Orders table ─────────────────────────────────────────
        doc.fillColor(COLOR_DARK).fontSize(12).font('Helvetica-Bold')
           .text('Order Details', LEFT, y);
        y += 18;

        // Table header
        const cols = [
            { label: 'Order ID',   w: 110 },
            { label: 'Date',       w: 75  },
            { label: 'Payment',    w: 75  },
            { label: 'Coupon',     w: 65  },
            { label: 'Discount',   w: 70  },
            { label: 'Amount',     w: 70  },
            { label: 'Status',     w: 75  }
        ];

        drawRect(LEFT, y, PAGE_W, 24, COLOR_DARK, 4);

        let cx = LEFT + 8;
        doc.fillColor(COLOR_WHITE).fontSize(7.5).font('Helvetica-Bold');
        cols.forEach(col => {
            doc.text(col.label, cx, y + 8, { width: col.w - 4, lineBreak: false });
            cx += col.w;
        });
        y += 24;

        // Table rows
        const statusColors = {
            Delivered:  '#7b5ea7',
            Shipped:    '#0369a1',
            Processing: '#d97706',
            Pending:    '#b45309',
            Returned:   '#dc2626',
            Cancelled:  '#888888',
            Placed:     '#4361ee',
            Paid:       '#2ec4b6'
        };

        orders.forEach((order, idx) => {
            // Page break check
            if (y > doc.page.height - 80) {
                doc.addPage();
                y = 40;
            }

            const rowBg = idx % 2 === 0 ? COLOR_WHITE : '#f9fafb';
            drawRect(LEFT, y, PAGE_W, 22, rowBg);

            // Bottom border
            doc.moveTo(LEFT, y + 22).lineTo(LEFT + PAGE_W, y + 22)
               .strokeColor('#f0f0f0').lineWidth(0.5).stroke();

            const cells = [
                order.orderId || '—',
                fmtDate(order.createdOn),
                order.paymentMethod || '—',
                order.couponApplied ? (order.couponCode || '—') : '—',
                fmtCurrency(order.dicount || 0),
                fmtCurrency(order.finalAmount || 0),
                order.status || '—'
            ];

            cx = LEFT + 8;
            doc.fillColor(COLOR_DARK).fontSize(7.5).font('Helvetica');
            cells.forEach((cell, ci) => {
                // Color the status cell
                if (ci === 6) {
                    doc.fillColor(statusColors[cell] || COLOR_GRAY);
                } else {
                    doc.fillColor(ci === 0 ? COLOR_DARK : '#444444');
                    if (ci === 0) doc.font('Helvetica-Bold');
                    else          doc.font('Helvetica');
                }
                doc.text(String(cell), cx, y + 7, { width: cols[ci].w - 4, lineBreak: false });
                cx += cols[ci].w;
            });

            y += 22;
        });

        if (orders.length === 0) {
            drawRect(LEFT, y, PAGE_W, 40, '#f9fafb', 4);
            doc.fillColor(COLOR_GRAY).fontSize(9).font('Helvetica')
               .text('No orders found for the selected period.', LEFT, y + 14, { width: PAGE_W, align: 'center' });
            y += 40;
        }

        // ── Footer ───────────────────────────────────────────────
        const footerY = doc.page.height - 40;
        doc.moveTo(LEFT, footerY).lineTo(LEFT + PAGE_W, footerY)
           .strokeColor('#e0e0e0').lineWidth(0.5).stroke();

        doc.fillColor(COLOR_GRAY).fontSize(8).font('Helvetica')
           .text(
               `Total ${orders.length} orders  •  Report generated on ${new Date().toLocaleString('en-IN')}`,
               LEFT, footerY + 8, { width: PAGE_W, align: 'center' }
           );

        doc.end();

    } catch (err) {
        console.error('exportPDF error:', err);
        if (!res.headersSent) res.status(500).json({ message: 'PDF generation failed', error: err.message });
    }
};

module.exports = { getSalesReport, exportPDF };