const mongoose = require('mongoose');
const { Schema } = mongoose;

const claimSchema = new Schema({
  qrToken: { type: String, required: true, unique: true, immutable: true, select: false },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  merchantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  claimantUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  isNgoClaim: { type: Boolean, default: false, index: true },
  municipality: { type: String, trim: true, maxlength: 100, default: 'Iloilo City', index: true },
  barangay: { type: String, trim: true, maxlength: 100, default: 'General Area', index: true },
  qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  quantity: { type: Number, min: 1, validate: Number.isInteger },
  priceAtClaim: { type: Number, min: 0, default: 0 },
  totalPrice: { type: Number, min: 0, default: 0 },
  estimatedSavings: { type: Number, min: 0, default: 0 },
  buyerName: { type: String, required: true, trim: true, maxlength: 100 },
  deviceToken: { type: String, required: true, trim: true, maxlength: 100, select: false },
  phone: { type: String, required: true, trim: true, maxlength: 24, select: false },
  safetyAcknowledged: { type: Boolean, required: true, default: false },
  pickupDeadline: { type: Date, required: true, index: true },
  completedAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['pending', 'completed', 'expired', 'cancelled', 'recalled'], default: 'pending', required: true, index: true },
  rating: { type: Number, min: 1, max: 5, default: null },
  reviewComment: { type: String, maxlength: 240, trim: true, default: '' },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

claimSchema.index({ status: 1, pickupDeadline: 1 });
claimSchema.index({ merchantId: 1, status: 1, rating: 1, reviewedAt: -1 });
claimSchema.index({ deviceToken: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending', isNgoClaim: false },
  name: 'one_pending_claim_per_device',
});
claimSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending', isNgoClaim: false },
  name: 'one_pending_claim_per_phone',
});

module.exports = mongoose.model('Claim', claimSchema);
