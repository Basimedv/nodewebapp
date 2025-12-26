const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {            
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },

    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },

    regularPrice: {           
        type: Number,
        required: true
    },

    salePrice: {
        type: Number,
        required: true
    },

    productOffer: {
        type: Number,
        default: 0
    },

    stock: {
        S: { type: Number, default: 0 },
        M: { type: Number, default: 0 },
        L: { type: Number, default: 0 },
        XL: { type: Number, default: 0 },
        XXL: { type: Number, default: 0 }
    },

    size: {
        type: [String],
        enum: ['S', 'M', 'L', 'XL', 'XXL'],
        required: true
    },

    productImage: {           
        type: [String],
        required: true
    },

    isBlocked: {
        type: Boolean,
        default: false
    },

    status: {
        type: String,
        enum: ["Available", "Out of Stock", "Discontinued"],
        default: "Available"
    },

    // ✅ ADD THIS PART
    reviews: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Review"
        }
    ]

}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
