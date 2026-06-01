const HTTP_STATUS_CODES = require('../../constants/status_codes');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');

const getAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const [user, addressDoc] = await Promise.all([
            User.findById(userId),
            Address.findOne({ userId })
        ]);
        res.render('user/manageAddresses', { user, addresses: addressDoc?.address || [] });
    } catch (error) {
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
        const [user, addressDoc] = await Promise.all([
            User.findById(userId),
            Address.findOne({ userId })
        ]);
        
        const address = addressDoc?.address.id(req.query.id);
        if (!address) return res.redirect('/address');

        res.render('user/editAddress', { user, address });
    } catch (error) {
        res.status(500).send("Error loading page");
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const newAddress = { ...req.body, addressType: req.body.addressType || 'Home' };

        await Address.findOneAndUpdate(
            { userId },
            { $push: { address: newAddress } },
            { upsert: true, new: true }
        );
        
        res.status(HTTP_STATUS_CODES.OK).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to save address" });
    }
};

const postEditAddress = async (req, res) => {
    try {
        const { addressId, name, phone, landMark, city, state, pinCode, addressType } = req.body;

      
        if (!name || !phone || !city || !pinCode) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        await Address.updateOne(
            { userId: req.session.user, "address._id": addressId },
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

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

const deleteAddress = async (req, res) => {
    try {
        await Address.updateOne(
            { userId: req.session.user },
            { $pull: { address: { _id: req.params.id } } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
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