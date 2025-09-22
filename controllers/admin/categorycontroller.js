const Category = require('../../models/categorySchema');

const categoryinfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const filter = req.query.filter || '';

        // Build query object
        let query = {};
        
        // Add search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Add filter functionality
        if (filter === 'active') {
            query.isListed = true;
        } else if (filter === 'inactive') {
            query.isListed = false;
        }

        const categoryData = await Category.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        // Add itemsCount to each category (you can implement this based on your product schema)
        const categoriesWithCount = categoryData.map(category => ({
            ...category.toObject(),
            itemsCount: 0 // TODO: Implement actual count from products
        }));

        res.render("admin/category", {
            cat: categoriesWithCount,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            searchQuery: search,
            filterValue: filter
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

        const newCategory = new Category({ 
            name, 
            description, 
            isListed: status?.toLowerCase() === "active" ? true : false
        });
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

         return res.status(200).json({message : "Category updated successfully ."});
    } catch (error) {
        console.log("Edit Category error : ",error);
        return res.status(500).json({error : "Some error occured in the server ."});
    }
};

module.exports = {
    categoryinfo,
    addCategory,
    editCategory,
};






