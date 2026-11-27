const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { imageUpload } = require('../middleware/upload');
const { authenticate, authorizeRoles, optionalAuth, requireVerified } = require('../middleware/auth');
const { createBatch, listBatches, listVerifiedPartners, listMyBatches, listMyHistory, reportBatch } = require('../controllers/batchController');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();
router.get('/mine', authenticate, authorizeRoles('merchant'), asyncHandler(listMyBatches));
router.get('/my-history', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(listMyHistory));
router.get('/partners', asyncHandler(listVerifiedPartners));
router.get('/', optionalAuth, asyncHandler(listBatches));
router.post('/', authenticate, authorizeRoles('merchant'), requireVerified, imageUpload.single('photo'), asyncHandler(createBatch));
router.patch('/:id/report', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }), asyncHandler(reportBatch));

module.exports = router;
