// middlewares/profileMulter.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary Storage for Profile Images
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'colinguest/profiles', // Separate folder for profile images
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [
      { 
        width: 500, 
        height: 500, 
        crop: 'fill', // Crop to square for profile pictures
        gravity: 'face', // Focus on face if detected
        quality: 'auto:good',
        fetch_format: 'auto' // Automatically choose best format
      }
    ],
    public_id: (req, file) => {
      // Use user ID for consistent profile image naming
      const userId = req.session.user?._id || req.session.user || 'temp';
      const timestamp = Date.now();
      return `profile-${userId}-${timestamp}`;
    }
  }
});

// File filter for profile images
const profileFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/webp',
    'image/gif'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP and GIF images are allowed.'), false);
  }
};

// Create multer upload instance for profile images
const uploadProfile = multer({
  storage: profileStorage,
  fileFilter: profileFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for profile images
    files: 1 // Only one profile image at a time
  }
});

// Error handling middleware
const handleProfileMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Profile image too large. Maximum size is 5MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'You can only upload one profile image at a time.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field in file upload.'
      });
    }
    
    // Other multer errors
    return res.status(400).json({
      success: false,
      message: 'Error uploading file: ' + err.message
    });
  } else if (err) {
    // Custom errors (like file type validation)
    return res.status(400).json({
      success: false,
      message: err.message || 'Error uploading profile image.'
    });
  }
  next();
};

module.exports = uploadProfile;
module.exports.handleProfileMulterError = handleProfileMulterError;