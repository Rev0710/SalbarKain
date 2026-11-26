const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { mealsSaved, impactSummary } = require('../controllers/statsController');

const router = express.Router();
router.get('/meals-saved', asyncHandler(mealsSaved));
router.get('/impact', asyncHandler(impactSummary));

module.exports = router;
