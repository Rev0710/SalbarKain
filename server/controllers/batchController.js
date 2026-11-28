const { uploadImageBuffer } = require('../utils/uploadImage');
const Batch = require('../models/Batch');
const { STORAGE_TYPES, CONSUME_WITHIN, ALLERGENS } = require('../models/Batch');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { batchCache, BATCH_CACHE_PREFIX, invalidateBatchCache } = require('../utils/cache');
const { hashIdentifier } = require('../utils/authAudit');

function normalizeDemoPhotoUrl(photoUrl) {
  if (typeof photoUrl !== 'string') return photoUrl;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(photoUrl)) return '';
  return photoUrl;
}

function parseBatchBody(body) {
  const itemName = typeof body.itemName === 'string' ? body.itemName.trim() : '';
  const quantity = Number(body.quantity);
  if (body.isDonationOnly !== undefined && ![true, false, 'true', 'false'].includes(body.isDonationOnly)) {
    throw httpError(400, 'INVALID_DONATION_FLAG', 'isDonationOnly must be true or false.');
  }
  const isDonationOnly = body.isDonationOnly === true || body.isDonationOnly === 'true';
  const priceProvided = body.price !== undefined && body.price !== null && body.price !== '';
  if (priceProvided && !(typeof body.price === 'number' || (typeof body.price === 'string' && /^\d+(?:\.\d{1,2})?$/.test(body.price.trim())))) {
    throw httpError(400, 'INVALID_PRICE', 'Price must be a valid amount.');
  }
  const price = priceProvided ? Number(body.price) : undefined;
  const expiresAt = new Date(body.expiresAt);
  const safeUntil = new Date(body.safeUntil);
  const storageType = body.storageType;
  const consumeWithin = body.consumeWithin;
  const keyIngredients = typeof body.keyIngredients === 'string' ? body.keyIngredients.trim().slice(0, 100) : '';
  let allergens = body.allergens;
  if (typeof allergens === 'string') { try { allergens = JSON.parse(allergens); } catch { allergens = null; } }
  if (!Array.isArray(allergens) || allergens.length < 1 || allergens.some((tag) => !ALLERGENS.includes(tag)) || new Set(allergens).size !== allergens.length || (allergens.includes('None / Allergen-Free') && allergens.length !== 1)) {
    throw httpError(400, 'INVALID_ALLERGENS', 'Select one or more valid safety tags. Allergen-free cannot be combined with other allergens.');
  }

  if (!itemName || itemName.length > 120) {
    throw httpError(400, 'INVALID_ITEM_NAME', 'Enter an item name up to 120 characters.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw httpError(400, 'INVALID_QUANTITY', 'Quantity must be a whole number from 1 to 10,000.');
  }
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() + 15 * 60 * 1000) {
    throw httpError(400, 'INVALID_EXPIRY', 'Pickup cutoff must be at least 15 minutes in the future.');
  }
  if (!STORAGE_TYPES.includes(storageType)) throw httpError(400, 'INVALID_STORAGE_TYPE', 'Choose a valid storage type.');
  if (!CONSUME_WITHIN.includes(consumeWithin)) throw httpError(400, 'INVALID_CONSUME_WITHIN', 'Choose a valid consume-within time.');
  if (isDonationOnly && price !== undefined && price !== 0) {
    throw httpError(400, 'INVALID_PRICE', 'Donation-only batches must be free.');
  }
  if (!isDonationOnly && (!Number.isFinite(price) || price < 0)) {
    throw httpError(400, 'INVALID_PRICE', 'Enter a discounted price of zero or more.');
  }

  if (body.ngoPriorityEnabled !== undefined && ![true, false, 'true', 'false'].includes(body.ngoPriorityEnabled)) {
    throw httpError(400, 'INVALID_PRIORITY_FLAG', 'ngoPriorityEnabled must be true or false.');
  }
  const ngoPriorityEnabled = body.ngoPriorityEnabled === true || body.ngoPriorityEnabled === 'true';
  const booleanField = (field) => {
    if (body[field] !== undefined && ![true, false, 'true', 'false'].includes(body[field])) throw httpError(400, `INVALID_${field.toUpperCase()}`, `${field} must be true or false.`);
    return body[field] === true || body[field] === 'true';
  };
  const freshnessAttested = booleanField('freshnessAttested');
  const isFlashDropEnabled = booleanField('isFlashDropEnabled');
  const isMagicBayong = booleanField('isMagicBayong');
  const originalPrice = body.originalPrice === '' || body.originalPrice == null ? null : Number(body.originalPrice);
  const retailValue = body.retailValue === '' || body.retailValue == null ? null : Number(body.retailValue);
  if (!Number.isFinite(safeUntil.getTime()) || safeUntil < expiresAt) throw httpError(400, 'INVALID_SAFE_UNTIL', 'Food safety time must be at or after the pickup cutoff.');
  if (!freshnessAttested) throw httpError(400, 'FRESHNESS_ATTESTATION_REQUIRED', 'Confirm that this food was prepared today and is safe for consumption.');
  if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) throw httpError(400, 'INVALID_ORIGINAL_PRICE', 'Original price must be equal to or higher than the discounted price.');
  if (isMagicBayong && (!Number.isFinite(retailValue) || retailValue <= price)) throw httpError(400, 'INVALID_RETAIL_VALUE', 'Magic Bayong estimated retail value must be higher than its discounted price.');
  return {
    itemName,
    quantity,
    remainingQty: quantity,
    price: isDonationOnly ? 0 : price,
    isDonationOnly,
    expiresAt,
    safeUntil,
    freshnessAttested,
    originalPrice,
    isFlashDropEnabled,
    isMagicBayong,
    retailValue,
    storageType,
    consumeWithin,
    keyIngredients,
    allergens,
    ngoPriorityEnabled,
  };
}

