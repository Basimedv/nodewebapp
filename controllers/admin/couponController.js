const Coupon = require('../../models/couponSchema');
const Order  = require('../../models/orderSchema');
 
// ── GET /admin/coupons ────────────────────────────────────────────
const getCoupons = async (req, res) => {
    try {
        const page        = parseInt(req.query.page) || 1;
        const limit       = 8;
        const searchQuery = req.query.query || '';
        const filter      = searchQuery ? { code: { $regex: searchQuery, $options: 'i' } } : {};
        const totalCoupons = await Coupon.countDocuments(filter);
        const totalPages   = Math.ceil(totalCoupons / limit);
        const coupons = await Coupon.find(filter)
            .sort({ createdOn: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();
        res.render('admin/coupon', { coupons, currentPage: page, totalPages: Math.max(totalPages, 1), searchQuery });
    } catch (err) {
        console.error('getCoupons error:', err);
        res.redirect('/admin/pageerror');
    }
};
 
// ── POST /admin/coupons/add ───────────────────────────────────────
const postAddCoupon = async (req, res) => {
    try {
        const { code, type, value, minOrderAmount, maxDiscount, usageLimit, startDate, endDate, isActive, firstOrderOnly, description } = req.body;
        if (!code || !type || !value || !endDate) {
            return res.status(400).json({ success: false, message: 'Code, type, value and end date are required.' });
        }
        const existing = await Coupon.findOne({ code: code.trim().toUpperCase() });
        if (existing) return res.status(400).json({ success: false, message: 'Coupon code already exists.' });
        if (type === 'PERCENTAGE' && (Number(value) < 1 || Number(value) > 100)) {
            return res.status(400).json({ success: false, message: 'Percentage value must be between 1 and 100.' });
        }
        const start = startDate ? new Date(startDate) : new Date();
        const end   = new Date(endDate);
        if (end <= start) return res.status(400).json({ success: false, message: 'End date must be after start date.' });
 
        const coupon = new Coupon({
            code:           code.trim().toUpperCase(),
            type,
            value:          Number(value),
            minOrderAmount: Number(minOrderAmount) || 0,
            maxDiscount:    Number(maxDiscount)    || 0,
            usageLimit:     Number(usageLimit)     || 0,
            startDate:      start,
            endDate:        end,
            isActive:       isActive === true || isActive === 'true' || isActive === 'on',
            firstOrderOnly: firstOrderOnly === true || firstOrderOnly === 'true',
            description:    description || '',
            createdBy:      req.session.admin?._id
        });
        await coupon.save();
        res.status(201).json({ success: true, message: 'Coupon created successfully.' });
    } catch (err) {
        console.error('postAddCoupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to create coupon.' });
    }
};
 
// ── PUT /admin/coupons/:id/edit ───────────────────────────────────
const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, type, value, minOrderAmount, maxDiscount, usageLimit, startDate, endDate, isActive, firstOrderOnly, description } = req.body;
 
        if (!code || !type || !value || !endDate) {
            return res.status(400).json({ success: false, message: 'Code, type, value and end date are required.' });
        }
 
        const coupon = await Coupon.findById(id);
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found.' });
 
        // Check duplicate code — allow same code on the same coupon
        const duplicate = await Coupon.findOne({ code: code.trim().toUpperCase(), _id: { $ne: id } });
        if (duplicate) return res.status(400).json({ success: false, message: 'Coupon code already exists on another coupon.' });
 
        if (type === 'PERCENTAGE' && (Number(value) < 1 || Number(value) > 100)) {
            return res.status(400).json({ success: false, message: 'Percentage value must be between 1 and 100.' });
        }
 
        const start = startDate ? new Date(startDate) : coupon.startDate;
        const end   = new Date(endDate);
        if (end <= start) return res.status(400).json({ success: false, message: 'End date must be after start date.' });
 
        coupon.code           = code.trim().toUpperCase();
        coupon.type           = type;
        coupon.value          = Number(value);
        coupon.minOrderAmount = Number(minOrderAmount) || 0;
        coupon.maxDiscount    = Number(maxDiscount)    || 0;
        coupon.usageLimit     = Number(usageLimit)     || 0;
        coupon.startDate      = start;
        coupon.endDate        = end;
        coupon.isActive       = isActive === true || isActive === 'true';
        coupon.firstOrderOnly = firstOrderOnly === true || firstOrderOnly === 'true';
        coupon.description    = description || '';
 
        await coupon.save();
        res.json({ success: true, message: 'Coupon updated successfully.' });
    } catch (err) {
        console.error('editCoupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to update coupon.' });
    }
};
 
// ── PUT /admin/coupons/:id/toggle ─────────────────────────────────
const toggleCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        coupon.isActive = !coupon.isActive;
        await coupon.save();
        res.json({ success: true, isActive: coupon.isActive });
    } catch (err) {
        console.error('toggleCoupon error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
 
// ── DELETE /admin/coupons/:id ─────────────────────────────────────
const deleteCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        res.json({ success: true, message: 'Coupon deleted' });
    } catch (err) {
        console.error('deleteCoupon error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
 
// ── POST /checkout/apply-coupon (user side) ───────────────────────
const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        const { code, subtotal } = req.body;
        if (!code?.trim()) return res.status(400).json({ success: false, message: 'Please enter a coupon code' });
 
        const now    = new Date();
        const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
        if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
 
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
        }
        if (coupon.usedBy.some(id => id.toString() === userId.toString())) {
            return res.status(400).json({ success: false, message: 'You have already used this coupon' });
        }
        if (coupon.allowedUsers.length > 0 && !coupon.allowedUsers.some(id => id.toString() === userId.toString())) {
            return res.status(400).json({ success: false, message: 'This coupon is not available for your account' });
        }
        if (coupon.firstOrderOnly) {
            const pastOrder = await Order.findOne({ userId });
            if (pastOrder) return res.status(400).json({ success: false, message: 'This coupon is for first-time orders only' });
        }
        if (subtotal < coupon.minOrderAmount) {
            return res.status(400).json({ success: false, message: `Minimum order amount is ₹${coupon.minOrderAmount.toLocaleString('en-IN')}` });
        }
 
        const discount   = coupon.calculateDiscount(subtotal);
        const finalTotal = Math.max(subtotal - discount, 0);
        return res.status(200).json({ success: true, message: `Coupon applied! You saved ₹${discount.toLocaleString('en-IN')}`, discount, finalTotal, couponCode: coupon.code });
    } catch (error) {
        console.error('applyCoupon error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
};
 
module.exports = { getCoupons, postAddCoupon, editCoupon, toggleCoupon, deleteCoupon, applyCoupon };
 