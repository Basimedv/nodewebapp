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
      productNmae: name,
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
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getProductAddPage,
  createProduct,
  // new handlers are exported below
};

// --- Additional Admin Product Controls ---
// PUT /admin/products/:id/block   body: { isBlocked: true|false }
async function toggleBlock(req, res){
  try{
    const { id } = req.params;
    const { isBlocked } = req.body;
    const doc = await Product.findByIdAndUpdate(id, { isBlocked: !!isBlocked }, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Updated', isBlocked: doc.isBlocked });
  }catch(err){
    console.error('toggleBlock error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// PUT /admin/products/:id/list   body: { list: true|false }
// Uses status field to emulate list/unlist: unlist => Discountinued, list => Available
async function toggleList(req, res){
  try{
    const { id } = req.params;
    const { list } = req.body; // boolean
    const status = (String(list) === 'true' || list === true) ? 'Available' : 'Discountinued';
    const doc = await Product.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Updated', status: doc.status });
  }catch(err){
    console.error('toggleList error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// GET /admin/products/:id
async function getOne(req, res){
  try{
    const { id } = req.params;
    const doc = await Product.findById(id).lean();
    if (!doc) return res.status(404).json({ message: 'Product not found' });
    return res.json(doc);
  }catch(err){
    console.error('getOne error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// PUT /admin/products/:id  (basic fields, no images here)
async function updateOne(req, res){
  try{
    const { id } = req.params;
    const { name, description, brand, category, price, salePrice, quantity, color, status } = req.body;
    const update = {
      productNmae: name,
      description,
      brand,
      category,
      reqularPrice: Number(price),
      salePrice: Number(salePrice),
      quantity: Number(quantity),
      color,
      status,
    };
    const doc = await Product.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Updated', id: doc._id });
  }catch(err){
    console.error('updateOne error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Append exports
module.exports.toggleBlock = toggleBlock;
module.exports.toggleList = toggleList;                            
module.exports.getOne = getOne;
module.exports.updateOne = updateOne;
/**
 * PUT /admin/products/:id/images
 * Replace (or optionally append) images for a product
 * Uses same processing as createProduct: converts to webp and stores under /public/uploads/products
 * If query ?append=true is provided, new images are appended; otherwise replaces existing images
 */
async function updateImages(req, res){
  try{
    const { id } = req.params;
    const append = String(req.query.append || 'false') === 'true';

    // Ensure product exists
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Prepare output dir
    const outDir = path.join(process.cwd(), 'public', 'uploads', 'products');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ message: 'No images uploaded' });

    const savedImagePaths = [];
    for (let i = 0; i < files.length; i++){
      const f = files[i];
      const fileName = `prod_${Date.now()}_${i}.webp`;
      const destPath = path.join(outDir, fileName);
      const sharpInput = f.buffer ? f.buffer : (f.path ? f.path : null);
      if (!sharpInput) continue;
      await sharp(sharpInput)
        .resize(1000, 1000, { fit: 'inside' })
        .toFormat('webp')
        .toFile(destPath);
      if (f.path){ try{ fs.unlinkSync(f.path); }catch(e){} }
      savedImagePaths.push(`/uploads/products/${fileName}`);
    }

    let newImages = savedImagePaths;
    if (append) newImages = [...(product.productImage || []), ...savedImagePaths];

    product.productImage = newImages;
    await product.save();

    return res.json({ message: 'Images updated', images: product.productImage });
  }catch(err){
    console.error('updateImages error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports.updateImages = updateImages;
