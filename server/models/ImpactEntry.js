const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true, unique: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  merchantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemName: { type: String, required: true, trim: true, maxlength: 120 },
  storeName: { type: String, required: true, trim: true, maxlength: 120 },
  barangay: { type: String, required: true, trim: true, maxlength: 100, default: 'Unspecified', index: true },
  municipality: { type: String, required: true, trim: true, maxlength: 100, default: 'Unspecified', index: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  foodKg: { type: Number, required: true, min: 0 },
  co2eKg: { type: Number, required: true, min: 0 },
  completedAt: { type: Date, required: true, index: true },
}, { timestamps: true, strict: 'throw' });

schema.index({ completedAt: -1, merchantId: 1 });
schema.index({ municipality: 1, barangay: 1, completedAt: -1 });
module.exports = mongoose.model('ImpactEntry', schema);
