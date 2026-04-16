const HTTP_STATUS_CODES = require('../../constants/status_codes');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');


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

const getAddAddress = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);
        res.render('user/addAddress', { user });
    } catch (error) {
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).send("Error loading page");
    }
};


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


const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;


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

const postEditAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId, name, phone, landMark, city, state, pinCode, addressType } = req.body;

        
        if (!name || !/^[a-zA-Z\s]{3,50}$/.test(name.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid name.' });
        }
        if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid phone number.' });
        }
        if (!landMark || !landMark.trim()) {
            return res.status(400).json({ success: false, message: 'Landmark is required.' });
        }
        if (!city || !city.trim()) {
            return res.status(400).json({ success: false, message: 'City is required.' });
        }
        if (!state || !state.trim()) {
            return res.status(400).json({ success: false, message: 'State is required.' });
        }
        if (!pinCode || !/^\d{6}$/.test(pinCode.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid pincode.' });
        }


        await Address.updateOne(
            { userId, "address._id": addressId },
            {
                $set: {
                    "address.$": {
                        _id: addressId,
                        name: name.trim(),
                        phone: phone.trim(),
                        landMark: landMark.trim(),
                        city: city.trim(),
                        state: state.trim(),
                        pinCode: pinCode.trim(),
                        addressType: addressType || 'Home'
                    }
                }
            }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Edit Address Error:", error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

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