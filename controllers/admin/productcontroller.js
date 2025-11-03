const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// GET /admin/products
const getProductAddPage = async (req, res) => {
  try {
    const [category, brand, products] = await Promise.all([
      Category.find({ isListed: true }).lean(),
      Brand.find({ isBlocked: false }).lean(),
      Product.find({}).sort({ createdAt: -1 }).lean(),
    ]);

    return res.render('admin/products', {
      cat: category,
      brand: brand,
      products,
    });
  } catch (error) {
    console.error('getProductAddPage error:', error);
    return res.redirect('/pageerror');
  }
};

// Helper function to process and save images
const processAndSaveImages = async (files, productId) => {
  const imageUrls = [];
  
  // Create product directory if it doesn't exist
  const uploadDir = path.join(__dirname, '../../public/uploads/products', productId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Process each image
  for (const file of files) {
    try {
      // Generate unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `product-${uniqueSuffix}.webp`;
      const filepath = path.join(uploadDir, filename);
      
      // Process image with sharp (resize, convert to webp)
      await sharp(file.path)
        .resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 85 })
        .toFile(filepath);
      
      // Add relative path to the list
      imageUrls.push(`/uploads/products/${productId}/${filename}`);
      
      // Remove temp file
      await fs.promises.unlink(file.path);
    } catch (error) {
      console.error('Error processing image:', error);
      // Continue with other images even if one fails
    }
  }
  
  return imageUrls;
};

// POST /admin/products
const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
      price,
      salePrice,
      quantity,
      color,
      status,
    } = req.body;

    // Basic validation
    if (!name || !description || !brand || !category || price == null || quantity == null) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check for existing product with same name (case insensitive and trimmed)
    const trimmedName = name.trim();
    
    // Process uploaded images
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      // Create a temporary product ID for the upload directory
      const tempProductId = 'temp-' + Date.now();
      imageUrls = await processAndSaveImages(req.files, tempProductId);
      
      if (imageUrls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Failed to process uploaded images. Please try again.'
        });
      }
    }
    
    // First, try to find by exact match (case insensitive)
    let existingProduct = await Product.findOne({
      productNmae: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    // If no exact match, try a more permissive search
    if (!existingProduct) {
      existingProduct = await Product.findOne({
        productNmae: { $regex: trimmedName, $options: 'i' }
      });
    }

    if (existingProduct) {
      console.log('Duplicate product found:', {
        existingName: existingProduct.productNmae,
        newName: trimmedName,
        exactMatch: existingProduct.productNmae.toLowerCase() === trimmedName.toLowerCase()
      });
      
      // For AJAX requests
      const isAjax = req.xhr || 
                    (req.headers['x-requested-with'] === 'XMLHttpRequest') || 
                    (req.headers['accept'] || '').includes('application/json');
      
      if (isAjax) {
        return res.status(400).json({ 
          success: false,
          message: `A product with the name "${trimmedName}" already exists.` 
        });
      }
      
      // For regular form submissions
      req.flash('error', `A product with the name "${trimmedName}" already exists.`);
      
      // Preserve form input for better UX
      req.flash('formData', { 
        name: trimmedName,
        description,
        brand,
        category,
        price,
        salePrice,
        quantity,
        color,
        status
      });
      
      return res.redirect('back');
    }

    // Prepare images directory
    const outDir = path.join(process.cwd(), 'public', 'uploads', 'products');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Process images using sharp (webp) - supports memoryStorage (buffer) and diskStorage (path)
    const files = Array.isArray(req.files) ? req.files : [];
    const savedImagePaths = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fileName = `prod_${Date.now()}_${i}.webp`;
      const destPath = path.join(outDir, fileName);
      const sharpInput = f.buffer ? f.buffer : (f.path ? f.path : null);
      if (!sharpInput) continue;
      await sharp(sharpInput)
        .resize(1000, 1000, { fit: 'inside' })
        .toFormat('webp')
        .toFile(destPath);
      // If disk file exists and not needed anymore, remove it
      if (f.path) {
        try { fs.unlinkSync(f.path); } catch (e) {}
      }
      savedImagePaths.push(`/uploads/products/${fileName}`);
    }

    // Map to your schema field names (note: schema has typos productNmae, reqularPrice)
    const doc = new Product({
      productNmae: name, // Note: This is a typo in the schema (should be productName)
      description,
      brand, // schema expects String brand
      category, // ObjectId string from form
      reqularPrice: Number(price) || 0,
      salePrice: Number(salePrice) || 0,
      quantity: Number(quantity) || 0,
      color: color || '',
      productImage: savedImagePaths,
      status: status || 'Available',
    });

    await doc.save();

    // If AJAX/fetch, return JSON; else redirect
    const isAjax = req.xhr || (req.headers['x-requested-with'] === 'XMLHttpRequest') || (req.headers['accept'] || '').includes('application/json');
    if (isAjax) {
      return res.status(201).json({ message: 'Product created', id: doc._id });
    } else {
      return res.redirect('/admin/products');
    }
  } catch (error) {
    console.error('createProduct error:', error);
    
    // For AJAX requests
    const isAjax = req.xhr || 
                  (req.headers['x-requested-with'] === 'XMLHttpRequest') || 
                  (req.headers['accept'] || '').includes('application/json');
    
    let errorMessage = 'Failed to create product. Please try again.';
    
    // Handle specific error cases
    if (error.name === 'ValidationError') {
      errorMessage = Object.values(error.errors).map(e => e.message).join(' ');
    } else if (error.code === 11000) {
      errorMessage = 'A product with this name already exists.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    if (isAjax) {
      return res.status(500).json({ 
        success: false,
        message: errorMessage 
      });
    }
    
    // For regular form submissions
    req.flash('error', errorMessage);
    req.flash('formData', req.body);
    return res.redirect('back');
  }
};

