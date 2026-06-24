# TableTap — Manager Dashboard PRD

## Original Problem Statement
The user supplied a reference HTML file of a Manager Dashboard (`manager-dashboard (1).html`) and requested 6 changes scoped to the **Manager Dashboard only**:

1. **Not Available** option in manager dashboard — must reflect on the customer order view as "dish not available".
2. **Auto-refresh** every 1 second.
3. **Change food item image** — manager can attach a fresh image when adding/editing a dish.
4. **Categories** — add new + remove existing/previously-added categories.
5. **Login PIN** — numeric, up to 10 digits.
6. **Logout button** below "Sales Today" with confirmation dialog "Do you want to logout?" with **YES / NO**.

## Architecture
- **Frontend**: React (CRA + craco), Sonner toasts, shadcn AlertDialog, lucide-react icons, custom dark+gold theme inspired by reference HTML.
- **Backend**: FastAPI + Motor (MongoDB). All routes prefixed `/api`. Pydantic models with `_id` excluded.
- **Storage**: MongoDB collections — `menu_items`, `categories`, `orders`, `settings`. Images stored as base64 data URLs in `menu_items.image_url`.
- **Auth**: Numeric PIN compared server-side; opaque token stored in `localStorage` gates `/manager`.

## Personas
- **Manager** — primary user; logs in with PIN, manages menu & categories, monitors live orders.
- **Customer** — views menu at `/customer` (no auth) and sees "Not Available" badges in real-time.

## Implemented (2026-02 / first finish)
- PIN login with numeric-only, 10-digit cap (`Login.jsx`), default PIN `123456`.
- Manager dashboard with 4 sidebar sections: Live Orders / Tables / Menu Mgmt / Sales Today.
- Live Orders: stats cards, status filter tabs, status-progression button (`new → cooking → done → delivered`).
- Tables: 15-table grid with occupied/empty + amount.
- Menu Management:
  - Categories CRUD chip-list with add input + ✕ remove.
  - Add/Edit dialog with name, price, category, emoji, image URL **and** file upload (base64, max 1.8 MB) with live preview.
  - Per-item: **Mark Not Available / Mark Available**, Edit, Delete.
- Sales Today: revenue, completed orders, most-ordered, top-items table, **Logout box** with red Logout button.
- Sidebar Logout entry + Sales Logout button → shadcn AlertDialog "Do you want to logout?" with **YES / NO**.
- Customer view at `/customer`: menu grid, category filter, "Not Available" badge for unavailable items, 1s polling.
- 1-second auto-refresh on every section via `useInterval`.
- Seed: 6 categories, 10 menu items, 6 demo orders, settings PIN `123456`.

## Iteration 2 (2026-02-07) — 8 Manager Dashboard changes
1. **Removed category dropdown + emoji input** from Add Item form (form now: Name + Price + Photos only).
2. **Cancel button** added to the form (top-right and bottom) — clears in-progress add or exits edit mode.
3. **Sidebar labels** always visible alongside icons (Live Orders, Tables, Menu Management, Sales Today, Settings) — removed the mobile collapse-to-icons CSS.
4. **Clock** in topbar trimmed to `HH:MM am/pm` (no seconds).
5. **Generate Bill** button on every order → opens `BillModal` with restaurant branding, itemized lines, CGST+SGST split of GST rate, total. Uses `window.print()` so it works on any printer (browser default → thermal). `@media print` CSS hides everything except `.bill-print`, sized to 80mm.
6. **Multi-image upload (max 4 photos)** per menu item, stored as `images: [data-url, …]` on the backend (`MenuItem.images`); UI shows thumbnails with × remove.
7. **Login counter `0/10 digits` removed.**
8. **Settings page** (new sidebar entry):
   - Bill branding: restaurant name, phone, address, logo upload (printed at top of every bill).
   - Tax/GST: GST number (printed on bills) + GST rate select (0%, 5%, 12%, 18%).
   - Printer setup: paper-width select (browser / thermal-58mm / thermal-80mm) + step-by-step thermal-printer connection instructions.
   - Persists via `GET/PUT /api/settings`; bill modal auto-reflects updates within 1s polling.

## Verified Tests (iteration_2.json)
- Backend pytest 19/19 (100%): existing 13 + new tests for `/api/settings` GET/PUT, `MenuItem.images` backfill, optional category/emoji, multi-image PUT.
- Frontend Playwright 18/18 (100%): all 8 changes verified end-to-end.

