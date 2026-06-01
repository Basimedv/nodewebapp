const Review = require('../../models/reviewSchema');

const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.productId;
    const userId = req.session.user._id;
const userName = req.session.user.fullName

    // Check if user already reviewed this product
    const existing = await Review.findOne({ product: productId, user: userId });
    if (existing) {
      return res.redirect(`/productDetails/${productId}?error=already_reviewed`);
    }

    await Review.create({
      product: productId,
      user: userId,
      userName,
      rating: Number(rating),
      comment,
    });

    res.redirect(`/productDetails/${productId}?success=review_added`);
  } catch (err) {
    console.error('Add review error:', err);
    res.redirect(`/productDetails/${req.params.productId}?error=failed`);
  }
};

module.exports = { addReview };