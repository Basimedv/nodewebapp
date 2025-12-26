const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
// ❌ REMOVED: const Brand = require('../../models/brandSchema');

const { cloudinary, extractPublicId } = require('../../utils/cloudinaryHelper');
const mongoose = require('mongoose');

const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    const query = search
      ? {
          $or: [
            { productName: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } }, // Brand is now a string
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    // ✅ FIXED: Removed Brand.find() from Promise.all
    const [products, categories, total] = await Promise.all([
      Product.find(query)
        .populate('category')
        // ❌ REMOVED: .populate('brand')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Category.find({ isListed: true }).lean(),
      // ❌ REMOVED: Brand.find({ isBlocked: false }).lean(),
      Product.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    // ✅ FIXED: Removed brand from render
    res.render('admin/products', {
      products,
      cat: categories,
      // ❌ REMOVED: brand: brands,
      currentPage: page,
      totalPages,
      totalProducts: total,
      count: products.length,
      search,
      product: null
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    
    // ✅ FIXED: Better error handling instead of rendering non-existent 'error' view
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: 'Error loading products',
        error: error.message
      });
    }
    
    // Redirect to dashboard with error message
    return res.redirect('/admin/dashboard?error=failed_to_load_products');
  }
};

const getAddProductPage = async (req, res) => {
  try {
    // ✅ FIXED: Only fetch categories, no brands
    const categories = await Category.find({ isListed: true }).lean();

    res.render('admin/product-add', { 
      cat: categories, 
    
      product: null, 
      search: '',
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      count: 0,
      products: []
    });
  } catch (error) {
    console.error('Error loading add product page:', error);
    return res.redirect('/admin/products?error=failed_to_load_form');
  }
};

