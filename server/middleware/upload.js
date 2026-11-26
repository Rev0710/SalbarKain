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

const kybUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter(_req, file, callback) {
    const allowed = file.fieldname === 'verificationDoc'
      ? ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
      : file.fieldname === 'storefrontPhoto' && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!allowed) return callback(httpError(415, 'UNSUPPORTED_KYB_FILE', 'Upload a PDF, JPG, PNG, or WebP verification document and an optional JPG, PNG, or WebP storefront photo.'));
    callback(null, true);
  },
}).fields([{ name: 'verificationDoc', maxCount: 1 }, { name: 'storefrontPhoto', maxCount: 1 }]);

module.exports = { imageUpload, kybUpload };
