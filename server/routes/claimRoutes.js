const express = require('express');
const { rateLimit } = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const { claimLimiter } = require('../middleware/rateLimiters');
const { authenticate, authorizeRoles, optionalAuth, requireVerified } = require('../middleware/auth');
const { createClaim, cancelClaim, verifyClaim, listMerchantActiveClaims, merchantImpact, getClaimStatus, listRecentRescues, previewClaim } = require('../controllers/claimController');
const { myImpact } = require('../controllers/impactController');

const router = express.Router();
router.get('/my-impact', rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false }), optionalAuth, asyncHandler(myImpact));
router.get('/merchant-active', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(listMerchantActiveClaims));
router.get('/merchant-impact', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(merchantImpact));
router.get('/recent-rescues', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), asyncHandler(listRecentRescues));
router.get('/:qrToken/status', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }), asyncHandler(getClaimStatus));
router.get('/:qrToken/preview', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(previewClaim));
router.post('/', claimLimiter, optionalAuth, asyncHandler(createClaim));
router.patch('/:qrToken/cancel', asyncHandler(cancelClaim));
router.patch('/:qrToken/verify', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(verifyClaim));

module.exports = router;
