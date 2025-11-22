const mongoose = require('mongoose');
const env = require('dotenv').config();

const connectdb = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      // Connection timeout settings
      serverSelectionTimeoutMS: 10000, // 10 seconds to select a server
      socketTimeoutMS: 45000, // 45 seconds for socket timeout
      connectTimeoutMS: 10000, // 10 seconds for initial connection
      
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 5,
      
      // Retry settings
      retryWrites: true,
      retryReads: true,
      
      // Other recommended settings
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ MongoDB connected successfully');
   
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('🔍 Full error:', error);
    process.exit(1);
  }
};

// Handle connection events


mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:', err);
});



// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🛑 Mongoose connection closed through app termination');
  process.exit(0);
});

module.exports = connectdb;