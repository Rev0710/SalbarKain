const crypto = require('crypto');
const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
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

      const batch = await Batch.findOneAndUpdate(
        {
          _id: input.batchId,
          remainingQty: { $gte: input.qty },
          status: 'active',
          expiresAt: { $gt: now },
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
      if (batch.isDonationOnly && !(req.user?.role === 'ngo' && req.user.verified)) {
        throw httpError(403, 'NGO_VERIFICATION_REQUIRED', 'Only a verified NGO or shelter can claim a donation-only batch.');
      }

      const claim = new Claim({
        qrToken,
        batchId: batch._id,
        merchantId: batch.merchantId,
        qty: input.qty,
        buyerName: input.buyerName,
        deviceToken: input.deviceToken,
        phone: input.phone,
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
      },
    },
  });
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

  const completed = await Claim.findOneAndUpdate(
    {
      _id: claim._id,
      merchantId: req.user.id,
      status: 'pending',
      pickupDeadline: { $gt: now },
    },
    { $set: { status: 'completed' } },
    { returnDocument: 'after' },
  );

  if (!completed) {
    throw httpError(409, 'CLAIM_NOT_PENDING', 'This pickup pass is no longer pending.');
  }

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

module.exports = { createClaim, verifyClaim };
