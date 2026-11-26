const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const { invalidateBatchCache } = require('./cache');

async function expireClaimAndRestore(claimId, now = new Date(), { force = false } = {}) {
  const session = await mongoose.startSession();
  let expired = false;
  try {
    await session.withTransaction(async () => {
      const claim = await Claim.findOneAndUpdate(
        { _id: claimId, status: 'pending', ...(force ? {} : { pickupDeadline: { $lte: now } }) },
        { $set: { status: 'expired' } },
        { session, returnDocument: 'after' },
      );
      if (!claim) return;

      await Batch.updateOne(
        { _id: claim.batchId },
        [
          {
            $set: {
              remainingQty: { $min: [{ $add: ['$remainingQty', claim.qty] }, '$quantity'] },
            },
          },
          {
            $set: {
              status: {
                $cond: [
                  { $or: [{ $lte: ['$expiresAt', now] }, { $lte: [{ $ifNull: ['$safeUntil', '$expiresAt'] }, now] }] },
                  'expired',
                  { $cond: [{ $eq: ['$status', 'withdrawn'] }, 'withdrawn', 'active'] },
                ],
              },
            },
          },
        ],
        { session },
      );
      expired = true;
    });
  } finally {
    await session.endSession();
  }

  if (expired) invalidateBatchCache();
  return expired;
}

module.exports = { expireClaimAndRestore };
