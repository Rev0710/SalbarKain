const crypto = require('crypto');
const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const User = require('../models/User');
const ImpactEntry = require('../models/ImpactEntry');
const httpError = require('../utils/httpError');
const normalizePhone = require('../utils/phone');
const { invalidateBatchCache } = require('../utils/cache');
const { expireClaimAndRestore } = require('../utils/claimExpiry');

function validateClaimBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'INVALID_REQUEST', 'Provide claim details.');
  }
  if (!mongoose.isValidObjectId(body.batchId)) {
    throw httpError(400, 'INVALID_BATCH_ID', 'Choose a valid food batch.');
  }
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    throw httpError(400, 'INVALID_QUANTITY', 'Claim quantity must be a whole number from 1 to 100.');
  }
  if (typeof body.buyerName !== 'string' || body.buyerName.trim().length < 2 || body.buyerName.trim().length > 100) {
    throw httpError(400, 'INVALID_NAME', 'Enter a name between 2 and 100 characters.');
  }
  if (typeof body.deviceToken !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(body.deviceToken)) {
    throw httpError(400, 'INVALID_DEVICE_TOKEN', 'Refresh the page and try again with a valid device token.');
  }
  if (body.safetyAcknowledged !== true) throw httpError(400, 'SAFETY_ACK_REQUIRED', 'Confirm that you reviewed the storage and allergen information before reserving food.');
  return {
    batchId: new mongoose.Types.ObjectId(body.batchId),
    qty,
    buyerName: body.buyerName.trim(),
    deviceToken: body.deviceToken,
    phone: normalizePhone(body.phone),
  };
}

function isDuplicateKey(error) {
  return error && error.code === 11000;
}

