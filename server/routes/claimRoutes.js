const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { claimLimiter } = require('../middleware/rateLimiters');
const { authenticate, authorizeRoles, optionalAuth, requireVerified } = require('../middleware/auth');
const { createClaim, cancelClaim, verifyClaim } = require('../controllers/claimController');

const router = express.Router();
router.use(claimLimiter);
router.post('/', optionalAuth, asyncHandler(createClaim));
router.patch('/:qrToken/cancel', asyncHandler(cancelClaim));
router.patch('/:qrToken/verify', authenticate, authorizeRoles('merchant'), requireVerified, asyncHandler(verifyClaim));

module.exports = router;
