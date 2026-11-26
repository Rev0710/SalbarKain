const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const imageUpload = require('../middleware/upload');
const { authenticate, authorizeRoles, optionalAuth } = require('../middleware/auth');
const { createBatch, listBatches, listMyBatches } = require('../controllers/batchController');

const router = express.Router();
router.get('/mine', authenticate, authorizeRoles('merchant'), asyncHandler(listMyBatches));
router.get('/', optionalAuth, asyncHandler(listBatches));
router.post('/', authenticate, authorizeRoles('merchant'), imageUpload.single('photo'), asyncHandler(createBatch));

module.exports = router;
