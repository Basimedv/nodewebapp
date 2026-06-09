const Offer    = require('../../models/offerSchema');
const HTTP_STATUS_CODES = require('../../constants/status_codes');

const addOffer = async (req, res) => {
    try {
        const {
            offerName,
            offerType,
            targetId,
            discountPercentage,
            startDate,
            endDate
        } = req.body;

        // Validate
        if (!offerName?.trim() || !offerType || !targetId ||
            !discountPercentage || !startDate || !endDate) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (new Date(startDate) >= new Date(endDate)) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        const disc = Number(discountPercentage);
        if (!disc || disc < 1 || disc > 90) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Discount must be between 1 and 90'
            });
        }

        // ✅ Remove any existing active offer for this target (upsert behavior)
        await Offer.deleteMany({ offerType, targetId, isActive: true });

        await new Offer({
            offerName:          offerName.trim(),
            offerType,
            targetId,
            discountPercentage: disc,
            startDate,
            endDate,
            isActive: true
        }).save();

        res.status(HTTP_STATUS_CODES.CREATED).json({
            success: true,
            message: 'Offer added successfully'
        });

    } catch (error) {
        console.error('addOffer error:', error);
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

const removeOfferByTarget = async (req, res) => {
    try {
        const { targetId, offerType } = req.body;

        if (!targetId || !offerType) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'targetId and offerType are required'
            });
        }

        // ✅ Remove all offers for this target, active or expired
        await Offer.deleteMany({ targetId, offerType });

        res.status(HTTP_STATUS_CODES.OK).json({
            success: true,
            message: 'Offer removed successfully'
        });

    } catch (error) {
        console.error('removeOfferByTarget error:', error);
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Something went wrong'
        });
    }
};

module.exports = { addOffer, removeOfferByTarget };