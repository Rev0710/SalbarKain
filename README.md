# SalbarKain — Local Surplus Food Rescue

Free-stack MERN monorepo for local merchants, residents, and verified NGOs.

## Start locally

Requires Node.js 20.19+ (Node 22 LTS recommended). Copy `server/.env.example` to `server/.env`; set your Atlas M0 URI, a unique JWT secret of at least 32 characters, and Cloudinary credentials. Copy `client/.env.example` to `client/.env`. From the repository root run:

```sh
npm install
npm run dev
```

Client: http://localhost:5173 · API health: http://localhost:5000/api/health.

Never commit `.env` files. Create an Atlas Shared M0 cluster and database user. Allow your current IP for local work, copy the driver URI into `MONGODB_URI`, replace placeholders, and URL-encode reserved password characters. Atlas replica-set transactions keep inventory and claims consistent. In Cloudinary's free dashboard, copy cloud name, API key, and API secret into the matching server variables. Keep the secret server-side.

## API routes

- `POST /api/auth/register` — creates only a `merchant` or `ngo` account; NGOs start unverified.
- `POST /api/auth/login` — returns a 7-day bearer JWT.
- `POST /api/batches` — merchant-only multipart upload with a `photo` image and batch fields.
- `GET /api/batches?lat=...&lng=...` — active nearby batches, ordered by merchant distance; without coordinates, batches sort by pickup cutoff.
- `POST /api/claims` — guest claim with `batchId`, `qty`, `buyerName`, `phone`, and `deviceToken`; returns the QR token and 45-minute pickup deadline.
- `PATCH /api/claims/:qrToken/verify` — merchant-only pickup verification.
- `GET /api/stats/meals-saved` — completed pickup portions for the live navbar count.
- `GET /api/health` — API and configuration status.

Auth requests are limited to 10 per IP per 15 minutes. Claim and verification requests are limited to 5 per IP per 15 minutes. A pending claim is unique by device token and normalized Philippine mobile number. The stock decrement and claim insert run in one MongoDB transaction; partial unique indexes enforce the one-pending-claim rule. Every 60 seconds, the worker expires unredeemed claims and restores their stock, then marks past-cutoff active or sold-out batches expired.

## Development seed

Set `SEED_PASSWORD` in `server/.env` to a local password of at least 10 characters, then run from the repository root:

```sh
npm --workspace server run seed
```

Seeding is blocked unless `NODE_ENV=development`. It creates synthetic merchants near Pavia Public Market, Jaro Plaza, and La Paz Public Market, a verified demo shelter, and sample batches with local SVG photos. Landmark pins are approximate demo centers, not actual merchant addresses. Re-running refreshes sample quantities and pickup cutoffs.

For Render, set `TRUST_PROXY=1` and set `CLIENT_ORIGINS` to the deployed Vercel origin. Add JWT, database, and media credentials as Render environment variables. These integrations use free tiers; provider accounts and credentials must be configured by the project owner.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel + Render workspace settings, CSP/API origin setup, free-tier limitations, and the guarded Day 11 integration stress suite. Authentication and suspicious-input audit events are written to MongoDB's `authlogs` collection; identifiers are HMAC-pseudonymized and passwords/request payloads are not stored. React-rendered text remains escaped, Mongo operators are sanitized, and Vercel serves the frontend with a restrictive Content Security Policy.
