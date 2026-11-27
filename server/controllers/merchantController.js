const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const httpError = require('../utils/httpError');
const { batchCache, invalidateBatchCache } = require('../utils/cache');

const ALLERGENS = ['None / Allergen-Free', 'Shrimp / Seafood', 'Peanuts / Tree Nuts', 'Dairy', 'Eggs', 'Gluten / Wheat', 'Pork (Non-Halal)'];

function uploadStorefront(buffer) {
  return new Promise((resolve, reject) => cloudinary.uploader.upload_stream(
    { folder: 'salbar-kain/storefronts', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
    (error, result) => {
      if (error) {
        console.error('Storefront upload failed:', { httpCode: Number(error.http_code) || undefined });
        return reject(httpError(503, 'STOREFRONT_UPLOAD_FAILED', 'Storefront photo upload failed. Check Cloudinary settings and try again.'));
      }
      resolve(result);
    },
  ).end(buffer));
}

function profileFields(user) {
  return {
    id: user._id.toString(), role: user.role, name: user.name, email: user.email,
    storeName: user.storeName, category: user.category, address: user.address,
    barangay: user.barangay, municipality: user.municipality,
    location: user.location, storefrontPhotoUrl: user.storefrontPhotoUrl || '',
    contactNumber: user.contactNumber || user.phone || '',
    defaultClosingTime: user.defaultClosingTime || '20:30',
    pickupInstructions: user.pickupInstructions || '',
    defaultAllergens: Array.isArray(user.defaultAllergens) && user.defaultAllergens.length ? user.defaultAllergens : ['None / Allergen-Free'],
    verificationStatus: user.verified ? 'verified' : (user.verificationStatus || 'pending'),
    verifiedBy: user.verifiedBy ? { name: user.verifiedBy.name, municipality: user.verifiedBy.assignedMunicipality } : null,
    verificationDocUrl: user.verificationDocPublicId && user.verificationDocFormat
      ? cloudinary.utils.private_download_url(user.verificationDocPublicId, user.verificationDocFormat, {
        resource_type: 'raw', type: 'private', expires_at: Math.floor(Date.now() / 1000) + 300,
      }) : '',
  };
}

async function getMerchantProfile(req, res) {
  const user = await User.findOne({ _id: req.user.id, role: 'merchant' })
    .select('+verificationDocPublicId +verificationDocFormat')
    .populate('verifiedBy', 'name assignedMunicipality')
    .lean();
  if (!user) throw httpError(404, 'MERCHANT_NOT_FOUND', 'Merchant account was not found.');
  let profile;
  try { profile = profileFields(user); } catch { throw httpError(503, 'DOCUMENT_UNAVAILABLE', 'The permit link could not be created right now.'); }
  res.set('Cache-Control', 'no-store').json({ success: true, data: { profile } });
}

async function updateMerchantProfile(req, res) {
  const user = await User.findOne({ _id: req.user.id, role: 'merchant' }).select('+storefrontPhotoPublicId');
  if (!user) throw httpError(404, 'MERCHANT_NOT_FOUND', 'Merchant account was not found.');

  const update = {};
  if (req.body.contactNumber !== undefined) {
    if (typeof req.body.contactNumber !== 'string' || req.body.contactNumber.trim().length > 24) throw httpError(400, 'INVALID_CONTACT_NUMBER', 'Enter a contact number up to 24 characters.');
    update.contactNumber = req.body.contactNumber.trim();
  }
  if (req.body.defaultClosingTime !== undefined) {
    if (typeof req.body.defaultClosingTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(req.body.defaultClosingTime)) throw httpError(400, 'INVALID_CLOSING_TIME', 'Choose a valid closing time in HH:MM format.');
    update.defaultClosingTime = req.body.defaultClosingTime;
  }
  if (req.body.pickupInstructions !== undefined) {
    if (typeof req.body.pickupInstructions !== 'string' || req.body.pickupInstructions.trim().length > 240) throw httpError(400, 'INVALID_PICKUP_INSTRUCTIONS', 'Pickup instructions must be 240 characters or fewer.');
    update.pickupInstructions = req.body.pickupInstructions.trim();
  }
  if (req.body.defaultAllergens !== undefined) {
    let allergens = req.body.defaultAllergens;
    if (typeof allergens === 'string') { try { allergens = JSON.parse(allergens); } catch { allergens = null; } }
    if (!Array.isArray(allergens) || allergens.length < 1 || allergens.length > ALLERGENS.length || allergens.some(tag => !ALLERGENS.includes(tag)) || new Set(allergens).size !== allergens.length || (allergens.includes('None / Allergen-Free') && allergens.length !== 1)) {
      throw httpError(400, 'INVALID_DEFAULT_ALLERGENS', 'Choose valid default allergen tags. Allergen-free cannot be combined with other tags.');
    }
    update.defaultAllergens = allergens;
  }

  const cloudConfig = cloudinary.config();
  if (req.file && ![cloudConfig.cloud_name, cloudConfig.api_key, cloudConfig.api_secret].every(value => typeof value === 'string' && value.trim())) {
    throw httpError(503, 'UPLOAD_NOT_CONFIGURED', 'Cloudinary is not configured on this server.');
  }
  const uploaded = req.file ? await uploadStorefront(req.file.buffer) : null;
  const oldPublicId = user.storefrontPhotoPublicId;
  if (uploaded) {
    update.storefrontPhotoUrl = uploaded.secure_url;
    update.storefrontPhotoPublicId = uploaded.public_id;
  }
  try {
    Object.assign(user, update);
    await user.save();
  } catch (error) {
    if (uploaded?.public_id) await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: 'image' }).catch(() => {});
    throw error;
  }
  if (uploaded && oldPublicId) await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'image' }).catch(() => {});
  batchCache.flushAll();
  invalidateBatchCache();
  const refreshed = await User.findById(user._id).select('+verificationDocPublicId +verificationDocFormat').populate('verifiedBy', 'name assignedMunicipality').lean();
  let profile;
  try { profile = profileFields(refreshed); } catch { throw httpError(503, 'DOCUMENT_UNAVAILABLE', 'The permit link could not be created right now.'); }
  res.set('Cache-Control', 'no-store').json({ success: true, data: { profile } });
}

