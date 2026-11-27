const express = require('express');
const { rateLimit } = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const { imageUpload } = require('../middleware/upload');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { getMerchantProfile, updateMerchantProfile, getMerchantReviews, getPublicMerchantReviews } = require('../controllers/merchantController');

const router = express.Router();
const publicReviewLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
router.get('/profile', authenticate, authorizeRoles('merchant'), asyncHandler(getMerchantProfile));
router.patch('/profile', authenticate, authorizeRoles('merchant'), imageUpload.single('storefrontPhoto'), asyncHandler(updateMerchantProfile));
router.get('/reviews', authenticate, authorizeRoles('merchant'), asyncHandler(getMerchantReviews));
router.get('/:merchantId/reviews', publicReviewLimiter, asyncHandler(getPublicMerchantReviews));

module.exports = router;
