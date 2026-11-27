const express = require('express');
const { rateLimit } = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/rateLimiters');
const { kybUpload } = require('../middleware/upload');
const { register, login, submitVerificationUpdate, requestPasswordCode, confirmPasswordChange } = require('../controllers/authController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const passwordCodeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, code: 'PASSWORD_CODE_RATE_LIMITED', message: 'Too many password-code requests. Try again in 15 minutes.' } });
const passwordChangeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, code: 'PASSWORD_CHANGE_RATE_LIMITED', message: 'Too many password-change attempts. Try again in 15 minutes.' } });
router.use(authLimiter);
router.post('/register', kybUpload, asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/request-password-code', passwordCodeLimiter, authenticate, authorizeRoles('merchant'), asyncHandler(requestPasswordCode));
router.patch('/confirm-password-change', passwordChangeLimiter, authenticate, authorizeRoles('merchant'), asyncHandler(confirmPasswordChange));
router.patch('/verification', authenticate, authorizeRoles('merchant', 'ngo'), kybUpload, asyncHandler(submitVerificationUpdate));

module.exports = router;
