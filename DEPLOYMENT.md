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

1. Import the same GitHub repository as a Vercel project. Leave the project root at the repository root so npm can see the workspace lockfile.
2. Set the build command to `npm run build` and output directory to `client/dist`. Use the Node version in `.nvmrc` (22).
3. Add the build-time environment variable `VITE_API_URL=https://<service>.onrender.com/api`. Replace the example with the exact Render service URL. Vite variables are included in public browser code: put only the public API URL here, never Atlas or Cloudinary credentials.
4. Deploy. The root `vercel.json` supplies the SPA rewrite and security headers. Vercel documents the rewrite needed for SPA deep links and project build settings in its [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite).

If you use a custom API domain instead of `*.onrender.com`, add that HTTPS host to the `connect-src` directive in `vercel.json`, commit, and redeploy.

## 3. Verify the deployed app

- Open the Vercel URL, browse the map, and confirm the browser console has no CORS or Content Security Policy errors.
- Visit `https://<service>.onrender.com/api/health`; check that the database is connected and Cloudinary is configured.
- Register a merchant, post a small test batch, claim it as a guest from a phone, and redeem its QR from that merchant account. Delete the test batch afterward.
- Create an NGO account and have an operator verify it in Atlas before testing the donation-only claim path. Public NGO self-registration intentionally does not self-verify.
- The free Render service sleeps when idle, so warm the API before a live judging demo and keep a fallback video or screenshots available.

## Security audit data

Auth events are kept for 90 days in the `authlogs` collection. Successful/failed sign-ins, successful registrations, rate-limited auth requests, and detected injection patterns are recorded with HMAC-pseudonymized email, IP, and user-agent identifiers. Passwords and raw request payloads are not saved. Set a private, random `AUTH_LOG_HMAC_SECRET`; rotating it makes identifiers from older and newer events non-comparable.

MongoDB is a NoSQL database, so SQL injection is not the applicable query attack. The API sanitizes Mongo operator keys, validates scalar auth fields, and records SQL-like payload patterns as security signals. React escapes displayed text by default; the frontend CSP blocks inline scripts and limits image and API origins. Do not add `dangerouslySetInnerHTML` for user-provided content.

## Day 11 integration stress checks

The security suite is intentionally guarded so it cannot run against production or a database whose name does not contain `test`. Set `TEST_MONGODB_URI` to a dedicated replica-set test database, then run:

```sh
npm --workspace server run test:security
```

It races five guest requests against one portion and checks inventory is decremented once, rejects a wrong-merchant QR scan and expired pickup/JWT tokens, confirms claim and auth rate limits, checks injection audit records without stored passwords, and verifies oversized uploads return a structured 413. It deletes only the uniquely created fixtures; auth audit rows are retained for inspection and expire by TTL.
