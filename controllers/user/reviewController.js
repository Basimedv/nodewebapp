const Review = require('../../models/reviewSchema');
const Order  = require('../../models/orderSchema');

const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.productId;
    const userId    = req.session.user._id;
    const userName  = req.session.user.fullName || req.session.user.name;

    // ✅ 'userId' matches your orderSchema field name
    const eligibleOrder = await Order.findOne({
      userId: userId,
      status: 'Delivered',
      'orderedItems.product': productId,
    });

    if (!eligibleOrder) {
      return res.status(403).json({
        success: false,
        message: 'You can only review products from delivered orders.',
      });
    }

    const existing = await Review.findOne({ product: productId, user: userId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You have already reviewed this product.',
      });
    }

    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5.',
      });
    }
    if (!comment || comment.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Comment must be at least 5 characters.',
      });
    }

    await Review.create({
      product:  productId,
      user:     userId,
      userName,
      rating:   ratingNum,
      comment:  comment.trim(),
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully!',
    });

  } catch (err) {
    console.error('addReview error:', err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.',
    });
  }
};

module.exports = { addReview };