const mongoose = require('mongoose');
const Address = require('../../models/addressSchema');
const User=require('../../models/userSchema');

// HTTP Status Codes
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const INTERNAL_SERVER_ERROR = 500;

const getAddresses = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const addressDocs = await Address.find({ userId });
        
        // Flatten the nested address array with proper field mapping
        const addresses = addressDocs.reduce((acc, doc) => {
            const flatAddresses = doc.address.map((addr, index) => ({
                _id: addr._id || `${doc._id}-${index}`, // Generate unique ID if not present
                addressType: addr.addressType || 'Home',
                name: addr.name || '',
                phone: addr.phone || '',
                addressLine1: addr.landMark || '',
                addressLine2: '',
                city: addr.city || '',
                state: addr.state || '',
                pincode: addr.pinCode || '',
                altPhone: addr.altPhone || ''
            }));
            return acc.concat(flatAddresses);
        }, []);
        
        console.log('🔍 Flattened addresses:', addresses);
        
        // If it's a page request (not an AJAX call), render the page with addresses
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.render('user/manageAddresses', { 
                title: 'Manage Addresses',
                user: req.user,
                addresses: addresses
            });
        }

        // Otherwise, return JSON for API calls
        res.status(200).json(addresses);
    } catch (error) {
        console.error('Error:', error);
        
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.status(INTERNAL_SERVER_ERROR).render('error', {
                message: 'Failed to load page'
            });
        }
        
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
            city,
            state,
            postalCode,
            phone,
            addressType = 'Home',
            altPhone = ''
        } = req.body;

        console.log('🔍 Adding address with data:', req.body);

        // Find or create user's address document
        let userAddress = await Address.findOne({ userId });
        
        const newAddressData = {
            _id: new mongoose.Types.ObjectId(), // Generate unique ID for the address
            addressType,
            name,
            city,
            landMark: addressLine1,
            state,
            pinCode: parseInt(postalCode),
            phone,
            altPhone
        };

        if (!userAddress) {
            // Create new address document with nested address array
            userAddress = new Address({
                userId,
                address: [newAddressData]
            });
        } else {
            // Add new address to existing document's address array
            userAddress.address.push(newAddressData);
        }

        await userAddress.save();

        console.log('🔍 Saved address document:', userAddress);

        // Get the newly added address (last one in the array)
        const newAddress = userAddress.address[userAddress.address.length - 1];

        res.status(201).json({
            success: true,
            message: 'Address added successfully',
            data: {
                _id: newAddress._id,
                addressType: newAddress.addressType,
                name: newAddress.name,
                phone: newAddress.phone,
                addressLine1: newAddress.landMark,
                addressLine2: '',
                city: newAddress.city,
                state: newAddress.state,
                pincode: newAddress.pinCode,
                altPhone: newAddress.altPhone
            }
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

        // Find the user's address document
        const userAddress = await Address.findOne({ userId });
        if (!userAddress) {
            return res.status(NOT_FOUND).json({
                success: false,
                error: 'Address not found'
            });
        }

        // Find the specific address in the array
        const addressIndex = userAddress.address.findIndex(addr => 
            addr._id && addr._id.toString() === id
        );

        if (addressIndex === -1) {
            return res.status(NOT_FOUND).json({
                success: false,
                error: 'Address not found'
            });
        }

        // Update the address fields
        const updateData = {
            ...updates,
            landMark: updates.addressLine1 || updates.landMark,
            pinCode: updates.postalCode || updates.pinCode
        };

        Object.assign(userAddress.address[addressIndex], updateData);
        await userAddress.save();

        const updatedAddress = userAddress.address[addressIndex];

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            data: {
                ...updatedAddress.toObject(),
                addressLine1: updatedAddress.landMark,
                addressLine2: '',
                pincode: updatedAddress.pinCode
            }
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

        // Find the user's address document
        const userAddress = await Address.findOne({ userId });
        if (!userAddress) {
            return res.status(NOT_FOUND).json({
                success: false,
                error: 'Address not found'
            });
        }

        // Find and remove the specific address from the array
        const addressIndex = userAddress.address.findIndex(addr => 
            addr._id && addr._id.toString() === id
        );

        if (addressIndex === -1) {
            return res.status(NOT_FOUND).json({
                success: false,
                error: 'Address not found'
            });
        }

        userAddress.address.splice(addressIndex, 1);
        await userAddress.save();

        // If no addresses left, delete the document
        if (userAddress.address.length === 0) {
            await Address.deleteOne({ userId });
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