## Iteration 3-5 (2026-02 — Rebrand + Sales + Per-Table Pricing)
- **Rebrand**: TableTap → **TableTaap**, custom logo with white card background, removed sparkle emojis.
- **Theme**: Dark/Light theme provider (`lib/theme.js`), persists via `localStorage tt_theme`, topbar toggle.
- **Orders**: Today's Sales card with eye-toggle (mask revenue as `₹••••`); Bill modal adds **WhatsApp share** (`wa.me` redirect with formatted bill); removed Pending Orders KPI.
- **Menu**: Inline category management consolidated inside "Add New Item" panel (add/rename/delete inline). Availability toggle per item.
- **Sales**: Switched LineChart → **AreaChart** with custom Y-axis tick formatter (0, 5k, 10k, 15k…). Stat cards now show **7-day growth %** (revenue/orders/completed/AOV). Top selling items show item images.
- **Settings**: Bill branding, GST number+rate, printer paper-width, manager profile fields.
- **Profile**: Editable manager name + restaurant + contact + email.
- **Subscription (replaced 3-tier Core/Prime/Elite)** with **Per-Table Pricing Calculator** at `/subscribe`:
  - Slider 10–60 tables (default 14), formula: ₹299 base + ₹50 × tables + 18% GST.
  - 4-day FREE trial, QR codes per table, payment method (UPI default), endpoints `GET/POST /api/subscription`.
- **Settings useEffect lint fix (iter-5)**: simplified deps to `[settings]`, removed unused `eslint-disable` directive, no regression.

## Iteration 6 (2026-02-10) — 8 UX refinements
1. **Sales chart X-axis** shows Month + Date (`12 Jun`) instead of just weekday — backend `/stats/revenue?period=week` now emits `label="DD Mon"` and a separate `weekday` field.
2. **Top-right header clock** shows `Mon DD · HH:MM AM/PM` (e.g., `Jun 10 · 07:34 PM`).
3. **Growth pills** use **triangle glyphs** (▲ / ▼) instead of lucide TrendingUp/Down icons. New CSS class `.growth-tri`.
4. **Profile → Subscription summary card**: compact view with status pill (FREE TRIAL / ACTIVE), Tables count, Monthly Bill (incl. GST), Trial-end/Next-cycle date, and **Change Subscription** button → routes to `/subscribe`. NOT the full calculator embedded.
5. **Deferred subscription change**: backend `POST /api/subscription` is now a state machine:
   - `applied:"immediate"` when first-time / `status` is none/skipped → creates trial, sets `cycle_start` & `next_cycle_start` (~30d).
   - `applied:"next_cycle"` when an active/trial sub exists and `tables` differs → saves to `pending_tables/pending_subtotal/pending_total`; current cycle remains unchanged. Backfills `cycle_start`/`next_cycle_start` for legacy subs that lacked them.
   - `applied:"no_change"` when `tables` matches existing → clears pending, may update payment_method.
   - GET returns: tables, total, status, trial_*, **pending_tables, pending_total, cycle_start, next_cycle_start**.
   - Subscribe UI shows a `sub-change-notice` banner, pre-fills slider with current tables, and rewrites CTA to "Schedule change to N tables · effective <date>" when a change is pending.
6. **Tables dashboard** occupied state uses a gold gradient + soft glow; empty state uses a dashed muted border. Visually distinct.
7. **Signup logo** now wrapped in `.brand-logo-wrap` (white background card) for consistent branding.
8. **Profile email** field labeled `(optional)` and saves with empty email.

## Verified Tests (iteration_5.json)
- Backend pytest **6/6 iter6** + 16/17 iter5 regression (1 expected schema change). 

## Iteration 7 (2026-02-13) — Customer cart + Kitchen + Subscription gating
- **Login page**: Customer Menu + Kitchen Display as prominent colored cards (gold/green) below the form.
- **Customer dashboard PIN gate** (4–6 digits, separate from Manager PIN, default `1234`, changeable via Manager Settings → "Customer Menu PIN").
- **Customer cart**: +/- qty stepper, drawer, table number input, place-order POSTs `/api/orders`.
- **Kitchen Display** at `/kitchen` — open access, live ticket board, 1s auto-refresh, status advance buttons.
- **Subscription explore-mode** banner appears across Manager when status is `none`/`skipped`.
- **Subscription** trial banner copy: "You won't be charged for the 4 days. Trial ends on <date>".
- **Realistic payment brand badges** on all 4 methods.
- **Subscription cycle dates** (Started + Ends) shown in both Subscribe page and Profile section.
- Backend: `customer_pin` field on RestaurantSettings; `POST /api/auth/customer-login`, `GET/PUT /api/settings/customer-pin`.

