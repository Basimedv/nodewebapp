const Brand = require('../../models/brandSchema');

// GET /admin/brands
const brandInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const brands = await Brand.find({})
      .sort({ createAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalBrands = await Brand.countDocuments();
    const totalPages = Math.ceil(totalBrands / limit) || 1;

    // Map schema fields to view expectations
    const viewBrands = (brands || []).map((b) => ({
      name: b.brandName,
      description: '-',
      visibility: !b.isBlocked,
      createdAt: b.createAt,
      image: b.brandImage || null,
    }));

    res.render('admin/brands', {
      brands: viewBrands,
      currentPage: page,
      totalPages,
      totalBrands,
    });
  } catch (error) {
    console.error('brandInfo error:', error);
    res.redirect('/pageerror');
  }
};

// POST /admin/brands
const addBrand = async (req, res) => {
  try {
    const { name, status, brandImage } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    const existing = await Brand.findOne({ brandName: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Brand already exists' });
    }

    const brand = new Brand({
      brandName: name.trim(),
      brandImage: brandImage || null,
      isBlocked: String(status).toLowerCase() === 'active' ? false : true,
    });
    await brand.save();

    return res.status(201).json({ message: 'Brand added successfully' });
  } catch (error) {
    console.error('addBrand error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// PUT /admin/brands
const editBrand = async (req, res) => {
  try {
    const { orgName, editBrandName, editBrandStatus, editBrandImage } = req.body;

    if (!orgName) {
      return res.status(400).json({ message: 'Original brand name is required' });
    }

    const brand = await Brand.findOne({ brandName: orgName });
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    if (editBrandName && editBrandName !== orgName) {
      const dup = await Brand.findOne({ brandName: editBrandName });
      if (dup && String(dup._id) !== String(brand._id)) {
        return res.status(400).json({ message: 'Brand name already exists' });
      }
      brand.brandName = editBrandName;
    }

    if (typeof editBrandStatus !== 'undefined') {
      brand.isBlocked = String(editBrandStatus).toLowerCase() === 'active' ? false : true;
    }

    if (typeof editBrandImage !== 'undefined') {
      brand.brandImage = editBrandImage;
    }

    await brand.save();
    return res.status(200).json({ message: 'Brand updated successfully' });
  } catch (error) {
    console.error('editBrand error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// PUT /admin/brands/block
const blockBrand = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Brand name is required' });

    const brand = await Brand.findOneAndUpdate(
      { brandName: name },
      { $set: { isBlocked: true } },
      { new: true }
    );

    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    return res.status(200).json({ message: 'Brand blocked successfully' });
  } catch (error) {
    console.error('blockBrand error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// PUT /admin/brands/unblock
const unblockBrand = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Brand name is required' });

    const brand = await Brand.findOneAndUpdate(
      { brandName: name },
      { $set: { isBlocked: false } },
      { new: true }
    );

    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    return res.status(200).json({ message: 'Brand unblocked successfully' });
  } catch (error) {
    console.error('unblockBrand error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// DELETE /admin/brands
const deleteBrand = async (req, res) => {
  try {
    // Accept name in body or query for flexibility
    const name = (req.body && req.body.name) || req.query.name;
    if (!name) return res.status(400).json({ message: 'Brand name is required' });

    const result = await Brand.deleteOne({ brandName: name });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    return res.status(200).json({ message: 'Brand deleted successfully' });
  } catch (error) {
    console.error('deleteBrand error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  brandInfo,
  addBrand,
  editBrand,
  blockBrand,
  unblockBrand,
  deleteBrand,
};
