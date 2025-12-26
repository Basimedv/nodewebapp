const mongoose = require('mongoose');
const { Schema } = mongoose;

const reviewSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },

    userName: {
        type: String,
        required: true
    },

    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },

    comment: {
        type: String,
        required: true
    },
}, { timestamps: true });

module.exports = mongoose.model("Review", reviewSchema);
