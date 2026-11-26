# Deploy SalbarKain for free

The frontend is a Vite single-page app for Vercel. The API is an Express web service for Render. MongoDB Atlas and Cloudinary remain the persistent data and image services; no secrets belong in the Vite app.

## 1. Deploy the API to Render

1. Push this repository to GitHub and connect it in the Render Dashboard with **New → Blueprint**. The root `render.yaml` defines the Node web service, health check, and free compute plan. You can also create a Web Service manually with the repository root as the root directory, build command `npm ci`, and start command `npm run start --workspace server`.
2. In the new service’s environment settings, add:
   - `MONGODB_URI`: a MongoDB Atlas M0 URI using a dedicated least-privilege application database user.
   - `CLIENT_ORIGINS`: the exact Vercel production origin, for example `https://salbarkain.vercel.app` (no trailing slash). Add comma-separated preview origins only if needed.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from the Cloudinary dashboard.
   - Keep `JWT_SECRET` and `AUTH_LOG_HMAC_SECRET` as separate generated secrets. The Blueprint creates random values; keep them private.
3. In MongoDB Atlas Network Access, permit Render to reach the cluster. Render free outbound IPs are not static; use an allow-all entry only for this app’s dedicated DB user and database, with a long random password, and never reuse an administrator account.
4. Wait for the service health check at `/api/health`. Copy its `https://<service>.onrender.com` origin for the frontend.

