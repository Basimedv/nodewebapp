const { ROUTES } = require('../../constants/routes');
const User = require('../../models/userSchema');

const customerinfo = async (req, res) => {
    try {
        let { query = "", isBlocked, page = 1} = req.query;

        page = Math.max(parseInt(page) || 1, 1);

        const limit = 5;
        const skip = (page - 1) * limit;

      

        const filter = { isAdmin: false};
           
       

        if (isBlocked === "true") filter.isBlocked = true;
        else if (isBlocked === "false") filter.isBlocked = false;

        if (query) {
            filter.$or = [
                { fullName: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } }
            ];
        }
       

        const [customers, count] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .select("-password"),
            User.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(count / limit);

        if (page > totalPages && totalPages > 0) {
            return res.redirect(`/admin/customers?page=${totalPages}`);
        }

        res.render("admin/customers", {
            title: "Customers",
            customers,
            selectedFilter: isBlocked || "all",
            totalPages,
            currentPage: page,
            searchQuery: query,
            path: "/admin/customers",
            errorMessage: ""
        });

    } catch (error) {
        console.error("Error in customerinfo:", error);
        res.redirect(ROUTES.ADMIN.PAGE_ERROR);
    }
};

const userBlock = async (req, res) => {
    try {
        const { id } = req.params;
        const { isBlocked } = req.body;

        if (!id) return res.status(400).json({ error: "User ID missing" });

        const user = await User.findByIdAndUpdate(id, { isBlocked }, { new: true });
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({ success: true, user });
    } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = { customerinfo, userBlock };