const Claim = require('../models/Claim');
const Batch = require('../models/Batch');
const User = require('../models/User');
const ImpactEntry = require('../models/ImpactEntry');

async function backfillLegacyImpactEntries() {
  const missing = await Claim.aggregate([
    { $match: { status: 'completed' } },
    { $lookup: { from: ImpactEntry.collection.name, localField: '_id', foreignField: 'claimId', as: 'existingEntry' } },
    { $match: { existingEntry: { $size: 0 } } },
    { $lookup: { from: Batch.collection.name, localField: 'batchId', foreignField: '_id', as: 'batch' } },
    { $unwind: '$batch' },
    { $lookup: { from: User.collection.name, localField: 'merchantId', foreignField: '_id', as: 'merchant' } },
    { $unwind: '$merchant' },
    { $project: {
      claimId: '$_id', batchId: 1, merchantId: 1,
      itemName: '$batch.itemName', storeName: '$merchant.storeName',
      barangay: { $ifNull: ['$merchant.barangay', 'Unspecified'] },
      municipality: { $ifNull: ['$merchant.municipality', 'Unspecified'] },
      quantity: '$qty', foodKg: { $multiply: ['$qty', 0.5] }, co2eKg: { $multiply: ['$qty', 1.25] },
      completedAt: '$updatedAt',
    } },
  ]);
  if (!missing.length) return;
  try { await ImpactEntry.insertMany(missing, { ordered: false }); }
  catch (error) {
    const duplicateOnly = error.code === 11000 || (error.writeErrors?.length > 0 && error.writeErrors.every((entry) => entry.code === 11000));
    if (!duplicateOnly) throw error;
  }
}

module.exports = { backfillLegacyImpactEntries };
