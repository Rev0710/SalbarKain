const cloudinary = require('../config/cloudinary');
const { uploadImageBuffer } = require('../utils/uploadImage');
const mongoose = require('mongoose');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const httpError = require('../utils/httpError');
const { batchCache, invalidateBatchCache } = require('../utils/cache');

const ALLERGENS = ['None / Allergen-Free', 'Shrimp / Seafood', 'Peanuts / Tree Nuts', 'Dairy', 'Eggs', 'Gluten / Wheat', 'Pork (Non-Halal)'];
const ILOILO_MUNICIPALITIES = ['Iloilo City', 'Pavia', 'Santa Barbara', 'Oton', 'Leganes', 'Zarraga', 'Cabatuan', 'Pototan', 'Passi City', 'Miagao', 'Tubungan', 'Other Iloilo Municipality'];

function cleanProfilePart(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim();
  return !cleaned || /^unspecified$/i.test(cleaned) ? '' : cleaned;
}

function profileFields(user) {
  const municipality = cleanProfilePart(user.municipality);
  return {
    id: user._id.toString(), role: user.role, name: user.name, email: user.email,
    storeName: user.storeName, organizationName: user.role === 'merchant' ? user.storeName : user.organizationName,
    category: user.category, address: cleanProfilePart(user.address),
    barangay: cleanProfilePart(user.barangay), municipality: !municipality || /^iloilo province$/i.test(municipality) ? 'Iloilo City' : municipality,
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
      }) : user.verificationDocDataUrl || '',
  };
}

async function getMerchantProfile(req, res) {
  const user = await User.findOne({ _id: req.user.id, role: 'merchant' })
    .select('+verificationDocPublicId +verificationDocFormat +verificationDocDataUrl')
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
  const requestedStoreName = req.body.storeName ?? req.body.organizationName;
  if (requestedStoreName !== undefined) {
    if (typeof requestedStoreName !== 'string' || requestedStoreName.trim().length < 2 || requestedStoreName.trim().length > 120) {
      throw httpError(400, 'INVALID_STORE_NAME', 'Store name must be between 2 and 120 characters.');
    }
    update.storeName = requestedStoreName.trim();
  }
  if (req.body.category !== undefined) {
    if (!['bakery', 'eatery', 'grocery', 'other'].includes(req.body.category)) throw httpError(400, 'INVALID_CATEGORY', 'Choose a valid business category.');
    update.category = req.body.category;
  }
  if (req.body.municipality !== undefined) {
    if (typeof req.body.municipality !== 'string' || !ILOILO_MUNICIPALITIES.includes(req.body.municipality.trim())) throw httpError(400, 'INVALID_MUNICIPALITY', 'Choose a valid Iloilo municipality or city.');
    update.municipality = req.body.municipality.trim();
  }
  if (req.body.barangay !== undefined) {
    if (typeof req.body.barangay !== 'string' || req.body.barangay.trim().length > 100 || /^unspecified$/i.test(req.body.barangay.trim())) throw httpError(400, 'INVALID_BARANGAY', 'Enter a barangay name, or leave it blank.');
    update.barangay = req.body.barangay.trim();
  }
  if (req.body.address !== undefined) {
    if (typeof req.body.address !== 'string' || req.body.address.trim().length < 3 || req.body.address.trim().length > 300 || /^unspecified$/i.test(req.body.address.trim())) throw httpError(400, 'INVALID_ADDRESS', 'Enter a street or landmark address up to 300 characters.');
    update.address = req.body.address.trim();
  }
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

  const locationChanged = Object.hasOwn(update, 'municipality') || Object.hasOwn(update, 'barangay');
  if (locationChanged) {
    if (!Object.hasOwn(update, 'municipality') && !ILOILO_MUNICIPALITIES.includes(String(user.municipality || '').trim())) update.municipality = 'Iloilo City';
    if (!Object.hasOwn(update, 'barangay') && (!user.barangay || /^unspecified$/i.test(String(user.barangay).trim()))) update.barangay = '';
  }

  const uploadedUrl = req.file ? await uploadImageBuffer(req.file, { folder: 'salbarkain/storefronts' }) : null;
  const oldPublicId = user.storefrontPhotoPublicId;
  if (uploadedUrl) { update.storefrontPhotoUrl = uploadedUrl; update.storefrontPhotoPublicId = undefined; }
  try {
    Object.assign(user, update);
    await user.save();
  } catch (error) {
    throw error;
  }
  if (locationChanged) {
    const locationUpdate = { municipality: user.municipality, barangay: user.barangay };
    await Promise.all([
      Batch.updateMany({ merchantId: user._id }, { $set: { ...locationUpdate, address: user.address } }),
      Claim.updateMany({ merchantId: user._id }, { $set: locationUpdate }),
    ]);
  }
  if (uploadedUrl && oldPublicId) await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'image' }).catch(() => {});
  batchCache.flushAll();
  invalidateBatchCache();
  const refreshed = await User.findById(user._id).select('+verificationDocPublicId +verificationDocFormat +verificationDocDataUrl').populate('verifiedBy', 'name assignedMunicipality').lean();
  let profile;
  try { profile = profileFields(refreshed); } catch { throw httpError(503, 'DOCUMENT_UNAVAILABLE', 'The permit link could not be created right now.'); }
  const sessionUser = {
    id: profile.id, role: profile.role, name: profile.name, email: profile.email,
    storeName: profile.storeName, organizationName: profile.organizationName,
    category: profile.category, storefrontPhotoUrl: profile.storefrontPhotoUrl,
    address: profile.address, barangay: profile.barangay, municipality: profile.municipality,
    verificationStatus: profile.verificationStatus,
  };
  res.set('Cache-Control', 'no-store').json({ success: true, data: { profile, user: sessionUser } });
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
