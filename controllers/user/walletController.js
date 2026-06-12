const Wallet  = require('../../models/walletSchema');
const Order   = require('../../models/orderSchema');
const { v4: uuidv4 } = require('uuid');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

// ── GET WALLET PAGE ──────────────────────────────────────────────
const getWallet = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const page   = parseInt(req.query.page) || 1;
        const limit  = 10;
        const skip   = (page - 1) * limit;

        // ✅ Get all completed transactions
        const [transactions, total] = await Promise.all([
            Wallet.find({ userId, status: 'completed' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Wallet.countDocuments({ userId, status: 'completed' })
        ]);

        // ✅ Calculate balance from all transactions
        const allTxns   = await Wallet.find({ userId, status: 'completed' }).lean();
        const balance   = allTxns.reduce((total, txn) => {
            if (txn.entryType === 'CREDIT') return total + txn.amount;
            if (txn.entryType === 'DEBIT')  return total - txn.amount;
            return total;
        }, 0);

        res.render('user/wallet', {
            user:         req.session.user,
            balance:      Math.max(balance, 0),
            transactions,
            currentPage:  page,
            totalPages:   Math.ceil(total / limit),
            totalTxns:    total
        });

    } catch (error) {
        console.error('getWallet error:', error);
        res.redirect('/pageNotFound');
    }
};

// ── CREDIT WALLET (internal — called from cancel/return) ─────────
const creditWallet = async ({ userId, amount, orderId, type, description }) => {
    const txn = new Wallet({
        userId,
        orderId:       orderId || null,
        transactionId: uuidv4(),
        payment_type:  'wallet',
        amount,
        status:        'completed',
        entryType:     'CREDIT',
        type,          // 'refund' or 'cancel'
        description
    });
    await txn.save();
    return txn;
};

// ── DEBIT WALLET (internal — called from checkout) ───────────────
const debitWallet = async ({ userId, amount, orderId, description }) => {
    // ✅ Calculate current balance first
    const allTxns = await Wallet.find({ userId, status: 'completed' }).lean();
    const balance = allTxns.reduce((total, txn) => {
        if (txn.entryType === 'CREDIT') return total + txn.amount;
        if (txn.entryType === 'DEBIT')  return total - txn.amount;
        return total;
    }, 0);

    if (balance < amount) {
        throw new Error(
            `Insufficient wallet balance. Available: ₹${balance.toLocaleString('en-IN')}`
        );
    }

    const txn = new Wallet({
        userId,
        orderId:       orderId || null,
        transactionId: uuidv4(),
        payment_type:  'wallet',
        amount,
        status:        'completed',
        entryType:     'DEBIT',
        type:          'product_purchase',
        description
    });
    await txn.save();
    return txn;
};

// ── GET WALLET BALANCE (internal — called from checkout) ─────────
const getWalletBalance = async (userId) => {
    const allTxns = await Wallet.find({ userId, status: 'completed' }).lean();
    const balance = allTxns.reduce((total, txn) => {
        if (txn.entryType === 'CREDIT') return total + txn.amount;
        if (txn.entryType === 'DEBIT')  return total - txn.amount;
        return total;
    }, 0);
    return Math.max(balance, 0);
};

module.exports = {
    getWallet,
    creditWallet,
    debitWallet,
    getWalletBalance
};