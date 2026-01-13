const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Products',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Requested', 'Approved', 'Rejected'],
       
    },
    
}, { timestamps: true });

const Refund = mongoose.model('Refund', refundSchema);

module.exports = Refund;
