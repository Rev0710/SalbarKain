const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const { expireClaimAndRestore } = require('./claimExpiry');
const { invalidateBatchCache } = require('./cache');

function startExpiryWorker() {
  let running = false;

  async function sweep() {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const dueClaims = await Claim.find({
        status: 'pending',
        pickupDeadline: { $lte: now },
      }).select('_id').sort({ pickupDeadline: 1 }).limit(100).lean();

      for (const claim of dueClaims) {
        await expireClaimAndRestore(claim._id, now);
      }

      const expiredBatches = await Batch.updateMany(
        { status: { $in: ['active', 'sold_out'] }, $or: [{ expiresAt: { $lte: now } }, { safeUntil: { $lte: now } }] },
        { $set: { status: 'expired' } },
      );
      if (expiredBatches.modifiedCount > 0) invalidateBatchCache();
    } catch (error) {
      console.error('Expiry sweep failed:', error.message);
    } finally {
      running = false;
    }
  }

  void sweep();
  const timer = setInterval(sweep, 60 * 1000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  };
}

module.exports = { startExpiryWorker };
