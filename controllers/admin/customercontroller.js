

const User = require('../../models/userSchema');

// 🟢 Get customer list
const customerinfo = async (req, res) => {
    try {
        // 🔎 Get search value
        const search = req.query.query || "";

        // 🔎 Get filter (Active / Blocked)
        const isBlocked = req.query.isBlocked;

        // 📄 Get page number
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        // 🛠️ Build filter object
        let filter = { isAdmin: false };
        if (isBlocked === "true") filter.isBlocked = true;
        if (isBlocked === "false") filter.isBlocked = false;

        // Add search conditions
        if (search) {
            filter.$or = [
                { fullName: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ];
        }

        // Fetch customers with pagination
        const customers = await User.find(filter)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        // Count total
        const count = await User.countDocuments(filter);

        // Total pages
        const totalPages = Math.ceil(count / limit);

        // ✅ Pass data to EJS
        res.render("admin/customers", {
            title: "Customers",
            customers,              // 🔄 made plural for consistency
            selectedFilter: isBlocked || "all",
            totalPages,
            currentPage: page,
            searchQuery: search,
            errorMessage: ""
        });
    } catch (error) {
        console.error("❌ Error in customerinfo:", error);
        res.redirect("/pageerror");
    }
};

// 🟢 Block / Unblock user
const userBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const { isBlocked } = req.body;
        if (!id) return res.status(400).json({ error: "User ID missing" });
        const user = await User.findByIdAndUpdate(id, { isBlocked }, { new: true });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, user });
    } catch (error) {
        console.log("Error updating status:", error);
        res.status(500).json({ error: "Server error" });
    }
};


// 🟢 Filter customers by blocked status
const filterCustomers = async (req, res) => {
    try {
        const { isBlocked } = req.query;
        let filter = {};

        if (isBlocked === "true") filter.isBlocked = true;
        else if (isBlocked === "false") filter.isBlocked = false;

        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        const customers = await User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCustomers = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalCustomers / limit);

        res.render("admin/customers", {
            title: "Customers",
            errorMessage: "",
            customers,             // ✅ same plural key
            currentPage: page,
            totalPages,
            selectedFilter: isBlocked !== undefined ? isBlocked : "all",
            searchQuery: ""
        });
    } catch (error) {
        console.log("Filter error:", error);
        res.status(500).json({ error: "Unexpected error occurred" });
    }
};

module.exports = {
    customerinfo,
     userBlock, 
     filterCustomers,
}
