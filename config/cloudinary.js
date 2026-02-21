const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 1. Profile Storage (Square crop for avatars)
const profileStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'user_profiles',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 400, height: 400, crop: 'fill' }] 
    },
});



const uploadProfile = multer({ storage: profileStorage });


module.exports = { cloudinary, uploadProfile};