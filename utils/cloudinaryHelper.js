// utils/cloudinaryHelper.js
const cloudinary = require('../config/cloudinary');

/**
 * Extract Cloudinary public_id from a Cloudinary URL
 * @param {string} imageUrl - Full Cloudinary image URL
 * @returns {string|null} - Public ID or null if invalid
 * 
 * Example URL: https://res.cloudinary.com/demo/image/upload/v1234567890/colinguest/products/product-123.jpg
 * Returns: colinguest/products/product-123
 */
const extractPublicId = (imageUrl) => {
  try {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1) return null;
    
    // Get everything after 'upload/v123456789/'
    const pathAfterVersion = urlParts.slice(uploadIndex + 2).join('/');
    
    // Remove file extension
    const publicId = pathAfterVersion.replace(/\.[^/.]+$/, '');
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public_id:', error);
    return null;
  }
};

/**
 * Delete a single image from Cloudinary
 * @param {string} imageUrl - Cloudinary image URL
 * @returns {Promise<boolean>} - Success status
 */
const deleteImage = async (imageUrl) => {
  try {
    const publicId = extractPublicId(imageUrl);
    
    if (!publicId) {
      console.error('Invalid image URL:', imageUrl);
      return false;
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      console.log('✅ Image deleted successfully:', publicId);
      return true;
    } else {
      console.warn('⚠️ Image deletion failed:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting image from Cloudinary:', error);
    return false;
  }
};

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} imageUrls - Array of Cloudinary image URLs
 * @returns {Promise<Object>} - Object with success/failed counts
 */
const deleteMultipleImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { success: 0, failed: 0, total: 0 };
  }
  
  let successCount = 0;
  let failedCount = 0;
  
  const deletePromises = imageUrls.map(async (url) => {
    const deleted = await deleteImage(url);
    if (deleted) {
      successCount++;
    } else {
      failedCount++;
    }
  });
  
  await Promise.all(deletePromises);
  
  return {
    success: successCount,
    failed: failedCount,
    total: imageUrls.length
  };
};

/**
 * Upload a single image from buffer/base64
 * @param {Buffer|string} imageData - Image buffer or base64 string
 * @param {Object} options - Upload options
 * @returns {Promise<string|null>} - Cloudinary URL or null
 */
const uploadImage = async (imageData, options = {}) => {
  try {
    const uploadOptions = {
      folder: options.folder || 'colinguest/products',
      transformation: options.transformation || [
        { width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }
      ],
      public_id: options.public_id || undefined,
      ...options
    };
    
    const result = await cloudinary.uploader.upload(imageData, uploadOptions);
    
    console.log('✅ Image uploaded successfully:', result.public_id);
    return result.secure_url;
  } catch (error) {
    console.error('❌ Error uploading image to Cloudinary:', error);
    return null;
  }
};

/**
 * Get image details from Cloudinary
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object|null>} - Image details or null
 */
const getImageDetails = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    console.error('Error getting image details:', error);
    return null;
  }
};

/**
 * Generate a transformation URL for an existing image
 * @param {string} publicId - Cloudinary public_id
 * @param {Object} transformations - Transformation options
 * @returns {string} - Transformed image URL
 */
const getTransformedUrl = (publicId, transformations = {}) => {
  try {
    return cloudinary.url(publicId, {
      transformation: [transformations]
    });
  } catch (error) {
    console.error('Error generating transformed URL:', error);
    return null;
  }
};

/**
 * Cleanup orphaned images (images not in database)
 * This is useful for maintenance tasks
 * @param {string[]} activeImageUrls - Array of URLs currently in database
 * @param {string} folderPath - Cloudinary folder to check
 * @returns {Promise<Object>} - Cleanup results
 */
const cleanupOrphanedImages = async (activeImageUrls, folderPath = 'colinguest/products') => {
  try {
    // Get all images from Cloudinary folder
    const cloudinaryImages = await cloudinary.api.resources({
      type: 'upload',
      prefix: folderPath,
      max_results: 500 // Adjust as needed
    });
    
    const activePublicIds = activeImageUrls.map(url => extractPublicId(url));
    const orphanedImages = cloudinaryImages.resources.filter(
      img => !activePublicIds.includes(img.public_id)
    );
    
    // Delete orphaned images
    const deleteResults = await deleteMultipleImages(
      orphanedImages.map(img => img.secure_url)
    );
    
    return {
      total: cloudinaryImages.resources.length,
      active: activeImageUrls.length,
      orphaned: orphanedImages.length,
      deleted: deleteResults.success,
      failed: deleteResults.failed
    };
  } catch (error) {
    console.error('Error cleaning up orphaned images:', error);
    return null;
  }
};

module.exports = {
  extractPublicId,
  deleteImage,
  deleteMultipleImages,
  uploadImage,
  getImageDetails,
  getTransformedUrl,
  cleanupOrphanedImages
};