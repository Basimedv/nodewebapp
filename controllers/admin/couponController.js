const Coupon = require('../../models/couponSchema');

const getCoupons = async (req, res) => {
    try {
        const page        = parseInt(req.query.page) || 1;
        const limit       = 8;
        const searchQuery = req.query.query || '';

        const filter = {
            offerPrice:   { $exists: true, $ne: null },
            minimumPrice: { $exists: true, $ne: null },
            ...(searchQuery && { name: { $regex: searchQuery, $options: 'i' } })
        };

        const totalCoupons = await Coupon.countDocuments(filter);
        const totalPages   = Math.ceil(totalCoupons / limit);

        const coupons = await Coupon.find(filter)
            .sort({ createdOn: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.render('admin/coupon', {
            coupons,
            currentPage:  page,
            totalPages:   Math.max(totalPages, 1),
            searchQuery
        });
    } catch (err) {
        console.error('getCoupons error:', err);
        res.redirect('/admin/pageerror');
    }
};

// ── GET /admin/coupons/add ────────────────────────────────────────
const getAddCoupon = (req, res) => {
    res.render('admin/add-coupon');
};

// ── POST /admin/coupons/add  (JSON — called from modal via fetch) ─
const postAddCoupon = async (req, res) => {
    try {
        const { name, offerPrice, minimumPrice, expireOn, isList } = req.body;

        if (!name || !offerPrice || !minimumPrice || !expireOn) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const existing = await Coupon.findOne({ name: name.trim().toUpperCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists.' });
        }

        const coupon = new Coupon({
            name:         name.trim().toUpperCase(),
            offerPrice:   Number(offerPrice),
            minimumPrice: Number(minimumPrice),
            expireOn:     new Date(expireOn),
            isList:       isList === true || isList === 'true' || isList === 'on'
        });

        await coupon.save();
        res.status(201).json({ success: true, message: 'Coupon created successfully.' });
    } catch (err) {
        console.error('postAddCoupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to create coupon.' });
    }
};

// ── PUT /admin/coupons/:id/toggle ─────────────────────────────────
const toggleCoupon = async (req, res) => {
    try {
        const { isList } = req.body;
        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            { isList },
            { new: true }
        );
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }
        res.json({ success: true, isList: coupon.isList });
    } catch (err) {
        console.error('toggleCoupon error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── DELETE /admin/coupons/:id ─────────────────────────────────────
const deleteCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }
        res.json({ success: true, message: 'Coupon deleted' });
    } catch (err) {
        console.error('deleteCoupon error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { getCoupons, getAddCoupon, postAddCoupon, toggleCoupon, deleteCoupon };