// --- Additional Admin Product Controls ---
// PUT /admin/products/:id/block   body: { isBlocked: true|false }
async function toggleBlock(req, res) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    product.isBlocked = req.body.isBlocked !== undefined ? req.body.isBlocked : !product.isBlocked;
    await product.save();
    
    return res.json({ 
      success: true, 
      message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      isBlocked: product.isBlocked
    });
  } catch (error) {
    console.error('toggleBlock error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// PUT /admin/products/:id/list   body: { list: true|false }
async function toggleList(req, res) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const shouldList = req.body.list !== undefined ? req.body.list : product.status === 'Discountinued';
    product.status = shouldList ? 'Available' : 'Discountinued';
    await product.save();
    
    return res.json({ 
      success: true, 
      message: `Product ${shouldList ? 'listed' : 'unlisted'} successfully`,
      isListed: shouldList
    });
  } catch (error) {
    console.error('toggleList error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// GET /admin/products/:id
async function getOne(req, res) {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('brand', 'name');
      
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    return res.json({ success: true, product });
  } catch (error) {
    console.error('getOne error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// PUT /admin/products/:id (basic fields, no images here)
async function updateOne(req, res) {
  try {
    const { name, description, brand, category, price, salePrice, quantity, color, status } = req.body;
    
    const updates = {};
    if (name) updates.productNmae = name.trim();
    if (description) updates.description = description;
    if (brand) updates.brand = brand;
    if (category) updates.category = category;
    if (price !== undefined) updates.price = parseFloat(price);
    if (salePrice !== undefined) updates.salePrice = salePrice ? parseFloat(salePrice) : null;
    if (quantity !== undefined) updates.quantity = parseInt(quantity, 10);
    if (color) updates.color = color;
    if (status) updates.status = status;
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    return res.json({ 
      success: true, 
      message: 'Product updated successfully',
      product 
    });
  } catch (error) {
    console.error('updateOne error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A product with this name already exists.'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// PUT /admin/products/:id/images
// Replace (or optionally append) images for a product
// Uses same processing as createProduct: converts to webp and stores under /public/uploads/products
// If query ?append=true is provided, new images are appended; otherwise replaces existing images
async function updateImages(req, res) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images provided' });
    }
    
    // Process new images
    const newImageUrls = await processAndSaveImages(req.files, product._id.toString());
    
    // Update product images
    if (req.query.append === 'true') {
      // Ensure productImage exists and is an array
      product.productImage = Array.isArray(product.productImage) 
        ? [...product.productImage, ...newImageUrls] 
        : [...newImageUrls];
    } else {
      // Remove old images from filesystem
      const oldImageDir = path.join(__dirname, '../../public/uploads/products', product._id.toString());
      if (fs.existsSync(oldImageDir)) {
        fs.rmSync(oldImageDir, { recursive: true, force: true });
      }
      product.productImage = newImageUrls;
    }
    
    await product.save();
    
    return res.json({
      success: true,
      message: 'Product images updated successfully',
      images: product.productImage || []
    });
  } catch (error) {
    console.error('updateImages error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update product images',
      error: error.message 
    });
  }
}

// DELETE /admin/products/:id/images
// Delete specific images from a product
async function deleteImages(req, res) {
  try {
    const { id } = req.params;
    const { images = [], indices = [] } = req.body;

    // Find the product
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // If no images are provided, return error
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No images provided for deletion' 
      });
    }

    // Track successfully deleted images
    const deletedImages = [];
    const errors = [];

    // Process each image for deletion
    for (let i = 0; i < images.length; i++) {
      const imagePath = images[i];
      const index = indices[i];
      
      try {
        // Remove from filesystem
        const fullPath = path.join(__dirname, '../../public', imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
        
        // Remove from product's image array by index
        if (index >= 0 && index < product.productImage.length) {
          product.productImage.splice(index, 1);
        } else {
          // If index is not valid, try to find and remove by URL
          const imgIndex = product.productImage.findIndex(img => img === imagePath);
          if (imgIndex !== -1) {
            product.productImage.splice(imgIndex, 1);
          }
        }
        
        deletedImages.push(imagePath);
      } catch (error) {
        console.error(`Error deleting image ${imagePath}:`, error);
        errors.push({
          image: imagePath,
          error: error.message
        });
      }
    }

    // Save the product with updated image array
    await product.save();

    // Clean up empty directories
    const productImageDir = path.join(__dirname, '../../public/uploads/products', id);
    if (fs.existsSync(productImageDir)) {
      const files = fs.readdirSync(productImageDir);
      if (files.length === 0) {
        fs.rmdirSync(productImageDir);
      }
    }

    return res.json({
      success: true,
      message: 'Images deleted successfully',
      deleted: deletedImages,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('deleteImages error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to delete images',
      error: error.message 
    });
  }
}

module.exports = {
  getProductAddPage,
  createProduct,
  toggleBlock,
  toggleList,
  getOne,
  updateOne,
  updateImages,
  deleteImages
};
