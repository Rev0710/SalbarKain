const cloudinary = require('../config/cloudinary');
const Batch = require('../models/Batch');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { batchCache, BATCH_CACHE_PREFIX, invalidateBatchCache } = require('../utils/cache');

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

  if (!itemName || itemName.length > 120) {
    throw httpError(400, 'INVALID_ITEM_NAME', 'Enter an item name up to 120 characters.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw httpError(400, 'INVALID_QUANTITY', 'Quantity must be a whole number from 1 to 10,000.');
  }
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw httpError(400, 'INVALID_EXPIRY', 'Pickup cutoff must be a future date and time.');
  }
  if (isDonationOnly && price !== undefined && price !== 0) {
    throw httpError(400, 'INVALID_PRICE', 'Donation-only batches must be free.');
  }
  if (!isDonationOnly && (!Number.isFinite(price) || price < 0)) {
    throw httpError(400, 'INVALID_PRICE', 'Enter a discounted price of zero or more.');
  }

  return {
    itemName,
    quantity,
    remainingQty: quantity,
    price: isDonationOnly ? 0 : price,
    isDonationOnly,
    expiresAt,
  };
}

function uploadImage(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'salbar-kain/batches', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
      (error, result) => error ? reject(error) : resolve(result),
    ).end(buffer);
  });
}

async function createBatch(req, res) {
  if (!req.file) throw httpError(400, 'PHOTO_REQUIRED', 'Attach one batch photo in the photo field.');
  if (!cloudinary.config().cloud_name) {
    throw httpError(503, 'UPLOAD_NOT_CONFIGURED', 'Cloudinary is not configured on this server.');
  }

  const input = parseBatchBody(req.body);
  const uploaded = await uploadImage(req.file.buffer);
  try {
    const batch = await Batch.create({
      ...input,
      merchantId: req.user.id,
      photoUrl: uploaded.secure_url,
      photoPublicId: uploaded.public_id,
    });
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
        },
      },
    });
  } catch (error) {
    await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: 'image' }).catch(() => {});
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

  const isVerifiedNgo = req.user?.role === 'ngo' && req.user.verified;
  const key = `${BATCH_CACHE_PREFIX}${JSON.stringify({
    lat: hasLat ? lat : null,
    lng: hasLng ? lng : null,
    radius,
    limit: pageSize,
    donations: isVerifiedNgo,
  })}`;
  let batches = batchCache.get(key);

  if (!batches) {
    const filter = {
      status: 'active',
      remainingQty: { $gt: 0 },
      expiresAt: { $gt: new Date() },
      ...(isVerifiedNgo ? {} : { isDonationOnly: false }),
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
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radiusMeters,
          },
        },
      }).select('_id').limit(1000).lean();

      const merchantIds = nearbyMerchants.map((merchant) => merchant._id);
      merchantRanks = new Map(merchantIds.map((id, index) => [id.toString(), index]));
      filter.merchantId = { $in: merchantIds };
    }

    batches = await Batch.find(filter)
      .populate('merchantId', 'storeName category address location verified')
      .sort({ expiresAt: 1 })
      .limit(hasLat ? 1000 : pageSize)
      .lean();

    if (merchantRanks) {
      batches.sort((left, right) =>
        merchantRanks.get(left.merchantId._id.toString()) - merchantRanks.get(right.merchantId._id.toString())
        || new Date(left.expiresAt) - new Date(right.expiresAt));
      batches = batches.slice(0, pageSize);
    }
    batchCache.set(key, batches);
  }

  const currentTime = Date.now();
  const visible = batches.filter((batch) =>
    batch.status === 'active'
    && batch.remainingQty > 0
    && new Date(batch.expiresAt).getTime() > currentTime);
  res.status(200).json({ success: true, data: { batches: visible } });
}

async function listMyBatches(req, res) {
  const batches = await Batch.find({ merchantId: req.user.id })
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json({ success: true, data: { batches } });
}
module.exports = { createBatch, listBatches, listMyBatches };
