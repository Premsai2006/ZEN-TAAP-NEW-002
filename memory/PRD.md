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
- Optional UX polish: dialog-based confirm for destructive actions; image picker accepting drag-drop.
- Optional: Stripe integration for prepaid customer orders (when customer ordering is added).
