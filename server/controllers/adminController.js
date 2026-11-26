const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const Batch = require('../models/Batch');
const httpError = require('../utils/httpError');
const { invalidateBatchCache } = require('../utils/cache');

function adminSafeUser(user) {
  return {
    id: user._id.toString(), role: user.role, name: user.name, email: user.email,
    phone: user.phone, storeName: user.storeName, organizationName: user.organizationName,
    category: user.category, address: user.address, location: user.location, barangay: user.barangay || 'Unspecified', municipality: user.municipality || 'Unspecified',
    storefrontPhotoUrl: user.storefrontPhotoUrl, verificationStatus: user.verificationStatus,
    verificationNote: user.verificationNote, createdAt: user.createdAt,
    hasVerificationDocument: Boolean(user.verificationDocPublicId),
  };
}

async function listVerifications(_req, res) {
  const users = await User.find({ role: { $in: ['merchant', 'ngo'] }, $or: [
    { verificationStatus: { $in: ['pending', 'rejected'] } },
    { verificationStatus: { $exists: false }, verified: { $ne: true } },
  ] })
    .select('+verificationDocPublicId +verificationDocFormat +verificationNote')
    .sort({ createdAt: 1 }).limit(100).lean();
  res.json({ success: true, data: { applicants: users.map(adminSafeUser) } });
}

async function getVerificationDocument(req, res) {
  const user = await User.findById(req.params.userId).select('+verificationDocPublicId +verificationDocFormat').lean();
  if (!user || !user.verificationDocPublicId) throw httpError(404, 'DOCUMENT_NOT_FOUND', 'This applicant has no verification document on file.');
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
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'INVALID_DECISION', 'Choose approve or reject.');
  const status = decision === 'approve' ? 'verified' : 'rejected';
  if (status === 'verified') {
    const application = await User.findOne({ _id: req.params.userId, role: { $in: ['merchant', 'ngo'] } }).select('+verificationDocPublicId').lean();
    if (!application) throw httpError(404, 'APPLICANT_NOT_FOUND', 'Partner application was not found.');
    if (!application.verificationDocPublicId) throw httpError(409, 'VERIFICATION_DOCUMENT_REQUIRED', 'A permit or organization verification document must be on file before approval.');
  }
  const user = await User.findOneAndUpdate(
    { _id: req.params.userId, role: { $in: ['merchant', 'ngo'] } },
    { $set: { verificationStatus: status, verified: status === 'verified', verificationReviewedAt: new Date(), verificationNote: note || undefined } },
    { new: true, runValidators: true },
  ).select('+verificationNote');
  if (!user) throw httpError(404, 'APPLICANT_NOT_FOUND', 'Partner application was not found.');
  invalidateBatchCache();
  res.json({ success: true, data: { applicant: adminSafeUser(user) } });
}

async function listFlaggedBatches(_req, res) {
  const batches = await Batch.find({ status: 'flagged' }).populate('merchantId', 'storeName category address').sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { batches } });
}

async function restoreFlaggedBatch(req, res) {
  const batch = await Batch.findOneAndUpdate({ _id: req.params.batchId, status: 'flagged', expiresAt: { $gt: new Date() }, $or: [{ safeUntil: { $gt: new Date() } }, { safeUntil: { $exists: false } }] }, { $set: { status: 'active', reportCount: 0, reportedByDevices: [], spoilageReportCount: 0, spoilageReportedByDevices: [], foodSafetyFlagged: false } }, { new: true, runValidators: true });
  if (!batch) throw httpError(404, 'FLAGGED_BATCH_NOT_FOUND', 'Flagged batch was not found.');
  invalidateBatchCache();
  res.json({ success: true, data: { batch: { id: batch._id.toString(), status: batch.status } } });
}

module.exports = { listVerifications, getVerificationDocument, reviewVerification, listFlaggedBatches, restoreFlaggedBatch };
