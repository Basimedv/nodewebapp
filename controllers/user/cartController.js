// controllers/user/cartController.js
const Cart    = require('../../models/cartSchema');
const Product = require('../../models/productSchema');

// ── GET CART PAGE ────────────────────────────────────────────────
const getCart = async (req, res) => {
    try {
        const userId = req.session.user?._id;

        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.render('user/cart', { cartItems: [], subtotal: 0 });
        }

        const cartItems = cart.items.map(item => {
            const product = item.productId;
            return {
                _id:         item._id,
                productId:   product._id,
                productName: product.productName,
               image: product.productImage?.[0] || '/images/placeholder.png',
                size:        item.size,
                quantity:    item.quantity,
                price:       item.price,
                totalPrice:  item.price * item.quantity,
                stock:       product.stock?.[item.size] || 0
            };
        });

        const subtotal = cartItems.reduce((sum, i) => sum + i.totalPrice, 0);
        res.render('user/cart', { cartItems, subtotal });

    } catch (error) {
        console.error('getCart error:', error);
        res.redirect('/pageNotFound');
    }
};

// ── ADD TO CART ──────────────────────────────────────────────────
const addToCart = async (req, res) => {
    try {
        const userId                    = req.session.user?._id;
        const { productId, size, quantity = 1 } = req.body;

        if (!productId || !size) {
            return res.status(400).json({ success: false, message: 'Product and size are required' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Check stock for selected size
        const sizeStock = product.stock?.[size] || 0;
        if (sizeStock < 1) {
            return res.status(400).json({ success: false, message: `Size ${size} is out of stock` });
        }
        if (quantity > sizeStock) {
            return res.status(400).json({ success: false, message: `Only ${sizeStock} left in size ${size}` });
        }

      // ✅ Already correct — just double check this line exists
const price = (product.salePrice > 0 && product.salePrice < product.regularPrice)
                ? product.salePrice
                : product.regularPrice;
        const totalPrice = price * quantity;

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({
                userId,
                items: [{ productId, size, quantity, price, totalPrice }]
            });
            await cart.save();
            return res.status(200).json({ success: true, message: 'Added to cart' });
        }

        // Check if same product + size already exists
        const existingIndex = cart.items.findIndex(
            item => item.productId.toString() === productId && item.size === size
        );

        if (existingIndex > -1) {
            const newQty = cart.items[existingIndex].quantity + Number(quantity);
            if (newQty > 10) {
                return res.status(400).json({ success: false, message: 'Maximum 10 per item allowed' });
            }
            if (newQty > sizeStock) {
                return res.status(400).json({ success: false, message: `Only ${sizeStock} available in size ${size}` });
            }
            cart.items[existingIndex].quantity   = newQty;
            cart.items[existingIndex].totalPrice = price * newQty;
        } else {
            cart.items.push({ productId, size, quantity, price, totalPrice });
        }

        await cart.save();
        return res.status(200).json({ success: true, message: 'Added to cart' });

    } catch (error) {
        console.error('addToCart error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
};

// ── UPDATE QUANTITY ──────────────────────────────────────────────
const updateQuantity = async (req, res) => {
    try {
        const userId              = req.session.user?._id;
        const { itemId, quantity } = req.body;

        if (quantity < 1 || quantity > 10) {
            return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 10' });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const item = cart.items.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        // Check stock
        const stock = item.productId.stock?.[item.size] || 0;
        if (quantity > stock) {
            return res.status(400).json({ success: false, message: `Only ${stock} available in size ${item.size}` });
        }

        item.quantity   = quantity;
        item.totalPrice = item.price * quantity;
        await cart.save();

        const cartSubtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

        res.status(200).json({
            success:       true,
            itemTotal:     item.totalPrice,
            cartSubtotal
        });

    } catch (error) {
        console.error('updateQuantity error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
};

// ── REMOVE FROM CART ─────────────────────────────────────────────
const removeFromCart = async (req, res) => {
    try {
        const userId     = req.session.user?._id;
        const { itemId } = req.body;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        cart.items = cart.items.filter(item => item._id.toString() !== itemId);
        await cart.save();

        const cartSubtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

        res.status(200).json({ success: true, message: 'Item removed', cartSubtotal });

    } catch (error) {
        console.error('removeFromCart error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
};

module.exports = { getCart, addToCart, updateQuantity, removeFromCart };