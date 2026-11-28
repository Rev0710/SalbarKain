const cloudinary = require('cloudinary').v2;
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
const credentials = [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET];

// Cloudinary is optional. Missing/partial credentials should allow the upload
// utility to use ImgBB or the MongoDB data URL fallback instead of crashing boot.
if (credentials.every(Boolean)) {
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
} else {
  cloudinary.config({ secure: true });
}

module.exports = cloudinary;