async function createClaim(req, res) {
  const input = validateClaimBody(req.body);
  const session = await mongoose.startSession();
  const qrToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const pickupDeadline = new Date(now.getTime() + 45 * 60 * 1000);
  let createdClaim;

  try {
    await session.withTransaction(async () => {
      const existing = await Claim.findOne({
        status: 'pending',
        $or: [{ deviceToken: input.deviceToken }, { phone: input.phone }],
      }).session(session).select('_id').lean();
      if (existing) {
        throw httpError(409, 'ACTIVE_CLAIM_EXISTS', 'You already have a pending pickup. Complete or wait for it to expire before claiming another batch.');
      }

      const candidateBatch = await Batch.findById(input.batchId).session(session).select('merchantId isDonationOnly ngoPriorityUntil expiresAt safeUntil price originalPrice retailValue isFlashDropEnabled').lean();
      const merchant = candidateBatch && await User.findOne({ _id: candidateBatch.merchantId, role: 'merchant', $or: [{ verificationStatus: 'verified' }, { verified: true }] }).session(session).select('_id').lean();
      if (!merchant) throw httpError(404, 'BATCH_UNAVAILABLE', 'This batch is not currently available.');
      if (new Date(candidateBatch.expiresAt) <= now || new Date(candidateBatch.safeUntil || candidateBatch.expiresAt) <= now) throw httpError(410, 'BATCH_EXPIRED', 'This food batch is past its safe pickup window.');
      const verifiedNgo = req.user?.role === 'ngo' && (req.user.verificationStatus === 'verified' || req.user.verified);
      if (candidateBatch.isDonationOnly && !verifiedNgo) throw httpError(403, 'NGO_VERIFICATION_REQUIRED', 'Only a verified NGO or shelter can claim a donation-only batch.');
      if (candidateBatch.ngoPriorityUntil && candidateBatch.ngoPriorityUntil > now && !verifiedNgo) {
        throw httpError(403, 'NGO_PRIORITY_ACTIVE', 'This batch is in its 15-minute NGO priority window. Verified NGOs can claim it first.');
      }

      const batch = await Batch.findOneAndUpdate(
        {
          _id: input.batchId,
          remainingQty: { $gte: input.qty },
          status: 'active',
          expiresAt: { $gt: now },
          $or: [{ safeUntil: { $gt: now } }, { safeUntil: { $exists: false } }],
        },
        [
          {
            $set: {
              remainingQty: { $subtract: ['$remainingQty', input.qty] },
              status: {
                $cond: [
                  { $eq: [{ $subtract: ['$remainingQty', input.qty] }, 0] },
                  'sold_out',
                  'active',
                ],
              },
            },
          },
        ],
        { session, returnDocument: 'after' },
      );

      if (!batch) {
        throw httpError(409, 'BATCH_UNAVAILABLE', 'This batch has expired or does not have enough portions remaining.');
      }
      const flashActive = candidateBatch.isFlashDropEnabled && candidateBatch.expiresAt.getTime() - now.getTime() <= 30 * 60 * 1000;
      const priceAtClaim = verifiedNgo && flashActive ? 0 : flashActive ? Number((Number(candidateBatch.price || 0) * 0.5).toFixed(2)) : Number(candidateBatch.price || 0);
      const unitSavings = candidateBatch.retailValue != null ? Math.max(0, Number(candidateBatch.retailValue) - priceAtClaim) : candidateBatch.originalPrice != null ? Math.max(0, Number(candidateBatch.originalPrice) - priceAtClaim) : 0;
      const claim = new Claim({
        qrToken,
        batchId: batch._id,
        merchantId: batch.merchantId,
        qty: input.qty,
        buyerName: input.buyerName,
        deviceToken: input.deviceToken,
        phone: input.phone,
        safetyAcknowledged: true,
        priceAtClaim,
        estimatedSavings: Number((unitSavings * input.qty).toFixed(2)),
        pickupDeadline,
        status: 'pending',
      });
      await claim.save({ session });
      createdClaim = claim;
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw httpError(409, 'ACTIVE_CLAIM_EXISTS', 'You already have a pending pickup. Complete or wait for it to expire before claiming another batch.');
    }
    throw error;
  } finally {
    await session.endSession();
  }

  invalidateBatchCache();
  res.status(201).json({
    success: true,
    data: {
      claim: {
        id: createdClaim._id.toString(),
        qrToken: createdClaim.qrToken,
        batchId: createdClaim.batchId.toString(),
        qty: createdClaim.qty,
        buyerName: createdClaim.buyerName,
        pickupDeadline: createdClaim.pickupDeadline,
        status: createdClaim.status,
        priceAtClaim: createdClaim.priceAtClaim,
      },
    },
  });
}

async function cancelClaim(req, res) {
  const { qrToken } = req.params;
  const deviceToken = req.body?.deviceToken;
  if (!/^[a-f0-9]{64}$/i.test(qrToken || '')) throw httpError(404, 'CLAIM_NOT_FOUND', 'Pickup pass was not found.');
  if (typeof deviceToken !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(deviceToken)) {
    throw httpError(400, 'INVALID_DEVICE_TOKEN', 'This device could not verify the pickup pass.');
  }

  const session = await mongoose.startSession();
  const now = new Date();
  let result;
  try {
    await session.withTransaction(async () => {
      const claim = await Claim.findOneAndUpdate(
        { qrToken, deviceToken, status: 'pending', pickupDeadline: { $gt: now } },
        { $set: { status: 'cancelled' } },
        { session, returnDocument: 'after' },
      ).select('+qrToken').lean();

      if (!claim) {
        const existing = await Claim.findOne({ qrToken, deviceToken }).session(session).select('status pickupDeadline').lean();
        if (!existing) throw httpError(404, 'CLAIM_NOT_FOUND', 'Pickup pass was not found on this device.');
        if (existing.status === 'cancelled') { result = { status: 'cancelled', alreadyCancelled: true }; return; }
        if (existing.status === 'pending' && new Date(existing.pickupDeadline) <= now) throw httpError(410, 'PICKUP_PASS_EXPIRED', 'This pickup pass has already expired.');
        throw httpError(409, 'CLAIM_NOT_PENDING', 'Only a pending pickup reservation can be cancelled.');
      }

      await Batch.updateOne(
        { _id: claim.batchId },
        [
          { $set: { remainingQty: { $min: [{ $add: [{ $ifNull: ['$remainingQty', 0] }, claim.qty] }, '$quantity'] } } },
          { $set: { status: {
            $cond: [
              { $or: [{ $lte: ['$expiresAt', now] }, { $lte: [{ $ifNull: ['$safeUntil', '$expiresAt'] }, now] }] },
              'expired',
              { $cond: [{ $in: ['$status', ['withdrawn', 'flagged']] }, '$status', 'active'] },
            ],
          } } },
        ],
        { session },
      );
      result = { status: 'cancelled', alreadyCancelled: false };
    });
  } finally {
    await session.endSession();
  }

  if (!result?.alreadyCancelled) invalidateBatchCache();
  res.json({ success: true, data: result });
}

async function verifyClaim(req, res) {
  const { qrToken } = req.params;
  if (!/^[a-f0-9]{64}$/i.test(qrToken)) {
    throw httpError(404, 'CLAIM_NOT_FOUND', 'Pickup pass was not found.');
  }

  const claim = await Claim.findOne({ qrToken }).select('+qrToken');
  if (!claim || claim.merchantId.toString() !== req.user.id) {
    throw httpError(404, 'CLAIM_NOT_FOUND', 'Pickup pass was not found.');
  }
  if (claim.status !== 'pending') {
    throw httpError(409, 'CLAIM_NOT_PENDING', 'This pickup pass is no longer pending.');
  }

  const now = new Date();
  if (now >= claim.pickupDeadline) {
    await expireClaimAndRestore(claim._id, now);
    throw httpError(410, 'PICKUP_PASS_EXPIRED', 'This pickup pass has expired.');
  }

  if (!(req.user.verificationStatus === 'verified' || req.user.verified)) throw httpError(403, 'VERIFICATION_REQUIRED', 'A verified merchant account is required to redeem pickup passes.');
  const session = await mongoose.startSession();
  let completed;
  try {
    await session.withTransaction(async () => {
      const validBatch = await Batch.findOne({ _id: claim.batchId, expiresAt: { $gt: now }, $or: [{ safeUntil: { $gt: now } }, { safeUntil: { $exists: false } }] }).session(session).select('itemName merchantId').lean();
      if (!validBatch) throw httpError(410, 'PICKUP_PASS_EXPIRED', 'This food batch is past its safe pickup window.');
      completed = await Claim.findOneAndUpdate(
        { _id: claim._id, merchantId: req.user.id, status: 'pending', pickupDeadline: { $gt: now } },
        { $set: { status: 'completed' } },
        { session, returnDocument: 'after' },
      );
      if (!completed) throw httpError(409, 'CLAIM_NOT_PENDING', 'This pickup pass is no longer pending.');
      const batch = validBatch;
      const merchant = await User.findById(completed.merchantId).session(session).select('storeName barangay municipality').lean();
      if (!batch || !merchant) throw httpError(409, 'IMPACT_RECORD_FAILED', 'Pickup impact could not be recorded. Try scanning the pass again.');
      await ImpactEntry.create([{
        claimId: completed._id,
        batchId: batch._id,
        merchantId: completed.merchantId,
        itemName: batch.itemName,
        storeName: merchant.storeName || 'Local food partner',
        barangay: merchant.barangay || 'Unspecified',
        municipality: merchant.municipality || 'Unspecified',
        quantity: completed.qty,
        foodKg: Number((completed.qty * 0.5).toFixed(2)),
        co2eKg: Number((completed.qty * 1.25).toFixed(2)),
        completedAt: now,
      }], { session });
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw httpError(409, 'CLAIM_NOT_PENDING', 'This pickup pass has already been completed.');
    if (error.statusCode === 410) await expireClaimAndRestore(claim._id, now, { force: true });
    throw error;
  } finally { await session.endSession(); }

  invalidateBatchCache();
  res.status(200).json({
    success: true,
    data: {
      claim: {
        id: completed._id.toString(),
        batchId: completed.batchId.toString(),
        qty: completed.qty,
        buyerName: completed.buyerName,
        status: completed.status,
        completedAt: completed.updatedAt,
      },
    },
  });
}

async function listMerchantActiveClaims(req, res) {
  const now = new Date();
  const claims = await Claim.find({
    merchantId: req.user.id,
    status: 'pending',
    pickupDeadline: { $gt: now },
  })
    .select('+qrToken buyerName qty priceAtClaim pickupDeadline batchId')
    .populate({ path: 'batchId', select: 'itemName photoUrl' })
    .sort({ pickupDeadline: 1 })
    .lean();

  res.set('Cache-Control', 'no-store').json({
    success: true,
    data: {
      claims: claims.map((claim) => ({
        id: claim._id.toString(),
        qrToken: claim.qrToken,
        buyerName: claim.buyerName,
        qty: claim.qty,
        priceAtClaim: claim.priceAtClaim,
        totalToCollect: Number((Number(claim.priceAtClaim || 0) * claim.qty).toFixed(2)),
        pickupDeadline: claim.pickupDeadline,
        itemName: claim.batchId?.itemName || 'Surplus batch',
        photoUrl: claim.batchId?.photoUrl || '',
      })),
    },
  });
}

async function merchantImpact(req, res) {
  const [totals] = await Claim.aggregate([
    { $match: { merchantId: new mongoose.Types.ObjectId(req.user.id), status: 'completed' } },
    { $group: {
      _id: null,
      completedRescues: { $sum: 1 },
      rescuedPacks: { $sum: '$qty' },
      revenueRecovered: { $sum: { $multiply: ['$priceAtClaim', '$qty'] } },
    } },
  ]);
  const completedRescues = Number(totals?.completedRescues || 0);
  res.set('Cache-Control', 'no-store').json({
    success: true,
    data: {
      completedRescues,
      rescuedPacks: Number(totals?.rescuedPacks || 0),
      foodDivertedKg: Number((completedRescues * 0.5).toFixed(1)),
      revenueRecovered: Number((totals?.revenueRecovered || 0).toFixed(2)),
    },
  });
}

module.exports = { createClaim, cancelClaim, verifyClaim, listMerchantActiveClaims, merchantImpact };
