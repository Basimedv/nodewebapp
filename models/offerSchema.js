// models/offerSchema.js
const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    offerName: {
        type: String,
        required: true,
        trim: true
    },
    offerType: {
        type: String,
        enum: ['product', 'category'],
        required: true
    },
    discountPercentage: {
        type: Number,
        required: true,
        min: 1,
        max: 90
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Offer', offerSchema);