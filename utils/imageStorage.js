const multer = require('multer');
const path = require('path');

// Ensure uploads directory path is correct relative to this file
// This will resolve to <project_root>/public/uploads/re-image
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 're-image');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

module.exports = storage;
