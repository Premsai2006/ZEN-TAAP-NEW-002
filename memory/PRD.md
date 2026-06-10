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
- Multi-staff roles (kitchen / cashier / owner) with separate PINs.

## Next Action Items
- (Optional) Add a **Subscribe** link/icon to the manager sidebar (currently `/subscribe` is direct-URL only).
- (Optional) Silence Recharts `width(-1) height(-1)` console warnings on Sales tab initial mount via explicit ResponsiveContainer aspect.
- (Optional) Allow `PUT /api/settings` to clear `gst_rate` when explicit `null` is sent (iter-3 carryover).
- (Refactor) Split `server.py` (~765 lines) into `routers/{auth,menu,orders,stats,subscription}.py`.
- (Security/P1) Bcrypt-hash manager PIN; add bearer-token check on write endpoints; rate-limit `recover-pin`.
- Optional UX polish: dialog-based confirm for destructive actions; image picker accepting drag-drop.
- Optional: Stripe integration for prepaid customer orders (when customer ordering is added).
