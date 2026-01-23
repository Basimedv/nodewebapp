const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const loadOffersPage = async (req, res) => {
  try {
    const [categories, products] = await Promise.all([
      Category.find().sort({ createdAt: -1 }).lean(),
      Product.find().populate('category').sort({ createdAt: -1 }).lean()
    ]);

    res.render("admin/offers", { categories, products });
  } catch (err) {
    console.error("loadOffersPage:", err);
    res.status(500).send("Server error");
  }
};

const updateCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    let { offerPercentage } = req.body;
    offerPercentage = Number(offerPercentage) || 0;

    console.log('🔧 Updating category offer:', { id, offerPercentage });

    if (offerPercentage < 0 || offerPercentage > 100) {
      return res.status(400).json({ 
        success: false, 
        error: "Offer percentage must be between 0 and 100" 
      });
    }

    // Check if category exists first
    const category = await Category.findById(id);
    if (!category) {
      console.log('❌ Category not found:', id);
      return res.status(404).json({ 
        success: false, 
        error: "Category not found" 
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, { categoryOffer: offerPercentage }, { new: true });
    console.log('✅ Category offer updated successfully:', updatedCategory);

    return res.json({
      success: true,
      message: offerPercentage > 0 
        ? `Category offer set to ${offerPercentage}%` 
        : "Category offer removed"
    });
  } catch (err) {
    console.error("updateCategoryOffer:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

const updateProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    let { offerPercentage } = req.body;
    offerPercentage = Number(offerPercentage) || 0;

    if (offerPercentage < 0 || offerPercentage > 100) {
      return res.status(400).json({ 
        success: false, 
        error: "Offer percentage must be between 0 and 100" 
      });
    }

    await Product.findByIdAndUpdate(id, { productOffer: offerPercentage });

    return res.json({
      success: true,
      message: offerPercentage > 0 
        ? `Product offer set to ${offerPercentage}%` 
        : "Product offer removed"
    });
  } catch (err) {
    console.error("updateProductOffer:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

const testCategory = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Testing category ID:', id);
    
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
        categoryId: id
      });
    }
    
    return res.json({
      success: true,
      category: {
        id: category._id,
        name: category.name,
        categoryOffer: category.categoryOffer
      }
    });
  } catch (err) {
    console.error('testCategory error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  loadOffersPage,
  updateCategoryOffer,
  updateProductOffer,
  testCategory,
};