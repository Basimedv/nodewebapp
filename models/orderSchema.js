const mongoose = require('mongoose')
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid')

const orderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productName: {
            type: String,
            required: true
        },
        productImage: [{
            type: String
        }],
        quantity: {
            type: Number,
            required: true
        },
        size: {
            type: String,
            default: 'M'
        },
        price: {
            type: Number,
            default: 0
        }
    }],
    totalPrice: {
        type: Number,
        required: true,
    },
    dicount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        required: true
    },
    deliveryCharge: {
        type: Number,
        default: 0
    },
    address: {
        type: String,
        required: true
    },
    invoiceDate: {
        type: Date,

    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Request', 'Returned']
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied: {
        type: Boolean,
        default: false
    }
})
const Order = mongoose.model('Order', orderSchema)
module.exports = Order