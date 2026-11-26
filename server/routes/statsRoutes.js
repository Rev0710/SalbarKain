const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { mealsSaved } = require('../controllers/statsController');

const router = express.Router();
router.get('/meals-saved', asyncHandler(mealsSaved));

module.exports = router;
