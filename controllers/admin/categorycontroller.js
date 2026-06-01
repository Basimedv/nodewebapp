const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

const attachProductCounts = async (docs) => {
    const ids = docs.map((d) => d._id);
    const agg = await Product.aggregate([
        { $match: { category: { $in: ids } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const map = Object.fromEntries(agg.map((c) => [String(c._id), c.count]));

    return docs.map((doc) => ({
        ...doc,
        isListed: typeof doc.isListed === 'boolean' ? doc.isListed : true,
        itemsCount: map[String(doc._id)] || 0,
        safeDescription: (doc.description || '').replace(/"/g, '&quot;'),
    }));
};

const categoryinfo = async (req, res) => {
    try {
        let { query = '', page = 1 } = req.query;
        page = Math.max(parseInt(page) || 1, 1);
        const limit = 10;
        const skip = (page - 1) * limit;

        const filter = {};
        if (query) {
            filter.$or = [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
            ];
        }

        const [categoryData, count] = await Promise.all([
            Category.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Category.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(count / limit);

        if (page > totalPages && totalPages > 0) {
            return res.redirect(`/admin/categories?page=${totalPages}&query=${encodeURIComponent(query)}`);
        }

        const normalized = await attachProductCounts(categoryData);

        res.render('admin/categories', {
            cat: normalized,
            currentPage: page,
            totalPages: totalPages || 1,
            totalCategories: count,
            searchQuery: query,
        });
    } catch (error) {
        res.redirect('/admin/pageerror');
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, status } = req.body;

        if (!name?.trim()) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({ error: 'Name is required' });
        }

        const existing = await Category.findOne({
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        });
        if (existing) {
            return res.status(HTTP_STATUS_CODES.CONFLICT).json({ error: 'Category already exists' });
        }

        await new Category({
            name: name.trim(),
            isListed: String(status).toLowerCase() === 'active',
        }).save();

        return res.status(HTTP_STATUS_CODES.CREATED).json({ message: 'Category added successfully' });
    } catch (error) {
        console.error('addCategory error:', error);
        return res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
    }
};
const editCategory = async (req, res) => {
    try {
        const { orgName, editName, editStatus } = req.body;

        if (!orgName || !editName?.trim()) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({ error: 'Name is required' });
        }

        const category = await Category.findOne({ name: orgName });
        if (!category) {
            return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({ error: 'Category not found' });
        }

        const duplicate = await Category.findOne({
            name: { $regex: new RegExp(`^${editName.trim()}$`, 'i') },
            _id: { $ne: category._id },
        });
        if (duplicate) {
            return res.status(HTTP_STATUS_CODES.CONFLICT).json({ nameError: 'Name already exists.' });
        }

        category.name = editName.trim();
        category.isListed = String(editStatus).toLowerCase() === 'active';
        await category.save();

        return res.status(HTTP_STATUS_CODES.OK).json({ message: 'Category updated successfully.' });
    } catch (error) {
        console.error('editCategory error:', error);
        return res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: 'Server error.' });
    }
};
const toggleCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(HTTP_STATUS_CODES.NOT_FOUND).json({ error: 'Category not found' });
        }

        category.isListed = !category.isListed;
        await category.save();

        return res.status(HTTP_STATUS_CODES.OK).json({
            message: `Category ${category.isListed ? 'listed' : 'unlisted'} successfully.`,
            isListed: category.isListed,
        });
    } catch (error) {
        return res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: 'Server error.' });
    }
};

module.exports = {
    categoryinfo,
    addCategory,
    editCategory,
    toggleCategory
};