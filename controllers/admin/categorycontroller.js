const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

const categoryinfo = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = 10;
        const skip = (page - 1) * limit;

        // Filters
        const visibility = (req.query.visibility || 'all').trim(); // 'all' | 'true' | 'false'
        const query = (req.query.query || '').trim();

        const filter = {};
        if (visibility === 'true') {
            filter.$or = [ { isListed: false }, { visibility: false } ];
        } else if (visibility === 'false') {
            filter.$or = [ { isListed: true }, { visibility: true } ];
        }
        if (query) {
            const regex = new RegExp(query, 'i');
            filter.$and = (filter.$and || []);
            filter.$and.push({ $or: [ { name: regex }, { description: regex } ] });
        }

        const [categoryData, totalCategories] = await Promise.all([
            Category.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Category.countDocuments(filter),
        ]);

        // Normalize and compute item counts for the current page
        const ids = (categoryData || []).map(d => d._id);
        const countsAgg = await Product.aggregate([
            { $match: { category: { $in: ids } } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        const countsMap = Object.fromEntries(countsAgg.map(c => [String(c._id), c.count]));
        const normalized = (categoryData || []).map(doc => ({
            ...doc,
            isListed: typeof doc.isListed === 'boolean' ? doc.isListed : (typeof doc.visibility === 'boolean' ? doc.visibility : true),
            itemsCount: countsMap[String(doc._id)] || 0,
        }));

        const totalPages = Math.max(Math.ceil(totalCategories / limit), 1);

        res.render("admin/category", {
            cat: normalized,
            currentPage: page,
            totalPages,
            totalCategories,
            selectedFilter: visibility === 'true' ? 'true' : (visibility === 'false' ? 'false' : 'all'),
            searchQuery: query,
        });

    } catch (error) {
        console.error(error);
        res.redirect('/pageerror');
    }
};


const addCategory = async (req, res) => {
    const { name, description, status } = req.body;

    try {
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        // Map status string from UI to boolean isListed field in schema
        const isListed = String(status).toLowerCase() === 'active';
        const newCategory = new Category({ name, description, isListed });
        await newCategory.save();

        return res.status(201).json({ message: "Category added successfully" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
const editCategory = async (req,res)=>{
    try {
        const {orgName , editName , editDescription , editStatus} = req.body;
         const category = await Category.findOne({name : orgName});
         if(!category){
            return res.status(400).json({error : "Category not found"})
         }

         const existingCategory = await Category.findOne({name : editName});
         if(existingCategory && existingCategory._id.toString() !== category._id.toString()){

            return res.status(400).json({nameError : "Name already exists ."})
         }

         category.name = editName;
         category.description = editDescription;
         category.isListed = editStatus?.toLowerCase() === "active" ? true : false ;

         await category.save();

         return res.status(200).json({message : "Category added successfully ."});
    } catch (error) {
        console.log("Add Category error : ",error);
        return res.status(500).json({error : "Some error occured in the server ."});
    }
};

const getCategories = async (req, res) => {
    try {
        const visibilityQuery = req.query.visibility; // "true" or "false"
        let filter = {};

        if (visibilityQuery === 'true') {
            filter = { $or: [ { isListed: true }, { visibility: true } ] };
        } else if (visibilityQuery === 'false') {
            filter = { $or: [ { isListed: false }, { visibility: false } ] };
        }

        const found = await Category.find(filter).sort({ createdAt: -1 }).lean();
        // Compute item counts for filtered set
        const ids = (found || []).map(d => d._id);
        const countsAgg = await Product.aggregate([
            { $match: { category: { $in: ids } } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        const countsMap = Object.fromEntries(countsAgg.map(c => [String(c._id), c.count]));
        const normalized = (found || []).map(doc => ({
            ...doc,
            isListed: typeof doc.isListed === 'boolean' ? doc.isListed : (typeof doc.visibility === 'boolean' ? doc.visibility : true),
            itemsCount: countsMap[String(doc._id)] || 0,
        }));

        res.render('admin/category', {
            cat: normalized,
            currentPage: 1,
            totalPages: 1,
            // maintain the selected filter in UI (map visibility -> selectedFilter)
            selectedFilter: visibilityQuery === 'true' ? 'true' : (visibilityQuery === 'false' ? 'false' : 'all'),
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    categoryinfo,
    addCategory,
    editCategory,
    getCategories,
};






