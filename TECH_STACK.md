# SalbarKain Tech Stack

## Application Architecture

- **Architecture:** MERN monorepo with separate `client` and `server` workspaces
- **Runtime:** Node.js `>=20.19.0` (Node 22 LTS recommended)
- **Package management:** npm workspaces

## Frontend

- **Framework:** React 19
- **Build tool and dev server:** Vite 7
- **Styling:** Tailwind CSS 4 with the Vite plugin; custom CSS for the SalbarKain design system
- **Routing:** React Router 7
- **HTTP client:** Axios
- **Maps:** Leaflet 1.9, React Leaflet 5, Leaflet.heat; OpenStreetMap tiles
- **QR generation:** `qrcode.react`
- **QR scanning:** `html5-qrcode`
- **Image compression:** `browser-image-compression`
- **PDF certificates:** `jspdf`
- **Animation:** Anime.js
- **Installable/offline app:** Progressive Web App with `vite-plugin-pwa` and Workbox service-worker caching
- **Browser capabilities:** Geolocation, camera access, Local Storage, Session Storage, and Clipboard API

## Backend

- **Runtime:** Node.js
- **Web framework:** Express 4
- **Database object modeling:** Mongoose 8
- **Authentication:** JSON Web Tokens (`jsonwebtoken`)
- **Password hashing:** `bcryptjs`
- **Image and document upload handling:** Multer 2
- **Image/document hosting:** Cloudinary
- **In-memory response cache:** `node-cache`
- **Security middleware:** Helmet, CORS, `express-mongo-sanitize`, `express-rate-limit`
- **Configuration:** `dotenv`
- **Audit identifier privacy:** HMAC-based pseudonymization using Node.js crypto APIs
- **Background processing:** Node.js interval worker for claim and batch expiry

## Data and Domain Services

- **Database:** MongoDB Atlas M0 shared cluster
- **Database features:** GeoJSON points and `2dsphere` indexes, geospatial queries, transactions, aggregation pipelines, and partial unique indexes
- **Image storage:** Cloudinary free tier
- **Map data and tiles:** OpenStreetMap
- **Impact reporting:** MongoDB aggregation and CSV export

## Hosting and Deployment

- **Frontend hosting:** Vercel
- **API hosting:** Render Web Service
- **API health monitoring:** Express `/api/health` endpoint and Render health check
- **Environment configuration:** Vercel and Render environment variables; local `.env` files for development

## Security and Privacy

- JWT-protected role-based routes for merchants, NGOs, and administrators
- `bcryptjs` password hashing
- Helmet security headers and a Content Security Policy
- Strict CORS origin allowlist
- MongoDB operator sanitization
- IP-based rate limiting
- Multer file-size and MIME-type validation
- HMAC-pseudonymized authentication/security audit identifiers
- React text escaping for user-generated content

## Developer Tooling

- **Concurrent monorepo development:** `concurrently`
- **Automatic server restart:** `nodemon`
- **Frontend production build:** Vite
- **Security integration checks:** Node.js built-in test runner (`node:test`)
- **Lockfile:** npm `package-lock.json`

## Future Development Baseline

- **Web client and dashboards:** React, React Router, Tailwind CSS, and Vite
- **Maps and location:** React Leaflet, Leaflet heatmaps, OpenStreetMap, and browser geolocation
- **API and persistence:** Express, Mongoose, and MongoDB Atlas
- **Authentication and application security:** JWT, bcryptjs, Helmet, CORS, Mongo sanitization, and rate limiting
- **Food photos and verification documents:** Multer and Cloudinary
- **Pickup and counter operations:** `qrcode.react` and `html5-qrcode`
- **Offline support and media performance:** PWA/Workbox caching and browser image compression
- **Reports and recognition certificates:** CSV export and jsPDF
- **Hosting model:** Vercel frontend and Render API on free tiers
