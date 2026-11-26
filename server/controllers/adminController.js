const bcrypt = require('bcryptjs');
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const ImpactEntry = require('../models/ImpactEntry');
const httpError = require('../utils/httpError');
const { invalidateBatchCache } = require('../utils/cache');
const normalizePhone = require('../utils/phone');

const ILOILO_CENTER = [10.7450, 122.5500];
const MUNICIPALITIES = ['Iloilo City', 'Pavia', 'Santa Barbara', 'Oton', 'Leganes', 'Zarraga', 'Cabatuan', 'Pototan', 'Passi City', 'Miagao', 'Other Iloilo Municipality'];
const adminScope = (req) => req.user.assignedMunicipality === 'ALL' || !req.user.assignedMunicipality ? {} : { municipality: req.user.assignedMunicipality };
const jurisdictionName = (req) => req.user.assignedMunicipality === 'ALL' || !req.user.assignedMunicipality
  ? 'Iloilo Province (All LGUs)' : `Municipality of ${req.user.assignedMunicipality}`;

async function scopedMerchantIds(req) {
  const scope = adminScope(req);
  if (!Object.keys(scope).length) return null;
  return User.distinct('_id', { role: 'merchant', ...scope });
}

async function backfillScopedImpactEntries(req) {
  const merchantIds = await scopedMerchantIds(req);
  if (merchantIds && merchantIds.length === 0) return;
  const match = { status: 'completed', ...(merchantIds ? { merchantId: { $in: merchantIds } } : {}) };
  const missing = await Claim.aggregate([
    { $match: match },
    { $lookup: { from: ImpactEntry.collection.name, localField: '_id', foreignField: 'claimId', as: 'existingEntry' } },
    { $match: { existingEntry: { $size: 0 } } },
    { $lookup: { from: Batch.collection.name, localField: 'batchId', foreignField: '_id', as: 'batch' } },
    { $unwind: '$batch' },
    { $lookup: { from: User.collection.name, localField: 'merchantId', foreignField: '_id', as: 'merchant' } },
    { $unwind: '$merchant' },
    { $match: adminScope(req).municipality ? { 'merchant.municipality': adminScope(req).municipality } : {} },
    { $project: {
      claimId: '$_id', batchId: 1, merchantId: 1, itemName: '$batch.itemName', storeName: '$merchant.storeName',
      barangay: { $ifNull: ['$merchant.barangay', 'Unspecified'] }, municipality: { $ifNull: ['$merchant.municipality', 'Unspecified'] },
      quantity: '$qty', foodKg: { $multiply: ['$qty', 0.5] }, co2eKg: { $multiply: ['$qty', 1.25] }, completedAt: '$updatedAt',
    } },
  ]);
  if (!missing.length) return;
  try { await ImpactEntry.insertMany(missing, { ordered: false }); }
  catch (error) {
    const duplicatesOnly = error.code === 11000 || (error.writeErrors?.length && error.writeErrors.every((item) => item.code === 11000));
    if (!duplicatesOnly) throw error;
  }
}

function adminSafeUser(user) {
  return {
    id: user._id.toString(), role: user.role, name: user.name, email: user.email,
    phone: user.phone, storeName: user.storeName, organizationName: user.organizationName,
    category: user.category, address: user.address, location: user.location,
    barangay: user.barangay || 'Unspecified', municipality: user.municipality || 'Unspecified',
    storefrontPhotoUrl: user.storefrontPhotoUrl, verificationStatus: user.verificationStatus,
    rejectionReason: user.rejectionReason, createdAt: user.createdAt,
    zeroWasteCertified: user.zeroWasteCertified === true,
    hasVerificationDocument: Boolean(user.verificationDocPublicId),
  };
}

async function aggregateLedger(scope) {
  return ImpactEntry.aggregate([
    { $match: scope },
    { $group: {
      _id: { municipality: '$municipality', barangay: '$barangay' },
      mealsSaved: { $sum: '$quantity' },
      foodDivertedKg: { $sum: '$foodKg' },
      co2PreventedKg: { $sum: '$co2eKg' },
    } },
    { $project: { _id: 0, municipality: '$_id.municipality', barangay: '$_id.barangay', mealsSaved: 1, foodDivertedKg: 1, co2PreventedKg: 1 } },
    { $sort: { municipality: 1, barangay: 1 } },
  ]);
}

