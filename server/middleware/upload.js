const multer = require('multer');
const httpError = require('../utils/httpError');

const storage = multer.memoryStorage();
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(httpError(415, 'UNSUPPORTED_IMAGE', 'Upload a JPG, PNG, or WebP image.'));
    }
    callback(null, true);
  },
});

module.exports = imageUpload;
