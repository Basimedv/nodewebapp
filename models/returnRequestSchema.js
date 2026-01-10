const mongoose = require('mongoose');

const returnRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    returnReason: {
        type: String,
        required: true
    },
    returnImages: [{
        type: String
    }],
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    adminNotes: {
        type: String,
        default: ''
    },
    refundAmount: {
        type: Number,
        required: true
    },
    requestedOn: {
        type: Date,
        default: Date.now
    },
    reviewedOn: {
        type: Date
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
