const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { listVerifications, getVerificationDocument, reviewVerification, listFlaggedBatches, restoreFlaggedBatch } = require('../controllers/adminController');

const router = express.Router();
router.use(authenticate, authorizeRoles('admin'));
router.get('/verifications', asyncHandler(listVerifications));
router.get('/verifications/:userId/document', asyncHandler(getVerificationDocument));
router.patch('/verifications/:userId', asyncHandler(reviewVerification));
router.get('/flagged-batches', asyncHandler(listFlaggedBatches));
router.patch('/flagged-batches/:batchId/restore', asyncHandler(restoreFlaggedBatch));
module.exports = router;