async function overview(req, res) {
  await backfillScopedImpactEntries(req);
  const scope = adminScope(req);
  const merchantQuery = { role: 'merchant', ...scope };
  const pendingQuery = { role: { $in: ['merchant', 'ngo'] }, verificationStatus: 'pending', ...scope };
  const merchantIds = await scopedMerchantIds(req);
  const flaggedQuery = { status: 'flagged', ...(merchantIds ? { merchantId: { $in: merchantIds } } : {}) };
  const [impactRows, verifiedMerchantsCount, pendingReviewsCount, flaggedCount, ledger, merchants] = await Promise.all([
    ImpactEntry.aggregate([{ $match: scope }, { $group: { _id: null, mealsSaved: { $sum: '$quantity' }, foodDivertedKg: { $sum: '$foodKg' }, co2PreventedKg: { $sum: '$co2eKg' } } }]),
    User.countDocuments({ ...merchantQuery, $or: [{ verificationStatus: 'verified' }, { verified: true }] }),
    User.countDocuments(pendingQuery),
    Batch.countDocuments(flaggedQuery),
    aggregateLedger(scope),
    User.find({ ...merchantQuery, $or: [{ verificationStatus: 'verified' }, { verified: true }] }).select('storeName municipality barangay location').lean(),
  ]);
  const ids = merchants.map((merchant) => merchant._id);
  const [stock, rescued] = ids.length ? await Promise.all([
    Batch.aggregate([{ $match: { merchantId: { $in: ids }, status: 'active', expiresAt: { $gt: new Date() }, remainingQty: { $gt: 0 } } }, { $group: { _id: '$merchantId', amount: { $sum: '$remainingQty' } } }]),
    ImpactEntry.aggregate([{ $match: { ...scope } }, { $group: { _id: '$merchantId', amount: { $sum: '$quantity' } } }]),
  ]) : [[], []];
  const weightByMerchant = new Map();
  for (const row of stock) weightByMerchant.set(String(row._id), row.amount);
  for (const row of rescued) weightByMerchant.set(String(row._id), (weightByMerchant.get(String(row._id)) || 0) + row.amount * 0.1);
  const heatmap = merchants.flatMap((merchant) => {
    const coordinates = merchant.location?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return [];
    return [{ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { storeName: merchant.storeName, municipality: merchant.municipality, barangay: merchant.barangay, weight: weightByMerchant.get(String(merchant._id)) || 1 } }];
  });
  const totals = impactRows[0] || { mealsSaved: 0, foodDivertedKg: 0, co2PreventedKg: 0 };
  res.set('Cache-Control', 'no-store').json({ success: true, data: {
    jurisdiction: { assignedMunicipality: req.user.assignedMunicipality || 'ALL', label: jurisdictionName(req) },
    kpis: { mealsSaved: totals.mealsSaved, foodDivertedKg: Number(totals.foodDivertedKg.toFixed(2)), co2PreventedKg: Number(totals.co2PreventedKg.toFixed(2)), verifiedMerchantsCount, pendingReviewsCount, flaggedCount },
    heatmap: { type: 'FeatureCollection', features: heatmap }, ledger,
    mapCenter: ILOILO_CENTER,
  } });
}

async function listVerifications(req, res) {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const statuses = ['pending', 'verified', 'rejected', 'suspended'];
  if (status !== 'all' && !statuses.includes(status)) throw httpError(400, 'INVALID_STATUS_FILTER', 'Choose a valid account status.');
  const statusFilter = status === 'all' ? {} : status === 'pending'
    ? { $or: [{ verificationStatus: 'pending' }, { verificationStatus: { $exists: false }, verified: { $ne: true } }] }
    : status === 'verified' ? { $or: [{ verificationStatus: 'verified' }, { verified: true }] }
      : { verificationStatus: status };
  const users = await User.find({ role: { $in: ['merchant', 'ngo'] }, ...adminScope(req), ...statusFilter })
    .select('+verificationDocPublicId +verificationDocFormat +rejectionReason')
    .sort({ createdAt: -1 }).limit(250).lean();
  res.json({ success: true, data: { applicants: users.map(adminSafeUser) } });
}

