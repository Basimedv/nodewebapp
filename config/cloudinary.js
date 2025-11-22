// config/cloudinary.js
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 60000, // 60 seconds timeout
  secure: true
});

// Test connection (optional - useful for debugging)
const testConnection = async () => {
  try {

    const result = await cloudinary.api.ping();
  
    return true;
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error.message);
    return false;
  }
};

// // Log configuration (without secrets)
// console.log('☁️ Cloudinary Config:');
// console.log('   Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✓' : '✗');
// console.log('   API Key:', process.env.CLOUDINARY_API_KEY ? '✓' : '✗');
// console.log('   API Secret:', process.env.CLOUDINARY_API_SECRET ? '✓' : '✗');

// Export cloudinary instance
module.exports = cloudinary;

// Optionally export test function
module.exports.testConnection = testConnection;