Render’s free web services sleep after 15 minutes without inbound traffic and the next request can take about a minute to wake. Their local filesystem is ephemeral, so this app uploads photos to Cloudinary rather than storing them on Render. The 60-second expiry worker runs only while the API process is awake; its startup sweep catches up after a wake. [Render free-service limits](https://render.com/docs/free)

## 2. Deploy the frontend to Vercel

1. Import the same GitHub repository as a Vercel project. The recommended project root is the repository root so npm can see the workspace lockfile. If the Vercel project uses `client` as its root instead, `client/vercel.json` provides the SPA rewrite and security headers for that setup too.
2. Set the build command to `npm run build` and output directory to `client/dist`. Use the Node version in `.nvmrc` (22).
3. Add the build-time environment variable `VITE_API_URL=https://<service>.onrender.com/api`. Replace the example with the exact Render service URL. Vite variables are included in public browser code: put only the public API URL here, never Atlas or Cloudinary credentials.
4. Deploy. The root `vercel.json` supplies the SPA rewrite and security headers. Vercel documents the rewrite needed for SPA deep links and project build settings in its [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite).

If you use a custom API domain instead of `*.onrender.com`, add that HTTPS host to the `connect-src` directive in `vercel.json`, commit, and redeploy.

## 3. Verify the deployed app

- Open the Vercel URL, browse the map, and confirm the browser console has no CORS or Content Security Policy errors.
- Visit `https://<service>.onrender.com/api/health`; check that the database is connected and Cloudinary is configured.
- Register a merchant, post a small test batch, claim it as a guest from a phone, and redeem its QR from that merchant account. Delete the test batch afterward.
- Create an NGO account and have an operator verify it in Atlas before testing the donation-only claim path. Public NGO self-registration intentionally does not self-verify.
- To exercise KYB, submit a registration with a permit image/document, sign in through the normal partner login with `admin@salbarkain.ph` plus your private `SEED_PASSWORD`, then open `/admin` and review it in the jurisdiction-filtered queue. The Pavia-scoped account is `pavia.lgu@salbarkain.ph`; both seed accounts use the configured `SEED_PASSWORD`. Permit files are Cloudinary private assets and only admins in the applicant’s municipality receive a short-lived document link.
- Seed accounts into hosted Atlas by running the guarded seed script locally with `NODE_ENV=development`, `MONGODB_URI` set to the same Atlas database as Render, and a private `SEED_PASSWORD`. Render remains in `NODE_ENV=production`.
- The optional one-click demo-fill pills appear only when `VITE_DEMO_LOGIN_PASSWORD` is set in the client build and fills the seeded provincial/Pavia admin email plus that password. Vite embeds this value in public JavaScript, so enable it only for a disposable hackathon demo database; do not use it for real partner data.
- Existing accounts migrated into KYB can upload their permit from the pending workspace; their existing login remains valid while their review is pending.
- A free NGO donation appears in the public marketplace but its claim action opens partner sign-in; only a verified NGO session can reserve it.
- Install the PWA from the browser’s install option before testing poor-connectivity pickup. The service worker caches the built app shell and eligible public photo/map assets. A newly issued pickup pass remains in device storage for offline QR display until its deadline; claim and merchant scan requests still require a network connection.
- Merchant batch posting now requires a same-day safety attestation and a `safeUntil` cutoff no earlier than the pickup cutoff. Batch creation enforces a 15-minute minimum pickup window; claims and scans reject food after either cutoff. Food-safety reports hide a listing after two unique devices; general reports use three.
- Registration now requires a barangay and municipality/city and offers an OpenStreetMap pin picker, plus the browser’s current-location button. Marketplace proximity sorting requests browser geolocation when available; if denied, it shows recent listings across areas. `/how-it-works` and `/about` are public deep links handled by the Vercel SPA rewrite.
- The live impact ticker can query municipality and barangay totals. Admin CSV exports accept optional exact municipality and barangay filters; the admin heatmap can apply the same area filters.
- Merchants can enable the last-30-minute 50% Flash Drop and Surprise Magic Bayong fields. Flash prices are recalculated by the API at claim time, including free flash portions for verified NGOs. `leaflet.heat` and `jspdf` are bundled from npm; no new paid API or environment key is needed.
- My Impact shows buyer tiers, merchant/NGO milestones, and declared savings. Eligible merchants can download the zero-waste certificate; the admin dashboard can open the rescue and surplus heatmap. Guest personal totals require the same normalized phone and device token used during claiming.
- Completed scans write one impact-ledger row in the same database transaction as claim completion. The ticker estimates 0.5 kg food rescued and 1.25 kg CO₂e diverted per meal pack; an admin can download the MENRO CSV from Admin workspace.
- To create the demo admin and sample stores in the hosted Atlas database, run the seed command locally with `NODE_ENV=development`, `MONGODB_URI` pointing at the intended database, and a private `SEED_PASSWORD`; the deployed Render service should remain `NODE_ENV=production`.
- The free Render service sleeps when idle, so warm the API before a live judging demo and keep a fallback video or screenshots available.

## Security audit data

Auth events are kept for 90 days in the `authlogs` collection. Successful/failed sign-ins, successful registrations, rate-limited auth requests, and detected injection patterns are recorded with HMAC-pseudonymized email, IP, and user-agent identifiers. Passwords and raw request payloads are not saved. Set a private, random `AUTH_LOG_HMAC_SECRET`; rotating it makes identifiers from older and newer events non-comparable.

MongoDB is a NoSQL database, so SQL injection is not the applicable query attack. The API sanitizes Mongo operator keys, validates scalar auth fields, and records SQL-like payload patterns as security signals. React escapes displayed text by default; the frontend CSP blocks inline scripts and limits image and API origins. Do not add `dangerouslySetInnerHTML` for user-provided content.

## Day 11 integration stress checks

The security suite is intentionally guarded so it cannot run against production or a database whose name does not contain `test`. Set `TEST_MONGODB_URI` to a dedicated replica-set test database, then run:

```sh
npm --workspace server run test:security
```

It races five guest requests against one portion and checks inventory is decremented once, rejects unverified merchant posting and non-NGO donation claims, hides a listing after three unique reports, rejects a wrong-merchant QR scan and expired pickup/JWT tokens, confirms claim and auth rate limits, checks injection audit records without stored passwords, and verifies oversized uploads return a structured 413. It deletes only the uniquely created fixtures; auth audit rows are retained for inspection and expire by TTL.
