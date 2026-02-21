const HTTP_STATUS_CODES = require('../../constants/status_codes');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');

// 1. GET: Main Address Management Page
const getAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const addressDoc = await Address.findOne({ userId });
        const addresses = addressDoc ? addressDoc.address : [];

        res.render('user/manageAddresses', { user, addresses });
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).send("Internal Server Error");
    }
};

// 2. GET: Render Add Address Page
const getAddAddress = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);
        res.render('user/addAddress', { user });
    } catch (error) {
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error loading page");
    }
};

// 3. GET: Render Edit Address Page
const getEditAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.query.id;
        
        const user = await User.findById(userId);
        const addressDoc = await Address.findOne({ userId });
        const address = addressDoc.address.find(item => item._id.toString() === addressId);

        if (!address) return res.redirect('/address');

        res.render('user/editAddress', { user, address });
    } catch (error) {
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error loading page");
    }
};

// 4. POST: Save New Address
const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        
        // Destructuring helps ensure we are getting exactly what we need
        const { name, phone, landMark, city, state, pinCode, addressType } = req.body;

        const addressDoc = await Address.findOne({ userId });

        const newAddressData = {
            name,
            phone,
            landMark,
            city,
            state,
            pinCode,
            addressType: addressType || 'Home'
        };

        if (addressDoc) {
            await Address.updateOne(
                { userId },
                { $push: { address: newAddressData } }
            );
        } else {
            const newAddressDoc = new Address({
                userId,
                address: [newAddressData]
            });
            await newAddressDoc.save();
        }
        res.status(HTTP_STATUS_CODES.OK).json({ success: true });
    } catch (error) {
        console.error("Add Address Error:", error);
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to save address" });
    }
};

// 5. POST: Update Existing Address
const postEditAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId, name, phone, landMark, city, state, pinCode, addressType } = req.body;

        await Address.updateOne(
            { userId, "address._id": addressId },
            { 
                $set: { 
                    "address.$": {
                        _id: addressId, // Keep the same ID
                        name,
                        phone,
                        landMark,
                        city,
                        state,
                        pinCode,
                        addressType
                    } 
                } 
            }
        );
        res.status(HTTP_STATUS_CODES.OK).json({ success: true });
    } catch (error) {
        console.error("Edit Address Error:", error);
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
    }
};

// 6. DELETE: Delete Address (Added this for your delete button)
const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        await Address.updateOne(
            { userId },
            { $pull: { address: { _id: addressId } } }
        );

        res.json({ success: true });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false });
    }
};

module.exports = {
    getAddress,
    getAddAddress,
    getEditAddress,
    postAddAddress,
    postEditAddress,
    deleteAddress
};