## Iteration 8 (2026-02-13) — OTP recovery + UX polish
- **OTP PIN recovery**: `POST /api/auth/request-otp` + `POST /api/auth/verify-otp` (5-min TTL, single-use). Demo build returns OTP in `demo_otp` field; production should gate via SMS gateway.
- **ForgotPinDialog** rebuilt as 2-step Phone → OTP + New PIN flow.
- **Subscription end-date pills** (gold/green `.cycle-pill` design) replace plain "Ends:" text in both Subscribe banner and Profile card.
- **Payment method symbols** (no names): circular brand marks — G/PP/P/B (UPI), V/◉◉/R (Card), H/I/S/A (Banks), P/M/a/F (Wallets).
- **Default 🍽️** emoji used everywhere there's no item image (Menu, Customer, Sales top items).
- **Customer inline qty stepper + "Added × N" badge** on each menu card after adding.
- **Kitchen stat tiles** (4): New Orders / Active Orders / Cooking / Delivered Today + manual Refresh button + Live · 1s pill.
- **Profile Edit button** highlighted as gold pill with shadow ("Edit Profile").
- **Live Orders timeAgo** shows "N day(s) ago" after 24h.
- **cart-fab z-index 100001** so the Emergent floating badge no longer overlaps the cart button.

## Verified Tests (iteration_7.json)
- Backend pytest **9/9 (100%)**: OTP request/verify/single-use/expired/wrong-otp + all iter7 regression.
- Frontend Playwright **14/14 (100%)**: forgot-pin OTP, payment symbols, cycle pills in both places, edit-button highlight, qty stepper + badge, kitchen 4 stats + refresh, live orders 'days ago', default 🍽️, cart-fab on top.
- No issues. Carry-over code review notes: split server.py into routers; extract CustomerMenuCard; gate `demo_otp` behind env flag for production.


## Iteration 9 (2026-06-21) — Full rebrand + Razorpay + QR codes
- **Rebrand TableTaap → ZenTaap** across backend, frontend, docs, public assets. New logo at `/logo.png` (846 KB ChatGPT-rendered logo). Domain: `zentaapqr.com`.
- **Subscription end-date redesign**: `cycle_end` returned by GET `/api/subscription` (= `next_cycle_start - 1 day`). UI labels swapped from "Renews on" → "Ends on".
- **Razorpay integration scaffold**:
  - Backend endpoints: `GET /api/payments/config`, `POST /api/payments/create-order`, `POST /api/payments/verify`, `POST /api/payments/webhook`, `PUT /api/subscription/autopay`.
  - Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PAYMENT_LINK`. Without keys, `/payments/create-order` returns `fallback_link` (razorpay.me/@prem9300) — frontend opens it in a new tab. With keys set, frontend launches `window.Razorpay` checkout.
  - **Autopay**: after first successful `payment.verify`, `autopay_enabled=true` on the subscription. Manager can toggle via PUT `/api/subscription/autopay`.
  - Webhook handler: marks subscription active + autopay on `payment.captured` / `subscription.charged`.
- **QR codes per table** (= subscription.tables):
  - Subscribe page: `qr-preview-card` with up to 12 QR tiles + "+N more" overflow; each encodes `https://zentaapqr.com/customer?table=N`.
  - Manager → Tables: "Show QR codes" toggle reveals downloadable SVG per table; "Print all QRs" opens a print window with branded ZenTaap cards.
- **Customer cart UX**:
  - Table number is **read from URL `?table=N`** and **locked** (lock icon badge + "Walk-in" badge when missing).
  - Cart drawer header replaced "Your Cart" text with a gold "Table N" pill; **table input removed**.
  - **Order placed animation**: full-screen overlay with animated gold tick (SVG stroke draw), 18 falling confetti pieces, "Order Placed!" headline, "Sit tight at Table N", and Order ID. Auto-dismiss 3.2s.
- **Manager Tables count** now reads from `subscription.tables` (fallback 15 if no sub).
- **Razorpay checkout.js** loaded async in `index.html`. New `qrcode.react@4.2.0` dependency.

## Verified Tests (iteration_8.json — iter9)
- Backend pytest **7/7 (100%)**: payments config, subscription cycle_end, create-order fallback, verify→autopay-on, autopay toggle, webhook payment.captured, walk-in order POST.
- Frontend Playwright **100%** across 5 screens (Login, Subscribe, Customer cart + order success, Manager Tables QR, Profile pill).
- No critical/minor issues. Code-review carry-overs: split server.py + Subscribe.jsx + Customer.jsx by feature.

