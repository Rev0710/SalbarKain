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
    storeName: 'Demo Bakery near Pavia Public Market',
    category: 'bakery',
    address: 'Demo pin near Pavia Public Market, Pavia, Iloilo',
    coordinates: [122.53703, 10.77197],
    batch: {
      itemName: 'Pandesal rescue pack',
      quantity: 12,
      price: 28,
      isDonationOnly: false,
      photo: 'pandesal.svg',
      pickupHours: 4,
    },
  },
  {
    email: 'demo.jaro@salbarkain.test',
    storeName: 'Demo Eatery near Jaro Plaza',
    category: 'eatery',
    address: 'Demo pin near Jaro Plaza, Jaro, Iloilo City',
    coordinates: [122.557398, 10.724406],
    batch: {
      itemName: 'Pancit molo lunch tubs',
      quantity: 8,
      price: 55,
      isDonationOnly: false,
      photo: 'soup.svg',
      pickupHours: 3,
    },
  },
  {
    email: 'demo.lapaz@salbarkain.test',
    storeName: 'Demo Produce Stall near La Paz Market',
    category: 'grocery',
    address: 'Demo pin near La Paz Public Market, La Paz, Iloilo City',
    coordinates: [122.56769, 10.70888],
    batch: {
      itemName: 'Market vegetable bundles',
      quantity: 6,
      price: 0,
      isDonationOnly: true,
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
    { $setOnInsert: { email, ...fields } },
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
      location: { type: 'Point', coordinates: landmark.coordinates },
    });
    demoMerchants.push({ landmark, merchant });
  }

  const ngo = await upsertDemoUser('demo.shelter@salbarkain.test', {
    role: 'ngo',
    name: 'SalbarKain Demo Coordinator',
    organizationName: 'Demo Community Pantry',
    passwordHash,
    address: 'Demo pantry pin near Jaro Plaza, Iloilo City',
    location: { type: 'Point', coordinates: [122.557398, 10.724406] },
    verified: true,
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
          expiresAt: new Date(now + batch.pickupHours * 60 * 60 * 1000),
          photoUrl: `http://localhost:5173/demo-images/${batch.photo}`,
          status: 'active',
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  console.log('Development demo data is ready.');
  console.log('Merchants:', demoMerchants.map(({ landmark }) => landmark.email).join(', '));
  console.log('Verified NGO:', ngo.email);
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
