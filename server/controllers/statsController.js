const Claim = require('../models/Claim');

async function mealsSaved(_req, res) {
  const [totals] = await Claim.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, mealsSaved: { $sum: '$qty' } } },
  ]);

  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    success: true,
    data: { mealsSaved: totals?.mealsSaved ?? 0 },
  });
}

module.exports = { mealsSaved };
