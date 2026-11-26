const express = require('express');
const { rateLimit } = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const { claimLimiter } = require('../middleware/rateLimiters');
const { authenticate, authorizeRoles, optionalAuth, requireVerified } = require('../middleware/auth');
const { createClaim, cancelClaim, verifyClaim } = require('../controllers/claimController');
const { myImpact } = require('../controllers/impactController');

const router = express.Router();
router.get('/my-impact', rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false }), optionalAuth, asyncHandler(myImpact));
router.post('/', claimLimiter, optionalAuth, asyncHandler(createClaim));
router.patch('/:qrToken/cancel', asyncHandler(cancelClaim));
router.patch('/:qrToken/verify', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(verifyClaim));

module.exports = router;