async function merchantRecognition(req, res) {
  const merchantId = req.user.id;
  const [rescues, batches] = await Promise.all([
    Claim.countDocuments({ merchantId, status: 'completed' }),
    Batch.countDocuments({ merchantId, status: 'active', remainingQty: { $gt: 0 }, expiresAt: { $gt: new Date() } }),
  ]);
  res.json({ success: true, data: { completedRescues: rescues, activeBatches: batches } });
}

function publicReview(review) {
  return {
    id: review._id.toString(),
    buyerFirstName: (review.buyerName || 'Food saver').trim().split(/\s+/)[0],
    itemName: review.batchId?.itemName || 'Food rescue',
    rating: review.rating,
    reviewComment: review.reviewComment || '',
    reviewedAt: review.reviewedAt,
  };
}

async function getMerchantReviews(req, res) {
  const merchant = await User.findOne({ _id: req.user.id, role: 'merchant' }).select('averageRating totalReviews').lean();
  if (!merchant) throw httpError(404, 'MERCHANT_NOT_FOUND', 'Merchant account was not found.');
  const reviews = await Claim.find({ merchantId: req.user.id, status: 'completed', rating: { $gte: 1, $lte: 5 } })
    .select('buyerName rating reviewComment reviewedAt batchId')
    .populate('batchId', 'itemName')
    .sort({ reviewedAt: -1 }).limit(100).lean();
  res.set('Cache-Control', 'no-store').json({ success: true, data: {
    averageRating: Number(merchant.averageRating) || 0,
    totalReviews: Number(merchant.totalReviews) || 0,
    reviews: reviews.map(publicReview),
  } });
}

async function getPublicMerchantReviews(req, res) {
  if (!mongoose.isValidObjectId(req.params.merchantId)) throw httpError(404, 'MERCHANT_NOT_FOUND', 'Food partner was not found.');
  const merchant = await User.findOne({ _id: req.params.merchantId, role: 'merchant', $or: [{ verificationStatus: 'verified' }, { verified: true }] })
    .select('averageRating totalReviews').lean();
  if (!merchant) throw httpError(404, 'MERCHANT_NOT_FOUND', 'Food partner was not found.');
  const reviews = await Claim.find({ merchantId: merchant._id, status: 'completed', rating: { $gte: 1, $lte: 5 } })
    .select('buyerName rating reviewComment reviewedAt batchId')
    .populate('batchId', 'itemName')
    .sort({ reviewedAt: -1 }).limit(2).lean();
  res.set('Cache-Control', 'no-store').json({ success: true, data: {
    averageRating: Number(merchant.averageRating) || 0,
    totalReviews: Number(merchant.totalReviews) || 0,
    reviews: reviews.map(publicReview),
  } });
}

module.exports = { getMerchantProfile, updateMerchantProfile, merchantRecognition, getMerchantReviews, getPublicMerchantReviews };
