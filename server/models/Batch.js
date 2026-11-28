const mongoose = require('mongoose');
const { Schema } = mongoose;

const STORAGE_TYPES = ['room_temp_baked', 'refrigerated_cooked'];
const CONSUME_WITHIN = ['2_hours', 'tonight', '24_hours'];
const ALLERGENS = [
  'None / Allergen-Free', 'Shrimp / Seafood', 'Peanuts / Tree Nuts', 'Dairy',
  'Eggs', 'Gluten / Wheat', 'Pork (Non-Halal)',
];

const schema = new Schema({
  merchantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  municipality: { type: String, trim: true, maxlength: 100, default: 'Iloilo City', index: true },
  barangay: { type: String, trim: true, maxlength: 100, default: 'General Area', index: true },
  address: { type: String, trim: true, maxlength: 300, default: '' },
  photoUrl: { type: String, trim: true, required: true },
  photoPublicId: { type: String, trim: true },
  itemName: { type: String, required: true, trim: true, maxlength: 120 },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  remainingQty: { type: Number, required: true, min: 0, validate: Number.isInteger },
  price: { type: Number, min: 0, required() { return !this.isDonationOnly; } },
  originalPrice: { type: Number, min: 0, default: null },
  isDonationOnly: { type: Boolean, default: false, required: true },
  isFlashDropEnabled: { type: Boolean, default: false },
  isMagicBayong: { type: Boolean, default: false },
  retailValue: { type: Number, min: 0, default: null },
  expiresAt: { type: Date, required: true, index: true },
  safeUntil: { type: Date, required: true, index: true },
  freshnessAttested: { type: Boolean, required: true, default: false },
  storageType: { type: String, enum: STORAGE_TYPES, required: true },
  consumeWithin: { type: String, enum: CONSUME_WITHIN, required: true },
  allergens: { type: [{ type: String, enum: ALLERGENS }], required: true, validate: { validator: (values) => values.length > 0, message: 'Select at least one allergen tag.' } },
  keyIngredients: { type: String, trim: true, maxlength: 100, default: '' },
  ngoPriorityUntil: { type: Date, default: null, index: true },
  status: { type: String, enum: ['active', 'sold_out', 'expired', 'withdrawn', 'flagged'], default: 'active', required: true, index: true },
  reportCount: { type: Number, default: 0, min: 0 },
  spoilageReportCount: { type: Number, default: 0, min: 0 },
  reportNotes: { type: [{ reason: { type: String, enum: ['spoilage', 'general'] }, note: { type: String, trim: true, maxlength: 140 }, reportedAt: { type: Date, default: Date.now } }], default: [] },
  spoilageReportedByDevices: { type: [String], default: [], select: false },
  foodSafetyFlagged: { type: Boolean, default: false, index: true },
  reportedByDevices: { type: [String], default: [], select: false },
}, { timestamps: true, strict: 'throw' });

schema.index({ status: 1, expiresAt: 1, remainingQty: 1 });
schema.pre('validate', function validateInventory() {
  if (this.remainingQty > this.quantity) this.invalidate('remainingQty', 'Remaining quantity cannot exceed original quantity.');
  if (this.isDonationOnly && this.price == null) this.price = 0;
  else if (this.isDonationOnly && this.price !== 0) this.invalidate('price', 'Donation-only batches must be free.');
  if (this.allergens?.includes('None / Allergen-Free') && this.allergens.length > 1) this.invalidate('allergens', 'Allergen-free cannot be combined with other allergen tags.');
  if (this.safeUntil && this.expiresAt && this.safeUntil < this.expiresAt) this.invalidate('safeUntil', 'Food safety time must be at or after the pickup cutoff.');
  if (this.isMagicBayong && (!Number.isFinite(this.retailValue) || this.retailValue <= (this.price || 0))) this.invalidate('retailValue', 'Magic Bayong estimated retail value must be higher than its price.');
});

module.exports = mongoose.model('Batch', schema);
module.exports.STORAGE_TYPES = STORAGE_TYPES;
module.exports.CONSUME_WITHIN = CONSUME_WITHIN;
module.exports.ALLERGENS = ALLERGENS;
