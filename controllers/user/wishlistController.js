const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');

const HTTP_STATUS_CODES = require('../../constants/status_codes');

// ── GET WISHLIST PAGE ──────────────────────────────────────────
const getWishlistPage = async (req, res) => {
  try {
    const userId = req.session.user._id;

    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.ProductId',
        populate: { path: 'category', select: 'name' }
      })
      .lean();

    const products = (wishlist?.products || [])
      .filter(p => p.ProductId) // remove deleted products
      .map(p => {
        const product = p.ProductId;
        const regular = Number(product.regularPrice || 0);
        const sale    = Number(product.salePrice || 0);
        const finalPrice = sale > 0 && sale < regular ? sale : regular;
        const totalStock = Object.values(product.stock || {})
          .reduce((a, b) => a + (parseInt(b) || 0), 0);

        return {
          ...product,
          finalPrice,
          isOnSale: sale > 0 && sale < regular,
          discountPercent: sale > 0 && sale < regular
            ? Math.round((regular - sale) / regular * 100)
            : 0,
          totalStock,
          images: product.productImage || []
        };
      });

    res.render('user/wishlist', {
      user: req.session.user,
      products,
      title: 'My Wishlist'
    });
  } catch (error) {
    console.error('getWishlistPage error:', error);
    res.redirect('/pageNotFound');
  }
};

// ── ADD / REMOVE FROM WISHLIST (toggle) ────────────────────────
const addToWishlist = async (req, res) => {
  try {
    const userId    = req.session.user?._id;
    const { productId } = req.body;

    if (!userId) {
      return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({
        success: false,
        message: 'Please login to continue'
      });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      // create new wishlist
      wishlist = new Wishlist({
        userId,
        products: [{ ProductId: productId }]
      });
      await wishlist.save();
      return res.status(HTTP_STATUS_CODES.OK).json({
        success: true,
        message: 'Added to wishlist',
        action: 'added'
      });
    }

    // check if already in wishlist
    const index = wishlist.products.findIndex(
      p => p.ProductId.toString() === productId.toString()
    );

    if (index > -1) {
      // remove from wishlist
      wishlist.products.splice(index, 1);
      await wishlist.save();
      return res.status(HTTP_STATUS_CODES.OK).json({
        success: true,
        message: 'Removed from wishlist',
        action: 'removed'
      });
    } else {
      // add to wishlist
      wishlist.products.push({ ProductId: productId });
      await wishlist.save();
      return res.status(HTTP_STATUS_CODES.OK).json({
        success: true,
        message: 'Added to wishlist',
        action: 'added'
      });
    }

  } catch (error) {
    console.error('addToWishlist error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Something went wrong'
    });
  }
};

// ── REMOVE FROM WISHLIST ───────────────────────────────────────
const removeFromWishlist = async (req, res) => {
  try {
    const userId    = req.session.user._id;
    const { productId } = req.body;

    await Wishlist.findOneAndUpdate(
      { userId },
      { $pull: { products: { ProductId: productId } } }
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: 'Removed from wishlist'
    });
  } catch (error) {
    console.error('removeFromWishlist error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Something went wrong'
    });
  }
};

// ── MOVE TO CART ───────────────────────────────────────────────
const moveToCart = async (req, res) => {
  try {
    const userId            = req.session.user._id;
    const { productId, size } = req.body;

    if (!size) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Please select a size'
      });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check stock for selected size
    const stockForSize = product.stock?.[size] || 0;
    if (stockForSize < 1) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: `Size ${size} is out of stock`
      });
    }

    // Calculate price
    const regular    = Number(product.regularPrice || 0);
    const sale       = Number(product.salePrice || 0);
    const finalPrice = sale > 0 && sale < regular ? sale : regular;

    // Add to cart
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({
        userId,
        items: [{
          productId,
          quantity:   1,
          size,
          price:      finalPrice,
          totalPrice: finalPrice
        }]
      });
    } else {
      // Check if same product + size already in cart
      const existingIndex = cart.items.findIndex(
        item => item.productId.toString() === productId.toString()
              && item.size === size
      );

      if (existingIndex > -1) {
        // Increase quantity
        const newQty = cart.items[existingIndex].quantity + 1;
        if (newQty > stockForSize) {
          return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
            success: false,
            message: `Only ${stockForSize} items available in size ${size}`
          });
        }
        cart.items[existingIndex].quantity   = newQty;
        cart.items[existingIndex].totalPrice = finalPrice * newQty;
      } else {
        cart.items.push({
          productId,
          quantity:   1,
          size,
          price:      finalPrice,
          totalPrice: finalPrice
        });
      }
    }

    await cart.save();

    // Remove from wishlist after moving to cart
    await Wishlist.findOneAndUpdate(
      { userId },
      { $pull: { products: { ProductId: productId } } }
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: 'Moved to cart successfully'
    });

  } catch (error) {
    console.error('moveToCart error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Something went wrong'
    });
  }
};

module.exports = {
  getWishlistPage,
  addToWishlist,
  removeFromWishlist,
  moveToCart
};