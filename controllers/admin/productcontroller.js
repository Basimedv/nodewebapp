const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { cloudinary } = require('../../config/cloudinary');
const mongoose = require('mongoose');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

const extractPublicId = (imageUrl) => {
  if (!imageUrl) return null;
  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  return match ? match[1] : null;
};


const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const search = req.query.search || '';


    const query = search ? {
      $or: [
        { productName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const [products, categories, total] = await Promise.all([
      Product.find(query)
        .populate('category')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Category.find({ isListed: true }).lean(),
      Product.countDocuments(query)
    ]);

    res.render('admin/products', {
      products,
      cat: categories,
      currentPage: page,
      totalPages: Math.ceil(total/limit),
      totalProducts: total,
      count: products.length,
      search,
      product: null
    });
  } catch (error) {
    console.error('getProducts error:', error);
    res.redirect('/admin/dashboard?error=load_failed');
  }
};


const getAddProductPage = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true }).lean();
    res.render('admin/product-add', {
      cat: categories,
      product: {},
      products: [],
      search: '',
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      count: 0
    });
  } catch (error) {
    console.error('getAddProductPage error:', error);
    res.redirect('/admin/products?error=form_error');
  }
};


const getEditProductPage = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .lean();

    if (!product) return res.redirect('/admin/products?error=not_found');

    const categories = await Category.find({ isListed: true }).lean();


    product.images = product.productImage || [];

    res.render('admin/product-edit', {
      product,
      cat: categories,
      search: '',
      currentPage: 1,
      totalPages: 1,
      totalProducts: 1,
      count: 1,
      products: [product]
    });
  } catch (error) {
    console.error('getEditProductPage error:', error);
    res.redirect('/admin/products?error=not_found');
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
    console.error('getProductById error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
  }
};

const createProduct = async (req, res) => {
  try {
    const { productName, description, category, regularPrice, salePrice, status } = req.body;

    // Validate required fields
    if (!productName?.trim()) {
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
    if (!req.files || req.files.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one image is required'
      });
    }

    const regPrice = parseFloat(regularPrice);
    if (isNaN(regPrice) || regPrice <= 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Valid regular price is required'
      });
    }

    const salPrice = parseFloat(salePrice) || 0;
    if (salPrice > 0 && salPrice >= regPrice) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Sale price must be less than regular price'
      });
    }

    // Check duplicate name
    const existing = await Product.findOne({
      productName: new RegExp(`^${productName.trim()}$`, 'i')
    });
    if (existing) {
      return res.status(HTTP_STATUS_CODES.CONFLICT).json({
        success: false,
        message: 'Product name already exists'
      });
    }

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
      regularPrice: regPrice,
      salePrice: salPrice,
      stock,
      size: sizeArray,
      productImage: req.files.map(file => file.path),
      status: status || 'Available',
      isBlocked: false
    });

    await product.save();

    res.status(HTTP_STATUS_CODES.CREATED).json({
      success: true,
      message: 'Product created successfully'
    });

  } catch (error) {
    console.error('createProduct error:', error);
    if (error.code === 11000) {
      return res.status(HTTP_STATUS_CODES.CONFLICT).json({
        success: false,
        message: 'Product name already exists'
      });
    }
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create product'
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      description,
      category,
      regularPrice,
      salePrice,
      status,
      removedImages,
      existingImages
    } = req.body;

   
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
        message: 'Valid regular price is required'
      });
    }

    const salPrice = parseFloat(salePrice) || 0;
    if (salPrice > 0 && salPrice >= regPrice) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'Sale price must be less than regular price'
      });
    }


    const stock = {
      S:   Math.max(0, parseInt(req.body.stock_S)   || 0),
      M:   Math.max(0, parseInt(req.body.stock_M)   || 0),
      L:   Math.max(0, parseInt(req.body.stock_L)   || 0),
      XL:  Math.max(0, parseInt(req.body.stock_XL)  || 0),
      XXL: Math.max(0, parseInt(req.body.stock_XXL) || 0)
    };

    // Build size array from stock
    const availableSizes = Object.entries(stock)
      .filter(([, qty]) => qty > 0)
      .map(([size]) => size);

    if (availableSizes.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one size must have stock greater than 0'
      });
    }

    const removed = removedImages ? JSON.parse(removedImages) : [];
    for (const url of removed) {
      const publicId = extractPublicId(url);
      if (publicId) await cloudinary.uploader.destroy(publicId);
    }

   
    const currentImages = existingImages ? JSON.parse(existingImages) : [];
    const newImages = req.files ? req.files.map(f => f.path) : [];
    const finalImages = [...currentImages, ...newImages].slice(0, 3);

    if (finalImages.length === 0) {
      return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

  
    const totalStock = Object.values(stock).reduce((a, b) => a + b, 0);
    let finalStatus = status?.trim() || 'Available';
    if (totalStock === 0) finalStatus = 'Out of Stock';
    if (totalStock > 0 && finalStatus === 'Out of Stock') finalStatus = 'Available';

    await Product.findByIdAndUpdate(
      id,
      {
        productName: productName.trim(),
        description: description?.trim() || '',
        category,
        regularPrice: regPrice,
        salePrice: salPrice,
        stock,
        size: availableSizes,
        productImage: finalImages,
        status: finalStatus
      },
      { new: true, runValidators: true }
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: 'Product updated successfully'
    });

  } catch (error) {
    console.error('updateProduct error:', error);
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

    for (const url of product.productImage) {
      const publicId = extractPublicId(url);
      if (publicId) await cloudinary.uploader.destroy(publicId);
    }

    await product.deleteOne();
    res.status(HTTP_STATUS_CODES.OK).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('deleteProduct error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
  }
};

// ─── TOGGLE BLOCK ───────────────────────────────────────────────
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
    console.error('toggleBlock error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
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
    console.error('toggleList error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
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
      isActive: product.isActive
    });
  } catch (error) {
    console.error('toggleProductStatus error:', error);
    res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
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