const getEditProductPage = async (req, res) => {
  try {
    // ✅ FIXED: Removed Brand.find() from Promise.all
    const [product, categories] = await Promise.all([
      Product.findById(req.params.id)
        // ❌ REMOVED: .populate('brand')
        .populate('category')
        .lean(),
      Category.find({ isListed: true }).lean(),
      // ❌ REMOVED: Brand.find({ isBlocked: false }).lean()
    ]);

    if (!product) {
      return res.redirect('/admin/products?error=product_not_found');
    }
    
    product.images = product.productImage || [];

    res.render('admin/product-edit', { 
      cat: categories, 
      // ❌ REMOVED: brand: brands,
      product, 
      search: '',
      currentPage: 1,
      totalPages: 1,
      totalProducts: 1,
      count: 1,
      products: [product]
    });
  } catch (error) {
    console.error('Error loading edit product page:', error);
    return res.redirect('/admin/products?error=failed_to_load_product');
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const { productName, description, category, regularPrice, salePrice, status } = req.body;

    // Parse stock data
    const stock = {
      S: parseInt(req.body.stock_S) || 0,
      M: parseInt(req.body.stock_M) || 0,
      L: parseInt(req.body.stock_L) || 0,
      XL: parseInt(req.body.stock_XL) || 0,
      XXL: parseInt(req.body.stock_XXL) || 0
    };
    
    // Parse size array
    let sizeArray = [];
    try {
      sizeArray = JSON.parse(req.body.size || '[]');
    } catch (e) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid size data' 
      });
    }
    
    // Validate
    if (sizeArray.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one size must have stock' 
      });
    }
    
    // Calculate total
    const totalQuantity = Object.values(stock).reduce((sum, qty) => sum + qty, 0);
    
    // Create product
    const product = new Product({
      productName: productName.trim(),
      description: description?.trim() || '',
      category,
      regularPrice: parseFloat(regularPrice),
      salePrice: parseFloat(salePrice),
      stock,
      size: sizeArray,
      productImage: req.files.map(file => file.path),
      status,
      isBlocked: false
    });
    
    await product.save();
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    console.log('=== UPDATE PRODUCT START ===');
    console.log('Product ID:', req.params.id);
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    const { 
      productName, 
      description, 
      category, 
      regularPrice, 
      salePrice, 
      status,
      existingImages,
      removedImages
    } = req.body;

    // Validate required fields
    if (!productName?.trim() || !description?.trim() || !category) {
      return res.status(400).json({
        success: false,
        message: 'Product name, description, and category are required'
      });
    }

    // Validate prices
    const regPrice = parseFloat(regularPrice);
    const salPrice = parseFloat(salePrice);

    if (isNaN(regPrice) || isNaN(salPrice) || regPrice <= 0 || salPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price values'
      });
    }

    if (salPrice > regPrice) {
      return res.status(400).json({
        success: false,
        message: 'Sale price cannot be greater than regular price'
      });
    }

    // Parse stock
    const stock = {
      S: Math.max(0, parseInt(req.body.stock_S) || 0),
      M: Math.max(0, parseInt(req.body.stock_M) || 0),
      L: Math.max(0, parseInt(req.body.stock_L) || 0),
      XL: Math.max(0, parseInt(req.body.stock_XL) || 0),
      XXL: Math.max(0, parseInt(req.body.stock_XXL) || 0)
    };

    // Calculate available sizes
    const availableSizes = Object.entries(stock)
      .filter(([size, qty]) => qty > 0)
      .map(([size]) => size);

    if (availableSizes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one size must have stock greater than 0'
      });
    }

    // Find product
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Check duplicate name
    const existingProduct = await Product.findOne({ 
      productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') },
      _id: { $ne: req.params.id }
    }).lean();
    
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'A product with this name already exists'
      });
    }

    // Handle images
    let existingImagesArray = [];
    let removedImagesArray = [];
    
    try {
      existingImagesArray = existingImages ? JSON.parse(existingImages) : [];
      removedImagesArray = removedImages ? JSON.parse(removedImages) : [];
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image data format'
      });
    }

    // Delete removed images (async, non-blocking)
    if (removedImagesArray.length > 0) {
      setImmediate(async () => {
        for (const imageUrl of removedImagesArray) {
          try {
            const publicId = extractPublicId(imageUrl);
            if (publicId) {
              await cloudinary.uploader.destroy(publicId);
              console.log('✅ Deleted:', publicId);
            }
          } catch (err) {
            console.error('⚠️ Delete failed:', err.message);
          }
        }
      });
    }

    // Build final images
    let finalImages = [...existingImagesArray];
    if (req.files && req.files.length > 0) {
      finalImages = [...finalImages, ...req.files.map(file => file.path)];
    }
    finalImages = finalImages.slice(0, 4);

    if (finalImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // Determine status
    const totalStock = Object.values(stock).reduce((sum, qty) => sum + qty, 0);
    const finalStatus = totalStock === 0 ? 'Out of Stock' : (status || 'Available');

    // Update data
    const updateData = {
      productName: productName.trim(),
      description: description.trim(),
      category,
      regularPrice: regPrice,
      salePrice: salPrice,
      stock,
      size: availableSizes,
      status: finalStatus,
      productImage: finalImages
    };

    console.log('Updating product...');

    // Perform update
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category');

    if (!updatedProduct) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update product'
      });
    }

    console.log('✅ Product updated successfully');

    res.status(200).json({ 
      success: true, 
      message: 'Product updated successfully', 
      product: updatedProduct 
    });
    
  } catch (error) {
    console.error('❌ Update error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to update product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    for (const imageUrl of product.productImage) {
      try {
        const publicId = extractPublicId(imageUrl);
        if (publicId) await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error('Error deleting image:', err);
      }
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
};

const toggleBlock = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.isBlocked = !product.isBlocked;
    await product.save();

    res.json({ success: true, message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`, isBlocked: product.isBlocked });
  } catch (error) {
    console.error('Error toggling block:', error);
    res.status(500).json({ success: false, message: 'Error toggling block status' });
  }
};

const toggleList = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.status = product.status === 'Available' ? 'Discontinued' : 'Available';
    await product.save();

    res.json({ success: true, message: `Product ${product.status === 'Available' ? 'listed' : 'unlisted'} successfully`, status: product.status });
  } catch (error) {
    console.error('Error toggling list:', error);
    res.status(500).json({ success: false, message: 'Error toggling list status' });
  }
};

const toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.isActive = !product.isActive;
    await product.save();

    res.json({ success: true, message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`, isActive: product.isActive });
  } catch (error) {
    console.error('Error toggling status:', error);
    res.status(500).json({ success: false, message: 'Error toggling product status' });
  }
};

module.exports = {
  getProducts,
  getAddProductPage,
  getEditProductPage,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleBlock,
  toggleList,
  toggleProductStatus
};