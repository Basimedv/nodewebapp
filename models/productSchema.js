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
        productOffer: {
        type: Number,
        default: 0
    },
    // Stock tracking for each size
    stock: {
        S: { type: Number, default: 0 },
        M: { type: Number, default: 0 },
        L: { type: Number, default: 0 },
        XL: { type: Number, default: 0 },
        XXL: { type: Number, default: 0 }
    },
    // Available sizes array (auto-populated from stock)
  size: {
        type: [String],
        enum: ['S', 'M', 'L', 'XL', 'XXL'],
        required: true
    },
    // Total quantity (sum of all size stocks)
   
  
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
    }
}, { timestamps: true });


const Product = mongoose.model('Product', productSchema);
module.exports = Product;