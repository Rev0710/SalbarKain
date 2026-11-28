const https = require('node:https');
const cloudinary = require('../config/cloudinary');

function hasCloudinaryCredentials() {
  const config = cloudinary.config();
  return [config.cloud_name, config.api_key, config.api_secret].every((value) => typeof value === 'string' && value.trim());
}

function uploadToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: folder || 'salbar-kain/uploads', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
      (error, result) => error ? reject(error) : resolve(result?.secure_url),
    ).end(file.buffer);
  });
}

function uploadToImgBb(file) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ image: file.buffer.toString('base64') }).toString();
    const request = https.request({
      hostname: 'api.imgbb.com', path: `/1/upload?key=${encodeURIComponent(process.env.IMGBB_API_KEY)}`,
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, timeout: 20000,
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        try {
          const payload = JSON.parse(raw);
          if (response.statusCode >= 200 && response.statusCode < 300 && payload?.success && typeof payload.data?.url === 'string') resolve(payload.data.url);
          else reject(new Error('ImgBB upload failed'));
        } catch { reject(new Error('ImgBB returned an invalid response')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('ImgBB request timed out')));
    request.on('error', reject);
    request.end(body);
  });
}

async function uploadImageBuffer(file, options = {}) {
  if (!file?.buffer?.length || typeof file.mimetype !== 'string' || !file.mimetype.startsWith('image/')) {
    throw new TypeError('uploadImageBuffer requires an image file held in memory.');
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    throw new TypeError('Upload a JPG, PNG, or WebP image.');
  }

  if (hasCloudinaryCredentials()) {
    try {
      const url = await uploadToCloudinary(file, options.folder);
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, 'https://');
    } catch (error) {
      console.warn('Cloud image upload unavailable; trying the next configured image store.', { code: error?.http_code || error?.code || 'UPLOAD_FAILED' });
    }
  }

  if (process.env.IMGBB_API_KEY?.trim()) {
    try {
      const url = await uploadToImgBb(file);
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, 'https://');
    } catch (error) {
      console.warn('ImgBB image upload unavailable; using database image fallback.', { code: error?.code || 'UPLOAD_FAILED' });
    }
  }

  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

module.exports = { uploadImageBuffer };