- Frontend Playwright: 10/11 visual checks confirmed (clock, growth triangles, profile subscription card, profile-change-sub-btn → /subscribe, email optional label, sub-change-notice, dynamic CTA, signup brand-logo-wrap white bg).
- Post-fix: deferred path now backfills `cycle_start`/`next_cycle_start` for legacy subs; verified via curl.

## Verified Tests (iteration_4.json — iter5 baseline)
- Backend pytest **17/17 (100%)**: auth (PIN 4321 + wrong + signup-idempotent), settings GET/PUT, categories CRUD with rename, menu CRUD, orders create+status, `/stats/today` includes `growth_7d{revenue,orders,completed,aov}`, `/pricing` math (14 tables → ₹1178.82 incl GST), `/subscription` GET/POST with range 10–60.
- Frontend Playwright **100%**: login PIN 4321 → /manager; Orders revenue eye-toggle + WhatsApp share; AreaChart with Y-ticks 0/5k/…/35k; Settings save (no lint regression); Subscribe shows Per-Table calculator (NOT 3-tier); Theme toggle persists.

## Test Credentials
- Manager PIN: **4321** (file: `/app/memory/test_credentials.md`)
- Profile: Prem / Prem Sai Cafe / 9876543210

## Backlog
### P1
- Replace `window.confirm()` for category/item delete with a shadcn AlertDialog (testable + accessible).
- Auth middleware on `/api/menu`, `/api/categories`, `/api/orders` mutations (currently public).
- Object-storage backend for images (S3/R2) instead of base64 in DB to avoid bloat.

### P2
- WebSocket-based live updates instead of 1s polling (lower bandwidth).
- Timezone config for `/stats/today` day-boundary.
- Customer-side ordering flow (cart, place order, table-pick).
- Manager analytics: weekly/monthly revenue trends.

## Iteration 10 — Subscribe UX (mid-iter)
- Logo wrapped in rectangular gold-bordered white box.
- Removed "Each scans to https://zentaapqr.com/customer?table=N" copy and the zentaapqr.com pill from QR preview card.
- 2-device login cap (later raised to 4 in iter-11).
- Manager dashboard locks Orders/Tables/Menu/Sales when subscription status not in {trial, active}; only Profile + Settings remain accessible. Lock banner copy switches for `expired` status to "Subscription expired · Pay & Resume".
- Subscribe page gets "Print QRs" button (full N-set via hidden render block).
- Mobile responsive: hamburger toggle + slide-in sidebar drawer @ <=900px; grid 2-up @ <=480px.

## Iteration 11 (2026-06-22) — FINAL LAUNCH BUILD
- **Pricing rebased**: `BASE_FEE=0`, `PER_TABLE=79.9` (+ 18% GST). Six tiers verified: 10→₹942.82, 20→₹1885.64, 30→₹2828.46, 40→₹3771.28, 50→₹4714.10, 60→₹5656.92. Out-of-range tables now return 400 from both `/pricing` and `/subscription` (consistent).
- **MAX_DEVICES = 4** (was 2). Settings card copy updated.
- **Per-sub-brand mini logos** in `BrandLogos.jsx`: GPay, PhonePe, Paytm, BHIM, VISA, Mastercard, RuPay, HDFC, ICICI, SBI, AXIS, Amazon Pay, Freecharge, MobiKwik. Category SVG logos (UPI/Visa-MC/Bank/Wallet master marks) removed.
- **Mobile fit polish**: brand-chip shrinks to 20px / 9px on phones; cart-drawer full-width on mobile; live-pill hidden; payment-grid single-column @ <=480px.
- **Bug fixes**: expired-redirect flash on /manager fixed; SettingsSection devices-card max default updated to 4; copy updated from "3rd device" → "you exceed 4 devices".

## Verified Tests (iteration_10.json — LAUNCH)
- Backend pytest **25/25 (100%)**.
- Frontend Playwright **100%** — both desktop (1920×1080) and mobile (390×844). All payment cards, formula box, breakdown, 14 brand chips, devices-card 4-cap confirmed.
- Only LOW-priority cosmetic issue (devices-card copy) → fixed post-test.
- Razorpay still in DEMO MODE (no API keys) — `/payments/create-order` returns fallback link to `razorpay.me/@prem9300`.

- Multi-staff roles (kitchen / cashier / owner) with separate PINs.

## Next Action Items
- (Optional) Add a **Subscribe** link/icon to the manager sidebar (currently `/subscribe` is direct-URL only).
- (Optional) Silence Recharts `width(-1) height(-1)` console warnings on Sales tab initial mount via explicit ResponsiveContainer aspect.

