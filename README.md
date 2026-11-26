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

- `POST /api/auth/register` — multipart KYB application for only `merchant` or `ngo`; permit upload is private and the account starts pending. Merchants and NGOs provide a street address, barangay, municipality/city, and map-selected GeoJSON point.
- `POST /api/auth/login` — returns a 7-day bearer JWT.
- `PATCH /api/auth/verification` — authenticated pending/rejected partners can submit or replace permit documents for review.
- `POST /api/batches` — verified-merchant-only multipart upload with a freshness attestation, a safe-until time, storage/allergen tags, optional 15-minute NGO priority, dynamic last-30-minute flash discount, Magic Bayong metadata, or an owned `restockBatchId`.
- `GET /api/batches/my-history` — verified merchant’s previous batches for one-click photo/tag restocking.
- `GET /api/batches?lat=...&lng=...` — active nearby batches, including free NGO-only donations; claims on those donations remain restricted to verified NGOs.
- `PATCH /api/batches/:id/report` — pseudonymized general reports (hidden after 3 unique devices) or spoilage reports (hidden after 2); hidden listings appear in the admin review queue.
- `POST /api/claims` — guest or verified NGO claim with `batchId`, `qty`, `buyerName`, `phone`, `deviceToken`, and required safety acknowledgement; returns the QR token and 45-minute pickup deadline.
- `PATCH /api/claims/:qrToken/verify` — verified merchant-only pickup verification; completion and impact ledger entry are atomic.
- `GET /api/stats/meals-saved` — completed pickup portions for the live navbar count.
- `GET /api/stats/impact?municipality=...&barangay=...` — global or area-filtered meal packs rescued, food kilograms saved, and CO₂e diverted.
- `GET /api/impact/export?municipality=...&barangay=...` — admin-only CSV export for MENRO reporting, with optional exact municipality and barangay filters.
- `POST /api/impact/mine` — returns a role-specific rescue tier and savings totals; guest lookups require both the saved phone and device token.
- `GET /api/impact/heatmap?municipality=...&barangay=...` — admin-only rescue and current surplus points with optional area filters.
- `GET /api/health` — API and configuration status.
- `/api/admin/verifications` and `/api/admin/flagged-batches` — admin-only review queues; permit links are short-lived and admin-only.

Auth requests are limited to 10 per IP per 15 minutes. Claim and verification requests are limited to 5 per IP per 15 minutes. A pending claim is unique by device token and normalized Philippine mobile number. The stock decrement and claim insert run in one MongoDB transaction; partial unique indexes enforce the one-pending-claim rule. Every 60 seconds, the worker expires unredeemed claims and restores their stock, then marks past-cutoff active or sold-out batches expired.

## Development seed

Set `SEED_PASSWORD` in `server/.env` to a local password of at least 10 characters, then run from the repository root:

```sh
npm --workspace server run seed
```

Seeding is blocked unless `NODE_ENV=development`. It creates synthetic pre-verified stores near Pavia Public Market, Jaro Plaza, and La Paz Public Market, a verified demo shelter, a demo admin, a pending applicant, and sample batches with local SVG photos. Landmark pins are approximate demo centers, not actual merchant addresses. Re-running refreshes sample quantities and pickup cutoffs.

The client is an installable PWA. It caches the app shell, public food photos, and visited OpenStreetMap tiles. A current QR pass is stored on-device until its 45-minute pickup deadline so it can reopen offline; API responses and buyer personal details are not service-worker cached. Marketplace discovery uses the visitor’s geolocation when allowed and lists recent batches across areas otherwise. `/how-it-works` and `/about` are public pages. Flash Drop pricing is recalculated by the API at claim time; Magic Bayong safety tags are shown before the mandatory buyer acknowledgment. Merchant, NGO, and buyer rescue badges are available from My Impact; eligible merchants can download a PDF certificate.

The seeded admin emails are `demo.admin@salbarkain.test` (provincial scope), `admin@salbarkain.ph` (provincial scope), and `pavia.lgu@salbarkain.ph` (Pavia scope); all seeded accounts use the local `SEED_PASSWORD`. Sign in through the normal partner login; admins are routed to `/admin`. The pending seed applicant has no permit attached, so it can be rejected but cannot be approved until a document is uploaded. Seeded admin passwords are not hard-coded into the app; use the private seed password you configured.

The `/admin` command center provides jurisdiction-scoped overview KPIs and heatmap, KYB review, flagged listing actions, MENRO barangay CSV export, and partner recognition. Only an `ALL` provincial admin can create municipality-scoped admin accounts. Public registration continues to allow merchant and NGO roles only.

For Render, set `TRUST_PROXY=1` and set `CLIENT_ORIGINS` to the deployed Vercel origin. Add JWT, database, and media credentials as Render environment variables. These integrations use free tiers; provider accounts and credentials must be configured by the project owner.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel + Render workspace settings, CSP/API origin setup, free-tier limitations, and the guarded Day 11 integration stress suite. Authentication and suspicious-input audit events are written to MongoDB's `authlogs` collection; identifiers are HMAC-pseudonymized and passwords/request payloads are not stored. React-rendered text remains escaped, Mongo operators are sanitized, and Vercel serves the frontend with a restrictive Content Security Policy.
