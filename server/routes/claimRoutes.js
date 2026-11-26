const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { claimLimiter } = require('../middleware/rateLimiters');
const { authenticate, authorizeRoles, optionalAuth } = require('../middleware/auth');
const { createClaim, verifyClaim } = require('../controllers/claimController');

const router = express.Router();
router.use(claimLimiter);
router.post('/', optionalAuth, asyncHandler(createClaim));
router.patch('/:qrToken/verify', authenticate, authorizeRoles('merchant'), asyncHandler(verifyClaim));

module.exports = router;
