const Coupon = require('../../models/couponSchema');

const couponinfo=async(req,res)=>{ 
    try {
        const coupons = await Coupon.find()
            .populate('usedBy', 'name email') // Populate user details
            .sort({ createdAt: -1 });
        res.render("admin/coupons", { coupons });
    } catch (error) {
        console.error("❌ Error in couponinfo:", error);
        res.redirect("/pageerror");
    }
}; 

const addCoupon = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      discountType,
      discountValue,
      minimumPurchase,
      maxDiscount,
      startDate,
      expiryDate,
      usageLimit,
      isActive
    } = req.body;

    // Convert boolean strings to actual booleans
    const isActiveBool = isActive === "true";

    // Validations
    if (!name || name.trim() === '') {
      return res.status(400).send("Coupon name is required");
    }

    if (new Date(expiryDate) <= new Date(startDate)) {
      return res.status(400).send("Invalid date range");
    }

    if (discountType === "percentage" && discountValue > 90) {
      return res.status(400).send("Percentage discount too high");
    }

    // Check for existing coupon by name or code
    const existingCoupon = await Coupon.findOne({ 
      $or: [{ code }, { name }] 
    });
    if (existingCoupon) {
      return res.status(400).send("Coupon name or code already exists");
    }

    await Coupon.create({
      name,
      code,
      description,
      discountType,
      discountValue,
      minimumPurchase,
      maxDiscount,
      startDate,
      expiryDate,
      usageLimit,
      isActive: isActiveBool
    });

    return res.redirect("/admin/coupons");

  } catch (error) {
    console.error("❌ Error in addCoupon:", error);
    res.status(500).send("Server error");
  }
};

const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Fetching coupon with ID:', id);
    
    const coupon = await Coupon.findById(id);
    console.log('📄 Found coupon:', coupon);
    
    if (!coupon) {
      console.log('❌ Coupon not found');
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    console.log('✅ Sending coupon data');
    res.json({ success: true, coupon });
  } catch (error) {
    console.error("❌ Error in getCouponById:", error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      description,
      discountType,
      discountValue,
      minimumPurchase,
      maxDiscount,
      startDate,
      expiryDate,
      usageLimit,
      isActive
    } = req.body;

    // Convert boolean strings to actual booleans
    const isActiveBool = isActive === "true";

    // Validations
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: "Coupon name is required" });
    }

    if (new Date(expiryDate) <= new Date(startDate)) {
      return res.status(400).json({ success: false, message: "Invalid date range" });
    }

    if (discountType === "percentage" && discountValue > 90) {
      return res.status(400).json({ success: false, message: "Percentage discount too high" });
    }

    // Check for existing coupon by name or code (excluding current coupon)
    const existingCoupon = await Coupon.findOne({ 
      $or: [{ code }, { name }],
      _id: { $ne: id }
    });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: "Coupon name or code already exists" });
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(id, {
      name,
      code,
      description,
      discountType,
      discountValue,
      minimumPurchase,
      maxDiscount,
      startDate,
      expiryDate,
      usageLimit,
      isActive: isActiveBool
    }, { new: true });

    if (!updatedCoupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    res.json({ success: true, message: 'Coupon updated successfully', coupon: updatedCoupon });
  } catch (error) {
    console.error("❌ Error in updateCoupon:", error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedCoupon = await Coupon.findByIdAndDelete(id);
    
    if (!deletedCoupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error("❌ Error in deleteCoupon:", error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
    couponinfo,
    addCoupon,
    getCouponById,
    updateCoupon,
    deleteCoupon,
};

                                    