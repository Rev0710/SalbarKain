const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/rateLimiters');
const { kybUpload } = require('../middleware/upload');
const { register, login, submitVerificationUpdate } = require('../controllers/authController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authLimiter);
router.post('/register', kybUpload, asyncHandler(register));
router.post('/login', asyncHandler(login));
router.patch('/verification', authenticate, authorizeRoles('merchant', 'ngo'), kybUpload, asyncHandler(submitVerificationUpdate));

module.exports = router;
