const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, authorizeRoles, optionalAuth } = require('../middleware/auth');
const { rateLimit } = require('express-rate-limit');
const { exportImpactCsv, myImpact, impactHeatmap } = require('../controllers/impactController');

const router = express.Router();
router.get('/export', authenticate, authorizeRoles('admin'), asyncHandler(exportImpactCsv));
router.post('/mine', rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false }), optionalAuth, asyncHandler(myImpact));
router.get('/heatmap', authenticate, authorizeRoles('admin'), asyncHandler(impactHeatmap));
module.exports = router;
