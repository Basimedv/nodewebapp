// controllers/admin/categoryOfferController.js
const Category = require('../../models/categorySchema');

// Render the offers page (re-uses your admin look)
const loadOffersPage = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 }).lean();
    // NOTE: our EJS expects `cat` (to match your other pages), so pass `cat`
    res.render("admin/offers", { cat: categories });
  } catch (err) {
    console.error("loadOffersPage:", err);
    res.status(500).send("Server error");
  }
};

// Update offer price (set to >0 to add/set; set to 0 to remove)
const updateCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    let { offerPrice } = req.body;
    offerPrice = Number(offerPrice) || 0;

    await Category.findByIdAndUpdate(id, { offerPrice });

    return res.json({
      success: true,
      message: offerPrice > 0 ? "Offer price set successfully" : "Offer removed successfully"
    });
  } catch (err) {
    console.error("updateCategoryOffer:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  loadOffersPage,
  updateCategoryOffer
};