async function createBatch(req, res) {
  const restockBatchId = typeof req.body?.restockBatchId === 'string' ? req.body.restockBatchId : '';
  const existingPhotoUrl = typeof req.body?.existingPhotoUrl === 'string' ? req.body.existingPhotoUrl.trim() : '';
  if (existingPhotoUrl && !(/^https:\/\//i.test(existingPhotoUrl) || /^data:image\/(?:jpeg|png|webp);base64,/i.test(existingPhotoUrl))) throw httpError(400, 'INVALID_RESTOCK_PHOTO', 'Only a saved, permanent photo can be reused.');

  const input = parseBatchBody(req.body);
  const ngoPriorityEnabled = input.ngoPriorityEnabled;
  delete input.ngoPriorityEnabled;
  let restockSource;
  if (!req.file && (restockBatchId || existingPhotoUrl)) {
    const sourceFilter = { merchantId: req.user.id };
    if (restockBatchId) sourceFilter._id = restockBatchId;
    if (existingPhotoUrl) sourceFilter.photoUrl = existingPhotoUrl;
    restockSource = await Batch.findOne(sourceFilter).select('photoUrl photoPublicId').lean();
    if (!restockSource) throw httpError(404, 'RESTOCK_SOURCE_NOT_FOUND', 'Choose a saved photo from one of your own previous batches.');
    if (existingPhotoUrl && normalizeDemoPhotoUrl(existingPhotoUrl) !== normalizeDemoPhotoUrl(restockSource.photoUrl)) {
      throw httpError(400, 'RESTOCK_PHOTO_MISMATCH', 'The saved photo does not match your selected previous batch. Refresh your inventory and try again.');
    }
  }
  const uploadedPhotoUrl = req.file ? await uploadImageBuffer(req.file, { folder: 'salbar-kain/batches' }) : null;
  try {
    const batch = await Batch.create({
      ...input,
      ngoPriorityUntil: ngoPriorityEnabled && !input.isDonationOnly ? new Date(Date.now() + 15 * 60 * 1000) : null,
      merchantId: req.user.id,
      photoUrl: uploadedPhotoUrl || normalizeDemoPhotoUrl(restockSource?.photoUrl) || '/demo-images/pandesal.svg',
      photoPublicId: restockSource?.photoPublicId,
    });
    batchCache.flushAll();
    invalidateBatchCache();
    res.status(201).json({
      success: true,
      data: {
        batch: {
          id: batch._id.toString(),
          itemName: batch.itemName,
          photoUrl: batch.photoUrl,
          quantity: batch.quantity,
          remainingQty: batch.remainingQty,
          price: batch.price,
          isDonationOnly: batch.isDonationOnly,
          expiresAt: batch.expiresAt,
          status: batch.status,
          storageType: batch.storageType,
          consumeWithin: batch.consumeWithin,
          allergens: batch.allergens,
          ngoPriorityUntil: batch.ngoPriorityUntil,
        },
      },
    });
  } catch (error) {
    throw error;
  }
}

function numericQuery(value, name) {
  const number = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(number)) {
    throw httpError(400, 'INVALID_LOCATION', `Provide a valid ${name} query parameter.`);
  }
  return number;
}

async function listBatches(req, res) {
  const { lat, lng, radius = '30000', limit = '50' } = req.query;
  const hasLat = lat !== undefined;
  const hasLng = lng !== undefined;
  if (hasLat !== hasLng) throw httpError(400, 'INVALID_LOCATION', 'Provide both lat and lng.');
  const pageSize = Number(limit);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw httpError(400, 'INVALID_LIMIT', 'Limit must be an integer from 1 to 100.');
  }

  const key = `${BATCH_CACHE_PREFIX}${JSON.stringify({
    lat: hasLat ? lat : null,
    lng: hasLng ? lng : null,
    radius,
    limit: pageSize,
  })}`;
  let batches = batchCache.get(key);

  if (!batches) {
    const filter = {
      status: 'active',
      remainingQty: { $gt: 0 },
      expiresAt: { $gt: new Date() },
      $or: [{ safeUntil: { $gt: new Date() } }, { safeUntil: { $exists: false } }],
    };
    let merchantRanks = null;

    if (hasLat) {
      const latitude = numericQuery(lat, 'lat');
      const longitude = numericQuery(lng, 'lng');
      const radiusMeters = Number(radius);
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw httpError(400, 'INVALID_LOCATION', 'Latitude or longitude is outside valid bounds.');
      }
      if (!Number.isFinite(radiusMeters) || radiusMeters < 100 || radiusMeters > 50000) {
        throw httpError(400, 'INVALID_RADIUS', 'Radius must be from 100 to 50,000 meters.');
      }

      const nearbyMerchants = await User.find({
        role: 'merchant',
        $or: [{ verificationStatus: 'verified' }, { verified: true }],
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radiusMeters,
          },
        },
      }).select('_id').limit(1000).lean();

      const merchantIds = nearbyMerchants.map((merchant) => merchant._id);
      merchantRanks = new Map(merchantIds.map((id, index) => [id.toString(), index]));
    }

    batches = await Batch.find(filter)
      .populate('merchantId', 'storeName category address barangay municipality location verified verificationStatus storefrontPhotoUrl contactNumber pickupInstructions averageRating totalReviews')
      .sort({ expiresAt: 1 })
      .limit(hasLat ? 1000 : pageSize)
      .lean();

    batches = batches.filter((batch) => batch.merchantId && (batch.merchantId.verificationStatus === 'verified' || batch.merchantId.verified === true));

    if (merchantRanks) {
      batches.sort((left, right) => {
        const leftRank = merchantRanks.get(left.merchantId._id.toString()) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = merchantRanks.get(right.merchantId._id.toString()) ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank || new Date(left.expiresAt) - new Date(right.expiresAt);
      });
      batches = batches.slice(0, pageSize);
    }
    batchCache.set(key, batches);
  }

  const currentTime = Date.now();
  const visible = batches.filter((batch) =>
    batch.status === 'active'
    && batch.remainingQty > 0
    && new Date(batch.expiresAt).getTime() > currentTime
    && new Date(batch.safeUntil || batch.expiresAt).getTime() > currentTime).map((batch) => {
      const flashActive = batch.isFlashDropEnabled && new Date(batch.expiresAt).getTime() - currentTime <= 30 * 60 * 1000;
    return { ...batch, photoUrl: normalizeDemoPhotoUrl(batch.photoUrl), flashActive, flashPrice: flashActive ? Number((Number(batch.price || 0) * 0.5).toFixed(2)) : null, flashFreeForNgo: Boolean(flashActive && !batch.isDonationOnly) };
    });
  res.set('Cache-Control', 'no-store').status(200).json({ success: true, data: { batches: visible } });
}

