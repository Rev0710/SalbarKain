const Claim = require('../models/Claim');
const ImpactEntry = require('../models/ImpactEntry');
const { locationFilters } = require('./impactController');
const { backfillLegacyImpactEntries } = require('../utils/impactLedger');

async function impactSummary(req, res) {
  const filters = locationFilters(req.query);
  const filtered = Object.keys(filters).length > 0;
  if (filtered) await backfillLegacyImpactEntries();
  const [ledger, legacy] = await Promise.all([
    ImpactEntry.aggregate([...(filtered ? [{ $match: filters }] : []), { $group: { _id: null, mealsSaved: { $sum: '$quantity' }, foodKg: { $sum: '$foodKg' }, co2eKg: { $sum: '$co2eKg' } } }]),
    filtered ? Promise.resolve([]) : Claim.aggregate([
      { $match: { status: 'completed' } },
      { $lookup: { from: ImpactEntry.collection.name, localField: '_id', foreignField: 'claimId', as: 'impact' } },
      { $match: { impact: { $size: 0 } } },
      { $group: { _id: null, mealsSaved: { $sum: '$qty' } } },
    ]),
  ]);
  const mealsSaved = (ledger[0]?.mealsSaved || 0) + (legacy[0]?.mealsSaved || 0);
  const foodKg = (ledger[0]?.foodKg || 0) + (legacy[0]?.mealsSaved || 0) * 0.5;
  const co2eKg = (ledger[0]?.co2eKg || 0) + (legacy[0]?.mealsSaved || 0) * 1.25;
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { mealsSaved, foodKg: Number(foodKg.toFixed(2)), co2eKg: Number(co2eKg.toFixed(2)), factors: { foodKgPerPack: 0.5, co2eKgPerPack: 1.25 } } });
}

async function mealsSaved(req, res) {
  return impactSummary(req, res);
}

module.exports = { mealsSaved, impactSummary };
