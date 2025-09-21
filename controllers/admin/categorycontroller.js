const Category = require('../../models/categorySchema');

const categoryinfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);

        // ✅ FIX: point to views/admin/category.ejs
        res.render("admin/category", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
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

        const newCategory = new Category({ name, description, status });
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
         category.visibility = editStatus?.toLowerCase() === "active" ? true : false ;

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

        if (visibilityQuery === 'true') filter.isListed = true;
        else if (visibilityQuery === 'false') filter.isListed = false;

        const cat = await Category.find(filter).lean();

        res.render('admin/category', {
            cat,
            currentPage: 1,
            totalPages: 1
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






