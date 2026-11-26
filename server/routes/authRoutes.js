const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authLimiter } = require('../middleware/rateLimiters');
const { register, login } = require('../controllers/authController');

const router = express.Router();
router.use(authLimiter);
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));

module.exports = router;