async function getVerificationDocument(req, res) {
  const user = await User.findOne({ _id: req.params.userId, role: { $in: ['merchant', 'ngo'] }, ...adminScope(req) }).select('+verificationDocPublicId +verificationDocFormat').lean();
  if (!user || !user.verificationDocPublicId) throw httpError(404, 'DOCUMENT_NOT_FOUND', 'This applicant has no verification document in your jurisdiction.');
  try {
    const url = cloudinary.utils.private_download_url(user.verificationDocPublicId, user.verificationDocFormat || 'pdf', {
      resource_type: 'raw', type: 'private', expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    res.json({ success: true, data: { url, expiresInSeconds: 300 } });
  } catch {
    throw httpError(503, 'DOCUMENT_UNAVAILABLE', 'The verification document could not be opened right now.');
  }
}

async function reviewVerification(req, res) {
  const { decision } = req.body || {};
  const reason = typeof (req.body?.rejectionReason ?? req.body?.note) === 'string' ? (req.body.rejectionReason ?? req.body.note).trim().slice(0, 300) : '';
  if (!['approve', 'reject', 'suspend'].includes(decision)) throw httpError(400, 'INVALID_DECISION', 'Choose approve, reject, or suspend.');
  if (decision === 'reject' && reason.length < 3) throw httpError(400, 'REJECTION_REASON_REQUIRED', 'Enter a reason of at least 3 characters before rejecting.');
  const rejectionReason = decision === 'reject' ? reason : '';
  const filter = { _id: req.params.userId, role: { $in: ['merchant', 'ngo'] }, ...adminScope(req) };
  if (decision === 'approve') {
    const application = await User.findOne(filter).select('+verificationDocPublicId').lean();
    if (!application) throw httpError(404, 'APPLICANT_NOT_FOUND', 'Partner application was not found in your jurisdiction.');
    if (!application.verificationDocPublicId) throw httpError(409, 'VERIFICATION_DOCUMENT_REQUIRED', 'A verification image or document must be on file before approval.');
  }
  const status = decision === 'approve' ? 'verified' : decision === 'reject' ? 'rejected' : 'suspended';
  const now = new Date();
  const update = { $set: {
    verificationStatus: status, verified: status === 'verified', verificationReviewedAt: now,
    verifiedBy: req.user.id, verifiedAt: now,
  } };
  if (decision === 'reject') update.$set.rejectionReason = rejectionReason;
  else update.$unset = { rejectionReason: 1, verificationNote: 1 };
  if (decision === 'reject') update.$set.verificationNote = rejectionReason;
  const user = await User.findOneAndUpdate(filter, update, { new: true, runValidators: true }).select('+rejectionReason');
  if (!user) throw httpError(404, 'APPLICANT_NOT_FOUND', 'Partner application was not found in your jurisdiction.');
  if (decision === 'suspend' && user.role === 'merchant') await Batch.updateMany({ merchantId: user._id, status: 'active' }, { $set: { status: 'withdrawn' } });
  invalidateBatchCache();
  res.json({ success: true, data: { applicant: adminSafeUser(user) } });
}

async function listFlaggedBatches(req, res) {
  const merchantIds = await scopedMerchantIds(req);
  const query = { status: 'flagged', ...(merchantIds ? { merchantId: { $in: merchantIds } } : {}) };
  const batches = await Batch.find(query).populate('merchantId', 'storeName category address barangay municipality verificationStatus').sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { batches } });
}

