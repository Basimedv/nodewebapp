const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
     name: {  // Coupon Name
        type: String,
        required: true,
        unique: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[A-Z0-9]+$/
    },

    description: {
      type: String,
      trim: true
    },

    discountType: {
      type: String,
      enum: ["flat", "percentage"],
      required: true
    },

    discountValue: {
      type: Number,
      required: true,
      min: [1, "Discount value must be at least 1"]
    },

    minimumPurchase: {
      type: Number,
      required: true,
      min: [0, "Minimum purchase cannot be negative"]
    },

    maxDiscount: {
      type: Number,
      min: 0
    },

    startDate: {
      type: Date,
      default: Date.now
    },

    expiryDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value > this.startDate;
        },
        message: "Expiry date must be after start date"
      }
    },

    isActive: {
      type: Boolean,
      default: true
    },
   

    usageLimit: {
      type: Number,
      default: 1,
      min: [1, "Usage limit must be at least 1"]
    },

    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
