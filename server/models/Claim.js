const mongoose = require('mongoose');
const { Schema } = mongoose;

const claimSchema = new Schema({
  qrToken: { type: String, required: true, unique: true, immutable: true, select: false },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  merchantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  buyerName: { type: String, required: true, trim: true, maxlength: 100 },
  deviceToken: { type: String, required: true, trim: true, maxlength: 100, select: false },
  phone: { type: String, required: true, trim: true, maxlength: 24, select: false },
  pickupDeadline: { type: Date, required: true, index: true },
  status: { type: String, enum: ['pending', 'completed', 'expired', 'cancelled'], default: 'pending', required: true, index: true },
}, { timestamps: true, strict: 'throw' });

claimSchema.index({ status: 1, pickupDeadline: 1 });
claimSchema.index({ deviceToken: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending' },
  name: 'one_pending_claim_per_device',
});
claimSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending' },
  name: 'one_pending_claim_per_phone',
});

module.exports = mongoose.model('Claim', claimSchema);
