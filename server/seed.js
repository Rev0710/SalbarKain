require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDatabase = require('./config/db');
const User = require('./models/User');
const Batch = require('./models/Batch');

// Demo map anchors only; replace with a real merchant's verified address and coordinates.
const landmarks = [
  {
    email: 'demo.pavia@salbarkain.test',
    storeName: 'Panaderia de Pavia',
    category: 'bakery',
    address: 'Demo pin near Pavia Public Market, Pavia, Iloilo',
    barangay: 'Poblacion', municipality: 'Pavia',
    coordinates: [122.53703, 10.77197],
    batch: {
      itemName: 'Pandesal rescue pack',
      quantity: 12,
      price: 28,
      isDonationOnly: false,
      storageType: 'room_temp_baked',
      consumeWithin: 'tonight',
      allergens: ['Gluten / Wheat', 'Dairy', 'Eggs'],
      ngoPriorityEnabled: false,
      photo: 'pandesal.svg',
      pickupHours: 4,
    },
  },
  {
    email: 'demo.jaro@salbarkain.test',
    storeName: 'Jaro Plaza Eatery',
    category: 'eatery',
    address: 'Demo pin near Jaro Plaza, Jaro, Iloilo City',
    barangay: 'Jaro', municipality: 'Iloilo City',
    coordinates: [122.557398, 10.724406],
    batch: {
      itemName: 'Pancit molo lunch tubs',
      quantity: 8,
      price: 55,
      isDonationOnly: false,
      storageType: 'refrigerated_cooked',
      consumeWithin: '2_hours',
      allergens: ['Shrimp / Seafood', 'Eggs', 'Gluten / Wheat'],
      ngoPriorityEnabled: false,
      photo: 'soup.svg',
      pickupHours: 3,
    },
  },
  {
    email: 'demo.lapaz@salbarkain.test',
    storeName: 'Iloilo Community Kitchen',
    category: 'eatery',
    address: 'Demo pin near La Paz Public Market, La Paz, Iloilo City',
    barangay: 'La Paz', municipality: 'Iloilo City',
    coordinates: [122.56769, 10.70888],
    batch: {
      itemName: 'Market vegetable bundles',
      quantity: 6,
      price: 0,
      isDonationOnly: true,
      storageType: 'refrigerated_cooked',
      consumeWithin: 'tonight',
      allergens: ['None / Allergen-Free'],
      ngoPriorityEnabled: false,
      photo: 'vegetables.svg',
      pickupHours: 5,
    },
  },
];

if (process.env.NODE_ENV !== 'development') {
  throw new Error('Seed data is development-only. Set NODE_ENV=development before running this script.');
}
if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 10) {
  throw new Error('Set SEED_PASSWORD to a local demo password of at least 10 characters.');
}

async function upsertDemoUser(email, fields) {
  return User.findOneAndUpdate(
    { email },
    { $set: fields, $setOnInsert: { email } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
}

async function seed() {
  await connectDatabase();
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD, 12);
  const demoMerchants = [];

  for (const landmark of landmarks) {
    const merchant = await upsertDemoUser(landmark.email, {
      role: 'merchant',
      name: 'SalbarKain Demo Merchant',
      passwordHash,
      storeName: landmark.storeName,
      category: landmark.category,
      address: landmark.address,
      barangay: landmark.barangay,
      municipality: landmark.municipality,
      location: { type: 'Point', coordinates: landmark.coordinates },
      verified: true,
      verificationStatus: 'verified',
    });
    demoMerchants.push({ landmark, merchant });
  }

  const ngo = await upsertDemoUser('demo.shelter@salbarkain.test', {
    role: 'ngo',
    name: 'SalbarKain Demo Coordinator',
    organizationName: 'Demo Community Pantry',
    passwordHash,
    address: 'Demo pantry pin near Jaro Plaza, Iloilo City',
    barangay: 'Jaro', municipality: 'Iloilo City',
    location: { type: 'Point', coordinates: [122.557398, 10.724406] },
    verified: true,
    verificationStatus: 'verified',
  });

  const admin = await upsertDemoUser('demo.admin@salbarkain.test', {
    role: 'admin', name: 'SalbarKain Demo Admin', passwordHash,
    address: 'Iloilo City, Iloilo', barangay: 'Unspecified', municipality: 'Iloilo City', location: { type: 'Point', coordinates: [122.562, 10.72] },
    assignedMunicipality: 'ALL', verified: true, verificationStatus: 'verified',
  });
  const provincialAdmin = await upsertDemoUser('admin@salbarkain.ph', {
    role: 'admin', name: 'Iloilo Provincial Super-Admin', passwordHash,
    address: 'Iloilo City, Iloilo', barangay: 'City Proper', municipality: 'Iloilo City',
    location: { type: 'Point', coordinates: [122.55, 10.745] },
    assignedMunicipality: 'ALL', verified: true, verificationStatus: 'verified',
  });
  const paviaAdmin = await upsertDemoUser('pavia.lgu@salbarkain.ph', {
    role: 'admin', name: 'Pavia Municipal LGU Admin', passwordHash,
    address: 'Poblacion, Pavia, Iloilo', barangay: 'Poblacion', municipality: 'Pavia',
    location: { type: 'Point', coordinates: [122.53703, 10.77197] },
    assignedMunicipality: 'Pavia', verified: true, verificationStatus: 'verified',
  });
  const pendingApplicant = await upsertDemoUser('demo.pending@salbarkain.test', {
    role: 'merchant', name: 'Pending Demo Applicant', passwordHash,
    storeName: 'Pending Community Bakery', category: 'bakery',
    address: 'Demo applicant pin near Jaro Plaza, Iloilo City',
    barangay: 'Jaro', municipality: 'Iloilo City',
    location: { type: 'Point', coordinates: [122.558, 10.724] },
    verified: false, verificationStatus: 'pending',
  });

  const now = Date.now();
  for (const { landmark, merchant } of demoMerchants) {
    const batch = landmark.batch;
    await Batch.findOneAndUpdate(
      { merchantId: merchant._id, itemName: batch.itemName },
      {
        $set: {
          merchantId: merchant._id,
          itemName: batch.itemName,
          quantity: batch.quantity,
          remainingQty: batch.quantity,
          price: batch.price,
          isDonationOnly: batch.isDonationOnly,
          storageType: batch.storageType,
          consumeWithin: batch.consumeWithin,
          allergens: batch.allergens,
          keyIngredients: batch.keyIngredients || 'Wheat, egg, milk',
          safeUntil: new Date(now + (batch.pickupHours + 2) * 60 * 60 * 1000),
          freshnessAttested: true,
          isFlashDropEnabled: false,
          isMagicBayong: false,
          originalPrice: batch.isDonationOnly ? null : Number((batch.price * 1.4).toFixed(2)),
          retailValue: null,
          ngoPriorityUntil: null,
          expiresAt: new Date(now + batch.pickupHours * 60 * 60 * 1000),
          photoUrl: `/demo-images/${batch.photo}`,
          status: 'active',
          reportCount: 0,
          reportedByDevices: [],
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  console.log('Development demo data is ready.');
  console.log('Merchants:', demoMerchants.map(({ landmark }) => landmark.email).join(', '));
  console.log('Verified NGO:', ngo.email);
  console.log('Admin:', admin.email);
  console.log('Provincial Super-Admin:', provincialAdmin.email);
  console.log('Pavia Municipal Admin:', paviaAdmin.email);
  console.log('Pending applicant:', pendingApplicant.email);
  console.log('Local demo password: the value configured in SEED_PASSWORD');
}

seed()
  .catch((error) => {
    console.error('Unable to seed local data:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