async function listVerifiedPartners(_req, res) {
  const cacheKey = `${BATCH_CACHE_PREFIX}partners`;
  let partners = batchCache.get(cacheKey);
  if (!partners) {
    const stores = await User.find({
      role: 'merchant',
      $or: [{ verificationStatus: 'verified' }, { verified: true }],
    })
      .select('_id storeName category address barangay municipality location storefrontPhotoUrl averageRating totalReviews')
      .sort({ municipality: 1, barangay: 1, storeName: 1 })
      .lean();

    const merchantIds = stores.map((store) => store._id);
    const summaries = merchantIds.length ? await Batch.aggregate([
      {
        $match: {
          merchantId: { $in: merchantIds },
          status: 'active',
          remainingQty: { $gt: 0 },
          expiresAt: { $gt: new Date() },
          safeUntil: { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: '$merchantId',
          activeBatchCount: { $sum: 1 },
          activePackCount: { $sum: '$remainingQty' },
          closesAt: { $min: '$expiresAt' },
        },
      },
    ]) : [];
    const byMerchant = new Map(summaries.map((entry) => [entry._id.toString(), entry]));
    partners = stores.map((store) => {
      const summary = byMerchant.get(store._id.toString());
      return {
        _id: store._id,
        storeName: store.storeName,
        category: store.category,
        address: store.address,
        barangay: store.barangay,
        municipality: store.municipality,
        location: store.location,
        storefrontPhotoUrl: store.storefrontPhotoUrl || '',
        averageRating: Number(store.averageRating) || 0,
        totalReviews: Number(store.totalReviews) || 0,
        verificationStatus: 'verified',
        activeBatchCount: summary?.activeBatchCount || 0,
        activePackCount: summary?.activePackCount || 0,
        closesAt: summary?.closesAt || null,
      };
    });
    batchCache.set(cacheKey, partners);
  }
  res.set('Cache-Control', 'no-store').status(200).json({ success: true, data: { partners } });
}

async function listMyBatches(req, res) {
  const batches = (await Batch.find({ merchantId: req.user.id })
    .sort({ createdAt: -1 })
    .lean()).map((batch) => ({ ...batch, photoUrl: normalizeDemoPhotoUrl(batch.photoUrl) }));
  res.status(200).json({ success: true, data: { batches } });
}

async function listMyHistory(req, res) {
  const batches = (await Batch.find({ merchantId: req.user.id, status: { $nin: ['withdrawn', 'flagged'] } })
    .sort({ createdAt: -1 }).limit(20)
    .select('itemName photoUrl photoPublicId price isDonationOnly storageType consumeWithin allergens keyIngredients ngoPriorityUntil createdAt')
    .lean()).map((batch) => ({ ...batch, photoUrl: normalizeDemoPhotoUrl(batch.photoUrl) }));
  res.status(200).json({ success: true, data: { batches } });
}

async function reportBatch(req, res) {
  const deviceToken = req.body?.deviceToken;
  if (typeof deviceToken !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(deviceToken)) {
    throw httpError(400, 'INVALID_REPORTER', 'A valid device token is required to report a batch.');
  }
  const reporterHash = hashIdentifier(deviceToken);
  if (!reporterHash) throw httpError(503, 'REPORTING_NOT_CONFIGURED', 'Batch reporting is temporarily unavailable.');
  const reason = req.body?.reason === 'spoilage' ? 'spoilage' : 'general';
  const spoilage = reason === 'spoilage';
  const countField = spoilage ? 'spoilageReportCount' : 'reportCount';
  const devicesField = spoilage ? 'spoilageReportedByDevices' : 'reportedByDevices';
  const threshold = spoilage ? 2 : 3;
  const batch = await Batch.findOneAndUpdate(
    { _id: req.params.id, status: 'active', [devicesField]: { $ne: reporterHash }, $or: [{ [countField]: { $lt: threshold } }, { [countField]: { $exists: false } }] },
    [{ $set: {
      [devicesField]: { $concatArrays: [{ $ifNull: [`$${devicesField}`, []] }, [reporterHash]] },
      [countField]: { $add: [{ $ifNull: [`$${countField}`, 0] }, 1] },
      status: { $cond: [{ $gte: [{ $add: [{ $ifNull: [`$${countField}`, 0] }, 1] }, threshold] }, 'flagged', '$status'] },
      foodSafetyFlagged: spoilage ? { $cond: [{ $gte: [{ $add: [{ $ifNull: ['$spoilageReportCount', 0] }, 1] }, threshold] }, true, '$foodSafetyFlagged'] } : '$foodSafetyFlagged',
    } }], { new: true, updatePipeline: true },
  );
  if (!batch) {
    const exists = await Batch.exists({ _id: req.params.id });
    if (!exists) throw httpError(404, 'BATCH_NOT_FOUND', 'Batch was not found.');
    throw httpError(409, 'ALREADY_REPORTED_OR_HIDDEN', 'You have already reported this batch, or it has already been hidden for review.');
  }
  invalidateBatchCache();
  res.status(200).json({ success: true, data: { reportCount: batch.reportCount, spoilageReportCount: batch.spoilageReportCount, reason, hidden: batch.status === 'flagged' } });
}

module.exports = { createBatch, listBatches, listVerifiedPartners, listMyBatches, listMyHistory, reportBatch };