## Iteration 13 (2026-06-22) — PRODUCTION HARDENING (final)
- **Customer PIN removed** — `/customer` is fully open; `?table=N` query param is the only access control (encoded in printed QRs).
- **Kitchen PIN added** — new endpoints `POST /api/auth/kitchen-login`, `GET/PUT /api/settings/kitchen-pin`. Manager configures in Settings → "Kitchen Display PIN".
- **Cart FAB centered** — `bottom: 24px; left: 50%; transform: translateX(-50%)`. Drawer still slides from right.
- **Bearer-token manager auth** — new `_require_manager(request)` FastAPI dependency validates `Authorization: Bearer <token>` against `db.sessions` and touches `last_used`. Applied to: PUT /profile, PUT /settings, PUT /settings/kitchen-pin, GET /settings/customer-pin (legacy), GET /stats/today, GET /stats/revenue, GET /auth/sessions, DELETE /auth/sessions/{id}, plus chained on the 6 menu/category writes. POST/PUT /orders stay open (customer + kitchen flows).
- **Razorpay link** env-only — `RAZORPAY_PAYMENT_LINK` defaults to empty string. No hardcoded personal links.
- **CORS hardening** — production `DEMO_MODE=false` fail-closes any `*` in `CORS_ORIGINS` to localhost-only. Operator must set explicit production origins.
- **DEMO_MODE flag** — when `false`, `/auth/request-otp` strips `demo_otp` from response.
- **Frontend axios interceptor** — auto-attaches Bearer from `localStorage.mgr_token`; handles 401 (clear token + /login) and 402 (toast + /subscribe).
- **`LAUNCH.md`** runbook added at `/app` with prod `.env` template, Razorpay webhook URL, deploy checklist.
- **Production build verified** — `CI=true yarn build` exits 0. `yarn.lock` + `requirements.txt` in place.
- **Critical bug fixed in test loop**: `PUT /api/settings` was missing the `_require_manager` guard — added post-test, verified 401→200 with token.

## Iteration 14 (2026-06-24) — Refactor + Cookie Auth Migration
- **Backend refactor** — `stats_today()` extracted into 5 small helpers (`_orders_in_range`, `_aggregate_orders`, `_growth_pct`, `_seven_day_growth`, `_count_top_items`, `_menu_meta_for`, `_revenue_by_category`). Response shape unchanged.
- **Frontend refactor** — `MenuSection.jsx` (504→57 lines) split into `menu/MenuForm.jsx` + `menu/MenuItemCard.jsx` + `menu/MenuSearchBar.jsx`. `SettingsSection.jsx` (594→20 lines) split into `settings/{AppearanceCard, BillBrandingForm, ChangePinForm, KitchenPinForm, DevicesCard, RecoverPinForm}.jsx`.
- **httpOnly cookie auth migration (hybrid)** — `/api/auth/login` now also sets an httpOnly `mgr_token` cookie (sameSite=Lax, secure only in production). `_require_manager` reads cookie first, falls back to `Authorization: Bearer` header for legacy SDK / pytest / curl callers. Frontend axios uses `withCredentials: true`. New `POST /api/auth/logout` endpoint deletes the server session and clears the cookie.
- **Frontend `Login.jsx`** stores `mgr_authed=1` flag for UI state; raw token kept in localStorage as fallback for the bearer path until a future cleanup pass.
- **Frontend `Manager.jsx`** logout calls `POST /api/auth/logout` before navigating to `/login`.

## Verified Tests (iteration_14.json — REFACTOR + COOKIE)
- Backend pytest 22/23 PASS · 1 SKIP · 0 FAIL across test_iteration13.py + test_iteration14.py.
- New `test_iteration14.py` covers: login sets httpOnly cookie, cookie alone authenticates, Bearer header still works (legacy), logout clears cookie + session, stats_today response shape regression.
- Frontend Playwright 100% — cookie auth e2e, refactored MenuSection / SettingsSection render and operate, logout flow, customer-open, kitchen PIN gate.
- No critical/minor issues. Older iter2/4/5/6/7/9/11/12/test_tabletap_api are stale (predate iter13 auth lock & current pricing) — not regressions.


- (Optional) Allow `PUT /api/settings` to clear `gst_rate` when explicit `null` is sent (iter-3 carryover).
- (Refactor) Split `server.py` (~765 lines) into `routers/{auth,menu,orders,stats,subscription}.py`.
- (Security/P1) Bcrypt-hash manager PIN; add bearer-token check on write endpoints; rate-limit `recover-pin`.
- Optional UX polish: dialog-based confirm for destructive actions; image picker accepting drag-drop.
- Optional: Stripe integration for prepaid customer orders (when customer ordering is added).
