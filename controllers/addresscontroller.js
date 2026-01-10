const Address = require('../models/addressSchema');

// HTTP Status Codes
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const INTERNAL_SERVER_ERROR = 500;

// Get all addresses for a user
const getAddresses = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const addresses = await Address.find({ userId });
        
        res.status(200).json({
            success: true,
            data: addresses
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(INTERNAL_SERVER_ERROR).json({
            success: false,
            error: 'Failed to fetch addresses'
        });
    }
};

// Add a new address
const addAddress = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { 
            name,
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            country,
            phone,
            isDefault
        } = req.body;

        // Create new address
        const newAddress = new Address({
            userId,
            name,
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            country,
            phone,
            isDefault: Boolean(isDefault)
        });

        // If this is set as default, unset default for other addresses
        if (isDefault) {
            await Address.updateMany(
                { userId, _id: { $ne: newAddress._id } },
                { $set: { isDefault: false } }
            );
        }

        await newAddress.save();

        res.status(201).json({
            success: true,
            message: 'Address added successfully',
            data: newAddress
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(INTERNAL_SERVER_ERROR).json({
            success: false,
            error: 'Failed to add address'
        });
    }
};

// Update an address
const updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id || req.user.id;
        const updates = req.body;

        // If setting as default, unset default for other addresses
        if (updates.isDefault) {
            await Address.updateMany(
                { userId, _id: { $ne: id } },
                { $set: { isDefault: false } }
            );
        }

        const updatedAddress = await Address.findOneAndUpdate(
            { _id: id, userId },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedAddress) {
            return res.status(NOT_FOUND).json({
                success: false,
                error: 'Address not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            data: updatedAddress
        });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(INTERNAL_SERVER_ERROR).json({
            success: false,
            error: 'Failed to update address'
        });
    }
};

// Delete an address
const deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id || req.user.id;

        const deletedAddress = await Address.findOneAndDelete({ _id: id, userId });

        if (!deletedAddress) {
            return res.status(NOT_FOUND).json({
                success: false,
                error: 'Address not found'
            });
        }

        // If deleted address was default, set another as default
        if (deletedAddress.isDefault) {
            const anotherAddress = await Address.findOne({ userId });
            if (anotherAddress) {
                anotherAddress.isDefault = true;
                await anotherAddress.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Address deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(INTERNAL_SERVER_ERROR).json({
            success: false,
            error: 'Failed to delete address'
        });
    }
};

module.exports = {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress
};