async function reviewFlaggedBatch(req, res) {
  const action = req.body?.action;
  if (!['restore', 'suspend'].includes(action)) throw httpError(400, 'INVALID_FLAGGED_ACTION', 'Choose restore or suspend merchant.');
  const merchantIds = await scopedMerchantIds(req);
  const scope = { _id: req.params.batchId, status: 'flagged', ...(merchantIds ? { merchantId: { $in: merchantIds } } : {}) };
  const batch = await Batch.findOne(scope).select('merchantId expiresAt safeUntil').lean();
  if (!batch) throw httpError(404, 'FLAGGED_BATCH_NOT_FOUND', 'Flagged listing was not found in your jurisdiction.');
  if (action === 'restore') {
    const restored = await Batch.findOneAndUpdate({ ...scope, expiresAt: { $gt: new Date() }, safeUntil: { $gt: new Date() } }, { $set: { status: 'active', reportCount: 0, reportedByDevices: [], spoilageReportCount: 0, spoilageReportedByDevices: [], foodSafetyFlagged: false } }, { new: true, runValidators: true });
    if (!restored) throw httpError(409, 'BATCH_NOT_RESTORABLE', 'This batch has expired or passed its food-safety cutoff and cannot be restored.');
    invalidateBatchCache();
    return res.json({ success: true, data: { batch: { id: restored._id.toString(), status: restored.status } } });
  }
  const merchant = await User.findOneAndUpdate({ _id: batch.merchantId, role: 'merchant', ...adminScope(req) }, { $set: { verificationStatus: 'suspended', verified: false, verificationReviewedAt: new Date(), verifiedBy: req.user.id, verifiedAt: new Date() } }, { new: true });
  if (!merchant) throw httpError(404, 'MERCHANT_NOT_FOUND', 'Merchant was not found in your jurisdiction.');
  await Batch.updateMany({ merchantId: merchant._id, status: 'active' }, { $set: { status: 'withdrawn' } });
  invalidateBatchCache();
  res.json({ success: true, data: { merchant: { id: merchant._id.toString(), verificationStatus: merchant.verificationStatus } } });
}

async function restoreFlaggedBatch(req, res) {
  req.body = { ...(req.body || {}), action: 'restore' };
  return reviewFlaggedBatch(req, res);
}

function csvCell(value) {
  const text = String(value ?? '').replace(/^[\s]*([=+@-])/, "'$1");
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportMenro(req, res) {
  await backfillScopedImpactEntries(req);
  const ledger = await aggregateLedger(adminScope(req));
  const rows = [['municipality', 'barangay', 'rescued_meals', 'food_diverted_kg', 'co2e_prevented_kg'], ...ledger.map((row) => [row.municipality, row.barangay, row.mealsSaved, Number(row.foodDivertedKg).toFixed(2), Number(row.co2PreventedKg).toFixed(2)])];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.set({ 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="salbarkain-menro-impact.csv"' }).type('text/csv').send(csv);
}

async function createOfficer(req, res) {
  if ((req.user.assignedMunicipality || 'ALL') !== 'ALL') throw httpError(403, 'PROVINCIAL_ADMIN_REQUIRED', 'Only the Iloilo Provincial Super-Admin can create municipal officers.');
  const { name, email, password, municipality } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) throw httpError(400, 'INVALID_NAME', 'Enter the officer’s full name.');
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw httpError(400, 'INVALID_EMAIL', 'Enter a valid officer email.');
  if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) throw httpError(400, 'INVALID_PASSWORD', 'Officer password must be at least 10 characters.');
  if (typeof municipality !== 'string' || !MUNICIPALITIES.includes(municipality) || municipality === 'Other Iloilo Municipality') throw httpError(400, 'INVALID_MUNICIPALITY', 'Choose a municipality from the supported Iloilo LGUs.');
  const emailValue = email.trim().toLowerCase();
  if (await User.exists({ email: emailValue })) throw httpError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ role: 'admin', name: name.trim(), email: emailValue, passwordHash, assignedMunicipality: municipality, municipality, barangay: 'Unspecified', address: `${municipality}, Iloilo`, location: { type: 'Point', coordinates: [122.55, 10.745] }, verified: true, verificationStatus: 'verified' });
  res.status(201).json({ success: true, data: { officer: { id: user._id.toString(), name: user.name, email: user.email, assignedMunicipality: user.assignedMunicipality } } });
}

