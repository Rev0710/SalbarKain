const mongoose = require('mongoose');
const { Schema } = mongoose;

const authLogSchema = new Schema({
  event: { type: String, enum: ['login_success', 'login_failure', 'register_success', 'register_failure', 'rate_limited', 'suspicious_input'], required: true, index: true },
  result: { type: String, enum: ['success', 'failure', 'blocked', 'suspicious'], required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  emailHash: { type: String, index: true },
  ipHash: { type: String, index: true },
  userAgentHash: { type: String },
  route: { type: String, maxlength: 120 },
  signals: { type: [String], default: [] },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
}, { timestamps: { updatedAt: false }, strict: 'throw' });

authLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authLogSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('AuthLog', authLogSchema);
