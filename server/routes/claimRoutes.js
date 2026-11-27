const express = require('express');
const { rateLimit } = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const { claimLimiter } = require('../middleware/rateLimiters');
const { authenticate, authorizeRoles, optionalAuth, requireVerified } = require('../middleware/auth');
const { createClaim, cancelClaim, verifyClaim, listMerchantActiveClaims, merchantImpact } = require('../controllers/claimController');
const { myImpact } = require('../controllers/impactController');

const router = express.Router();
router.get('/my-impact', rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false }), optionalAuth, asyncHandler(myImpact));
router.get('/merchant-active', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(listMerchantActiveClaims));
router.get('/merchant-impact', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(merchantImpact));
router.post('/', claimLimiter, optionalAuth, asyncHandler(createClaim));
router.patch('/:qrToken/cancel', asyncHandler(cancelClaim));
router.patch('/:qrToken/verify', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(verifyClaim));

module.exports = router;