async function leaderboard(req, res) {
  await backfillScopedImpactEntries(req);
  const scope = adminScope(req);
  const [merchantTotals, ngoUsers] = await Promise.all([
    ImpactEntry.aggregate([{ $match: scope }, { $group: { _id: '$merchantId', rescues: { $sum: '$quantity' } } }, { $match: { rescues: { $gte: 50 } } }]),
    User.find({ role: 'ngo', ...scope, $or: [{ verificationStatus: 'verified' }, { verified: true }] }).select('name organizationName phone municipality barangay zeroWasteCertified').lean(),
  ]);
  const merchantMap = merchantTotals.length ? await User.find({ _id: { $in: merchantTotals.map((row) => row._id) }, role: 'merchant', ...scope, $or: [{ verificationStatus: 'verified' }, { verified: true }] }).select('storeName municipality barangay zeroWasteCertified').lean() : [];
  const merchantById = new Map(merchantMap.map((merchant) => [String(merchant._id), merchant]));
  const merchants = merchantTotals.map((row) => ({ ...merchantById.get(String(row._id)), id: String(row._id), rescues: row.rescues })).filter((row) => row.storeName);
  const phoneToNgos = new Map();
  for (const ngo of ngoUsers) {
    if (!ngo.phone) continue;
    try { const normalized = normalizePhone(ngo.phone); phoneToNgos.set(normalized, [...(phoneToNgos.get(normalized) || []), ngo]); } catch { /* ignore invalid legacy contact values */ }
  }
  const normalizedPhones = [...phoneToNgos.keys()];
  let ngoTotals = [];
  if (normalizedPhones.length) {
    const merchantIds = await scopedMerchantIds(req);
    const match = { status: 'completed', phone: { $exists: true } };
    if (merchantIds) match.merchantId = { $in: merchantIds };
    const claims = await Claim.find(match).select('+phone qty').lean();
    const totals = new Map();
    for (const claim of claims) {
      try { const normalized = normalizePhone(claim.phone); if (phoneToNgos.has(normalized)) totals.set(normalized, (totals.get(normalized) || 0) + claim.qty); } catch { /* skip malformed historical contact values */ }
    }
    ngoTotals = [...totals].filter(([, meals]) => meals >= 100).flatMap(([phone, meals]) => (phoneToNgos.get(phone) || []).map((ngo) => ({ id: String(ngo._id), name: ngo.organizationName || ngo.name, municipality: ngo.municipality, barangay: ngo.barangay, rescues: meals, zeroWasteCertified: ngo.zeroWasteCertified === true })));
  }
  res.set('Cache-Control', 'no-store').json({ success: true, data: { merchants, ngos: ngoTotals } });
}

async function setPartnerCertification(req, res) {
  const certified = req.body?.certified;
  if (typeof certified !== 'boolean') throw httpError(400, 'INVALID_CERTIFICATION', 'Choose whether to issue or revoke the certification.');
  const user = await User.findOne({ _id: req.params.userId, role: { $in: ['merchant', 'ngo'] }, ...adminScope(req), $or: [{ verificationStatus: 'verified' }, { verified: true }] });
  if (!user) throw httpError(404, 'PARTNER_NOT_FOUND', 'Verified partner was not found in your jurisdiction.');
  if (certified) {
    const rescues = await ImpactEntry.aggregate([{ $match: { ...adminScope(req), ...(user.role === 'merchant' ? { merchantId: user._id } : {}) } }, { $group: { _id: null, quantity: { $sum: '$quantity' } } }]);
    let eligibleRescues = Number(rescues[0]?.quantity || 0);
    if (user.role === 'ngo' && user.phone) {
      const normalized = normalizePhone(user.phone);
      const merchantIds = await scopedMerchantIds(req);
      const match = { status: 'completed', phone: { $exists: true }, ...(merchantIds ? { merchantId: { $in: merchantIds } } : {}) };
      const claims = await Claim.find(match).select('+phone qty').lean();
      eligibleRescues = claims.reduce((sum, claim) => { try { return normalizePhone(claim.phone) === normalized ? sum + Number(claim.qty || 0) : sum; } catch { return sum; } }, 0);
    }
    const threshold = user.role === 'merchant' ? 50 : 100;
    if (eligibleRescues < threshold) throw httpError(409, 'RECOGNITION_THRESHOLD_NOT_MET', `This partner needs at least ${threshold} completed rescue packs.`);
  }
  user.zeroWasteCertified = certified;
  await user.save();
  res.json({ success: true, data: { id: user._id.toString(), zeroWasteCertified: user.zeroWasteCertified } });
}

module.exports = { overview, listVerifications, getVerificationDocument, reviewVerification, listFlaggedBatches, reviewFlaggedBatch, restoreFlaggedBatch, exportMenro, createOfficer, leaderboard, setPartnerCertification };
