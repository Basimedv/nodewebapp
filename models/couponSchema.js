const mongoose = require('mongoose');
 
const couponSchema = new mongoose.Schema({
 
    // ── Core ─────────────────────────────────────────────────────
    code: {
        type:     String,
        required: true,
        unique:   true,
        trim:     true,
        uppercase: true
    },
    type: {
        type:     String,
        enum:     ['PERCENTAGE', 'FIXED'],
        required: true,
        default:  'PERCENTAGE'
    },
    value: {
        type:     Number,
        required: true,
        min:      0
    },
 
    // ── Order constraints ─────────────────────────────────────────
    minOrderAmount: {
        type:    Number,
        default: 0
    },
    maxDiscount: {
        type:    Number,
        default: 0   // 0 = no cap (only relevant for PERCENTAGE type)
    },
 
    // ── Usage limits ──────────────────────────────────────────────
    usageLimit: {
        type:    Number,
        default: 0   // 0 = unlimited
    },
    usedCount: {
        type:    Number,
        default: 0
    },
 
    // ── Validity window ───────────────────────────────────────────
    startDate: {
        type:    Date,
        default: Date.now
    },
    endDate: {
        type:     Date,
        required: true
    },
 
    // ── Status ────────────────────────────────────────────────────
    isActive: {
        type:    Boolean,
        default: true
    },
 
    // ── Targeting ─────────────────────────────────────────────────
    applicableCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref:  'Category'
    }],
    applicableProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref:  'Product'
    }],
    excludedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref:  'Product'
    }],
 
    // ── Restrictions ──────────────────────────────────────────────
    firstOrderOnly: {
        type:    Boolean,
        default: false
    },
    allowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref:  'User'
    }],
 
    // ── Track which users already used this coupon ────────────────
    usedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref:  'User'
    }],
 
    // ── Meta ──────────────────────────────────────────────────────
    description: {
        type:    String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref:  'User'   // admin user
    },
    createdOn: {
        type:    Date,
        default: Date.now
    }
 
});
 
// ── Virtual: is this coupon currently valid? ──────────────────────
couponSchema.virtual('isValid').get(function () {
    const now = new Date();
    return (
        this.isActive &&
        now >= this.startDate &&
        now <= this.endDate &&
        (this.usageLimit === 0 || this.usedCount < this.usageLimit)
    );
});
 
// ── Method: calculate discount for a given cart amount ────────────
couponSchema.methods.calculateDiscount = function (cartAmount) {
    if (this.type === 'PERCENTAGE') {
        let discount = (cartAmount * this.value) / 100;
        if (this.maxDiscount > 0) discount = Math.min(discount, this.maxDiscount);
        return Math.floor(discount);
    }
    return Math.min(this.value, cartAmount); // FIXED
};
 
const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;
 