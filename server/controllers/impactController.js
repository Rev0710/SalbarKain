const ImpactEntry = require('../models/ImpactEntry');
const Claim = require('../models/Claim');
const Batch = require('../models/Batch');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const normalizePhone = require('../utils/phone');
const { backfillLegacyImpactEntries } = require('../utils/impactLedger');

function csvCell(value) {
  const text = String(value ?? '').replace(/^[\s]*([=+@-])/, "'$1");
  return `"${text.replace(/"/g, '""')}"`;
}

function locationFilters(query = {}) {
  const filters = {};
  for (const field of ['municipality', 'barangay']) {
    if (query[field] === undefined || query[field] === '') continue;
    if (typeof query[field] !== 'string' || query[field].trim().length > 100) throw httpError(400, 'INVALID_LOCATION_FILTER', `Provide a valid ${field} filter.`);
    filters[field] = query[field].trim();
  }
  return filters;
}

async function exportImpactCsv(req, res) {
  await backfillLegacyImpactEntries();
  const filters = locationFilters(req.query);
  const entries = await ImpactEntry.find(filters).sort({ completedAt: 1 }).lean();
  const rows = [
    ['completed_at', 'store', 'municipality', 'barangay', 'item', 'meal_packs', 'food_rescued_kg', 'co2e_diverted_kg'],
    ...entries.map((entry) => [entry.completedAt.toISOString(), entry.storeName, entry.municipality, entry.barangay, entry.itemName, entry.quantity, entry.foodKg.toFixed(2), entry.co2eKg.toFixed(2)]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.set({ 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="salbarkain-impact-ledger.csv"' });
  res.type('text/csv').status(200).send(csv);
}

async function myImpact(req, res) {
  let match;
  if (req.user?.role === 'merchant') match = { merchantId: req.user.id, status: 'completed' };
  else {
    const rawPhone = req.user?.role === 'ngo' ? await User.findById(req.user.id).select('phone').then(user => user?.phone) : req.body?.phone;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const deviceToken = req.body?.deviceToken;
    if (req.user?.role === 'ngo') {
      if (!phone) throw httpError(400, 'IMPACT_ID_REQUIRED', 'Add a mobile number to your organization account to view rescue stats.');
      match = { status: 'completed', phone };
    } else {
      if (typeof deviceToken !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(deviceToken) || !phone) throw httpError(400, 'IMPACT_ID_REQUIRED', 'A valid phone number and this device are required to view personal rescue stats.');
      match = { status: 'completed', phone, deviceToken };
    }
  }
  const [rows] = await Claim.aggregate([{ $match: match }, { $group: { _id: null, rescues: { $sum: 1 }, mealPacks: { $sum: '$qty' }, moneySaved: { $sum: '$estimatedSavings' } } }]);
  const rescues = rows?.rescues || 0;
  const mealPacks = rows?.mealPacks || 0;
  const tier = rescues >= 50 ? 'Master Salbar Champion' : rescues >= 10 ? 'Eco-Warrior' : rescues >= 1 ? 'Rookie Food Saver' : 'New Food Saver';
  const roleBadge = req.user?.role === 'merchant' ? (rescues >= 50 ? 'Certified Zero-Waste Storefront' : null) : req.user?.role === 'ngo' ? (mealPacks >= 100 ? 'Community Hunger Hero' : null) : null;
  res.set('Cache-Control', 'no-store').json({ success: true, data: { rescues, mealPacks, moneySaved: Number((rows?.moneySaved || 0).toFixed(2)), foodKg: Number((mealPacks * 0.5).toFixed(2)), co2eKg: Number((mealPacks * 1.25).toFixed(2)), tier, roleBadge, certificateUnlocked: req.user?.role === 'merchant' && rescues >= 50 } });
}

async function impactHeatmap(req, res) {
  const geoFilters = locationFilters(req.query);
  const [active, rescued] = await Promise.all([
    Batch.find({ status: 'active', expiresAt: { $gt: new Date() }, remainingQty: { $gt: 0 }, $or: [{ safeUntil: { $gt: new Date() } }, { safeUntil: { $exists: false } }] }).populate('merchantId', 'location address barangay municipality verificationStatus verified').lean(),
    ImpactEntry.aggregate([{ $match: geoFilters }, { $group: { _id: '$merchantId', quantity: { $sum: '$quantity' } } }]),
  ]);
  const rescueWeights = new Map(rescued.map(row => [String(row._id), row.quantity]));
  const rescuedMerchants = rescued.length ? await User.find({ _id: { $in: rescued.map(row => row._id) }, ...geoFilters, role: 'merchant', $or: [{ verificationStatus: 'verified' }, { verified: true }] }).select('location address barangay municipality').lean() : [];
  const merchantById = new Map(rescuedMerchants.map(merchant => [String(merchant._id), merchant]));
  const weights = new Map();
  for (const batch of active) {
    const merchant = batch.merchantId;
    const coordinates = merchant?.location?.coordinates;
    if (!coordinates || coordinates.length !== 2 || !(merchant.verificationStatus === 'verified' || merchant.verified)) continue;
    if (Object.entries(geoFilters).some(([field, value]) => merchant[field] !== value)) continue;
    const key = `${coordinates[1].toFixed(5)},${coordinates[0].toFixed(5)}`;
    const point = weights.get(key) || { lat: coordinates[1], lng: coordinates[0], weight: 0, address: merchant.address || 'Local food partner', barangay: merchant.barangay || 'Unspecified', municipality: merchant.municipality || 'Unspecified' };
    point.weight += Math.max(1, batch.remainingQty || 0); weights.set(key, point);
  }
  for (const [merchantId, quantity] of rescueWeights) {
    const merchant = merchantById.get(merchantId); const coordinates = merchant?.location?.coordinates;
    if (!coordinates || coordinates.length !== 2) continue;
    const key = `${coordinates[1].toFixed(5)},${coordinates[0].toFixed(5)}`;
    const point = weights.get(key) || { lat: coordinates[1], lng: coordinates[0], weight: 0, address: merchant.address || 'Local food partner', barangay: merchant.barangay || 'Unspecified', municipality: merchant.municipality || 'Unspecified' };
    point.weight += quantity * 0.1; weights.set(key, point);
  }
  const points = [...weights.values()];
  res.set('Cache-Control', 'no-store').json({ success: true, data: { points } });
}

module.exports = { exportImpactCsv, myImpact, impactHeatmap, locationFilters };
