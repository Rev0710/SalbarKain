const mongoose = require('mongoose');
const { Schema } = mongoose;

const pointSchema = new Schema({
  type: { type: String, enum: ['Point'], default: 'Point', required: true },
  coordinates: {
    type: [Number], required: true,
    validate: { validator(v) { return v.length === 2 && Number.isFinite(v[0]) && v[0] >= -180 && v[0] <= 180 && Number.isFinite(v[1]) && v[1] >= -90 && v[1] <= 90; }, message: 'Coordinates must be [longitude, latitude] within valid bounds.' },
  },
}, { _id: false });

const userSchema = new Schema({
  role: { type: String, enum: ['merchant', 'ngo', 'admin'], required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, maxlength: 24 },
  storeName: { type: String, trim: true, maxlength: 120, required() { return this.role === 'merchant'; } },
  category: { type: String, enum: ['bakery', 'eatery', 'grocery', 'other'], required() { return this.role === 'merchant'; } },
  address: { type: String, trim: true, maxlength: 300, required: true },
  barangay: { type: String, trim: true, maxlength: 100, required: true, default: 'Unspecified', index: true },
  municipality: { type: String, trim: true, maxlength: 100, required: true, default: 'Unspecified', index: true },
  location: { type: pointSchema, required: true },
  organizationName: { type: String, trim: true, maxlength: 160, required() { return this.role === 'ngo'; } },
  // `verified` remains for existing account compatibility; new KYB uses verificationStatus.
  verified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected', 'suspended'], default: 'pending', index: true },
  assignedMunicipality: { type: String, trim: true, maxlength: 100, default() { return this.role === 'admin' ? 'ALL' : undefined; }, index: true },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 300, select: false },
  verificationDocPublicId: { type: String, select: false },
  verificationDocFormat: { type: String, select: false },
  storefrontPhotoUrl: { type: String, trim: true },
  verificationReviewedAt: { type: Date },
  verificationNote: { type: String, trim: true, maxlength: 300, select: false },
}, { timestamps: true, strict: 'throw' });

userSchema.index({ location: '2dsphere' });
userSchema.pre('validate', function normalizeLegacyVerification() {
  if (this.verified && this.verificationStatus === 'pending') this.verificationStatus = 'verified';
});
module.exports = mongoose.model('User', userSchema);
