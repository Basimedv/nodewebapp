const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { cloudinary } = require('../../config/cloudinary');
const mongoose = require('mongoose');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

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
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    const [products, categories, total] = await Promise.all([
      Product.find(query)
        .populate('category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Category.find({ isListed: true }).lean(),
      Product.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('admin/products', {
      products,
      cat: categories,
      currentPage: page,
      totalPages,
      totalProducts: total,
      count: products.length,
      search,
      product: null
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.redirect('/admin/dashboard?error=failed_to_load_products');
  }
};

const getAddProductPage = async (req, res) => {
  try {
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
    const [product, categories] = await Promise.all([
      Product.findById(req.params.id)
        .populate('category')
        .lean(),
      Category.find({ isListed: true }).lean()
    ]);

    if (!product) {
      return res.redirect('/admin/products?error=product_not_found');
    }

    product.images = product.productImage || [];

    res.render('admin/product-edit', {
      cat: categories,
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
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.status(HTTP_STATUS_CODES.OK).json({ success: true, product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

const createProduct = async (req, res) => {
  try {
    const { productName, description, category, regularPrice, status } = req.body;

    // Validate required fields
    if (!productName || !productName.trim()) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Product name is required'
      });
    }

    if (!category) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Category is required'
      });
    }

    if (!regularPrice || parseFloat(regularPrice) <= 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Valid price is required'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // Check duplicate product name
    const existing = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') }
    }).lean();

    if (existing) {
      return res.status(HTTP_STATUS_CODES.CONFLICT).json({
        success: false,
        message: 'A product with this name already exists'
      });
    }

    // Parse stock
    const stock = {
      S:   parseInt(req.body.stock_S)   || 0,
      M:   parseInt(req.body.stock_M)   || 0,
      L:   parseInt(req.body.stock_L)   || 0,
      XL:  parseInt(req.body.stock_XL)  || 0,
      XXL: parseInt(req.body.stock_XXL) || 0
    };

    // Parse size array
    let sizeArray = [];
    try {
      sizeArray = JSON.parse(req.body.size || '[]');
    } catch (e) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Invalid size data'
      });
    }

    if (sizeArray.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one size must have stock'
      });
    }

    const product = new Product({
      productName: productName.trim(),
      description: description?.trim() || '',
      category,
      regularPrice: parseFloat(regularPrice),
      stock,
      size: sizeArray,
      productImage: req.files.map(file => file.path),
      status: status || 'Available',
      isBlocked: false
    });

    await product.save();

    res.status(HTTP_STATUS_CODES.CREATED).json({
      success: true,
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Create product error:', error);

    if (error.code === 11000) {
      return res.status(HTTP_STATUS_CODES.CONFLICT).json({
        success: false,
        message: 'A product with this name already exists'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: error.message
      });
    }

    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    const {
      productName,
      description,
      category,
      regularPrice,
      status,
      existingImages,
      removedImages
    } = req.body;

    // Validate required fields
    if (!productName?.trim() || !category) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Product name and category are required'
      });
    }

    const regPrice = parseFloat(regularPrice);
    if (isNaN(regPrice) || regPrice <= 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Invalid price value'
      });
    }

    // Parse stock
    const stock = {
      S:   Math.max(0, parseInt(req.body.stock_S)   || 0),
      M:   Math.max(0, parseInt(req.body.stock_M)   || 0),
      L:   Math.max(0, parseInt(req.body.stock_L)   || 0),
      XL:  Math.max(0, parseInt(req.body.stock_XL)  || 0),
      XXL: Math.max(0, parseInt(req.body.stock_XXL) || 0)
    };

    const availableSizes = Object.entries(stock)
      .filter(([, qty]) => qty > 0)
      .map(([size]) => size);

    if (availableSizes.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one size must have stock greater than 0'
      });
    }

    // Find product
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check duplicate name (excluding current product)
    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') },
      _id: { $ne: req.params.id }
    }).lean();

    if (existingProduct) {
      return res.status(HTTP_STATUS_CODES.CONFLICT).json({
        success: false,
        message: 'A product with this name already exists'
      });
    }

    // Parse image arrays
    let existingImagesArray = [];
    let removedImagesArray = [];

    try {
      existingImagesArray = existingImages ? JSON.parse(existingImages) : [];
      removedImagesArray  = removedImages  ? JSON.parse(removedImages)  : [];
    } catch (parseError) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Invalid image data format'
      });
    }

    // Delete removed images from cloudinary (non-blocking)
    if (removedImagesArray.length > 0) {
      setImmediate(async () => {
        for (const imageUrl of removedImagesArray) {
          try {
            const publicId = extractPublicId(imageUrl);
            if (publicId) await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error('Image delete failed:', err.message);
          }
        }
      });
    }

    // Build final images array
    let finalImages = [...existingImagesArray];
    if (req.files && req.files.length > 0) {
      finalImages = [...finalImages, ...req.files.map(file => file.path)];
    }
    finalImages = finalImages.slice(0, 3);

    if (finalImages.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // Determine final status
    const totalStock = Object.values(stock).reduce((sum, qty) => sum + qty, 0);
    let finalStatus;
    if (totalStock === 0) {
      finalStatus = 'Out of Stock';
    } else if (status && status.trim()) {
      finalStatus = status.trim() === 'Out of Stock' && totalStock > 0
        ? 'Available'
        : status.trim();
    } else {
      finalStatus = totalStock > 0 ? 'Available' : 'Out of Stock';
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        productName: productName.trim(),
        description: description?.trim() || '',
        category,
        regularPrice: regPrice,
        stock,
        size: availableSizes,
        status: finalStatus,
        productImage: finalImages
      },
      { new: true, runValidators: true }
    ).populate('category');

    if (!updatedProduct) {
      return res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to update product'
      });
    }

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Update product error:', error);

    if (error.name === 'CastError') {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: error.message
      });
    }

    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }
const extractPublicId = (imageUrl) => {
    try {
        if (!imageUrl) return null;
        const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
        if (match && match[1]) return match[1];
        return null;
    } catch (error) {
        console.error('extractPublicId error:', error);
        return null;
    }
};
    // Delete images from cloudinary
    for (const imageUrl of product.productImage) {
      try {
        const publicId = extractPublicId(imageUrl);
        if (publicId) await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error('Error deleting image:', err);
      }
    }

    await product.deleteOne();

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

const toggleBlock = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isBlocked = !product.isBlocked;
    await product.save();

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      isBlocked: product.isBlocked
    });
  } catch (error) {
    console.error('Toggle block error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error toggling block status'
    });
  }
};

const toggleList = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.status = product.status === 'Available' ? 'Discontinued' : 'Available';
    await product.save();

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: `Product ${product.status === 'Available' ? 'listed' : 'unlisted'} successfully`,
      status: product.status
    });
  } catch (error) {
    console.error('Toggle list error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error toggling list status'
    });
  }
};

const toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isActive = !product.isActive;
    await product.save();

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: product.isActive
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error toggling product status'
    });
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