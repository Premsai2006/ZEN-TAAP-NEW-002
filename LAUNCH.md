# ZenTaap — Production Launch Checklist

This file is the operator's runbook for taking ZenTaap from preview to production.
Every item here must be done **before** you announce the launch.

---

## 1. Backend `.env` (production values)

Replace the dev `.env` at `/app/backend/.env` with the production block below.
**Never commit secrets to git** — use your platform's secret manager (Render / Railway / Fly / AWS Secrets Manager).

```env
# Mongo
MONGO_URL="mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true"
DB_NAME="zentaap_prod"

# CORS — Comma-separated list of EXACT allowed origins. NO wildcards in prod.
CORS_ORIGINS="https://app.zentaap.com,https://www.zentaap.com"

# Production toggle — when "false", demo_otp is NOT returned by /auth/request-otp
# and CORS_ORIGINS="*" is rejected (we fail-close to localhost).
DEMO_MODE="false"

# Razorpay — paste your LIVE keys from https://dashboard.razorpay.com/app/keys
RAZORPAY_KEY_ID="rzp_live_xxxxxxxxxx"
RAZORPAY_KEY_SECRET="xxxxxxxxxxxxxxxxxxxxxxxx"
RAZORPAY_WEBHOOK_SECRET="xxxxxxxxxxxxxxxxxxxxxxxx"
RAZORPAY_PAYMENT_LINK=""    # leave empty in prod — the in-app checkout takes over

# Frontend QR domain — used inside QR codes
ZENTAAP_QR_DOMAIN="https://zentaapqr.com"
```

**Razorpay webhook URL** to register in Razorpay Dashboard → Settings → Webhooks:
`https://api.zentaap.com/api/payments/webhook` (event: `payment.captured`, `subscription.charged`)

## 2. Frontend `.env`

`/app/frontend/.env`:
```env
REACT_APP_BACKEND_URL="https://api.zentaap.com"
```

## 3. Database

After deploy, seed exactly **one** restaurant via the signup screen — backend no longer
seeds demo categories / menu / orders. Existing data is preserved.

Set the **kitchen PIN** under Manager → Settings → Kitchen Display PIN. Customers no
longer have a PIN — anyone scanning a QR can order.

## 4. Authentication

Manager APIs are protected by `Authorization: Bearer <token>` from `/api/auth/login`.
Front-end attaches the token automatically via the axios interceptor.

A 4-device cap is enforced; LRU device is evicted on the 5th login.

## 5. Subscription gating

Managers without an active subscription enter **Explore Mode**:
they can browse the dashboard, but all "use" endpoints return HTTP 402
and the frontend surfaces a toast + redirects them to `/subscribe`.

## 6. Builds

Frontend (CRA): `cd /app/frontend && yarn install && yarn build`
Backend:        `cd /app/backend && pip install -r requirements.txt && uvicorn server:app`

Lock files in place:
- `/app/frontend/yarn.lock` ✅
- `/app/backend/requirements.txt` ✅

## 7. Cutover

1. Deploy backend with the env vars above.
2. Deploy frontend pointing at the live backend URL.
3. Point `app.zentaap.com` + `zentaapqr.com` DNS.
4. Sign up the first manager, set the Kitchen PIN, set the subscription tables count.
5. Print QR codes from Manager → Tables → Print all QRs and place at every table.
6. Done — launch! 🚀
