import { useState } from "react";
import { Receipt, Eye, EyeOff, Wallet, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import BillModal from "@/components/manager/BillModal";

const STATUSES = ["all", "new", "cooking", "done", "delivered", "paid", "cancelled"];

const statusBadge = (s) => {
  const cls = {
    new: "badge-new",
    cooking: "badge-cooking",
    done: "badge-done",
    delivered: "badge-delivered",
    paid: "badge-done",
    cancelled: "badge-na",
  }[s] || "badge-new";
  return <span className={`badge ${cls}`}>{s}</span>;
};

const nextStatus = (s) => ({ new: "cooking", cooking: "done", done: "delivered" }[s]);

const formatOrderTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const absolute = d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const diff = (Date.now() - d.getTime()) / 1000;
    let relative;
    if (diff < 60) relative = `${Math.floor(diff)}s ago`;
    else if (diff < 3600) relative = `${Math.floor(diff / 60)} min ago`;
    else if (diff < 86400) relative = `${Math.floor(diff / 3600)} hr ago`;
    else {
      const days = Math.floor(diff / 86400);
      relative = `${days} ${days === 1 ? "day" : "days"} ago`;
    }
    return { absolute, relative };
  } catch {
    return { absolute: iso, relative: "" };
  }
};

const tableLabel = (table) => {
  if (table === 0 || table == null) return "Walk-in";
  return `Table ${table}`;
};

const maskRevenue = (val) => "•".repeat(Math.max(4, String(val).length));

// Triangle glyph: ▲ for up, ▼ for down. Used in growth pills.
export const GrowthPill = ({ pct, label = "vs prev 7d" }) => {
  const flat = pct === 0 || pct == null;
  const up = pct > 0;
  const cls = flat ? "flat" : up ? "" : "down";
  return (
    <span className={`growth-pill ${cls}`} title={label} data-testid="growth-pill">
      {!flat && (
        <span className="growth-tri" aria-hidden="true">{up ? "▲" : "▼"}</span>
      )}
      {flat ? "—" : `${up ? "+" : ""}${pct}%`}
    </span>
  );
};

export default function OrdersSection({
  orders, stats, settings, showRevenue, setShowRevenue, onRefresh,
  locked, createLocked, statusLocked, menu = [],
}) {
  const noCreate = createLocked ?? locked;
  const noStatus = statusLocked ?? locked;
  const [filter, setFilter] = useState("all");
  const [billOrder, setBillOrder] = useState(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [wiTable, setWiTable] = useState(0);
  const [wiCart, setWiCart] = useState({}); // id -> { item, qty }
  const [wiNotes, setWiNotes] = useState("");
  const [wiPlacing, setWiPlacing] = useState(false);

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const updateOrder = async (id, status) => {
    if (noStatus) {
      toast.error("Subscribe to ZenTaap to update orders.");
      return;
    }
    try {
      await api.put(`/orders/${id}`, { status });
      onRefresh();
    } catch (err) {
      if (err?.response?.status !== 402) {
        toast.error(friendlyError(err, "Couldn't update that order. Please try again."));
      }
    }
  };

  const placeWalkIn = async () => {
    if (noCreate) return toast.error("Subscribe to ZenTaap to place orders.");
    const items = Object.values(wiCart)
      .filter((x) => x.qty > 0)
      .map(({ item, qty }) => ({
        name: item.name,
        qty,
        price: item.price,
        menu_item_id: item.id,
      }));
    if (!items.length) return toast.error("Add at least one item.");
    setWiPlacing(true);
    try {
      await api.post("/orders", { table: Number(wiTable) || 0, items, notes: wiNotes || undefined });
      toast.success(Number(wiTable) > 0 ? `Order placed for Table ${wiTable}` : "Walk-in order placed");
      setWalkInOpen(false);
      setWiCart({});
      setWiNotes("");
      onRefresh();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't place the order."));
    } finally {
      setWiPlacing(false);
    }
  };

  const revenue = stats?.revenue ?? 0;
  const growth = stats?.growth_7d || {};

  return (
    <div className="section active" data-testid="orders-section">
      <div className="stats-row">
        <div className="stat-card gold">
          <div className="stat-label">
            <ClipboardList size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Total Orders Today
          </div>
          <div className="stat-value" data-testid="stat-total-orders">{stats?.total_orders ?? 0}</div>
          <div className="stat-sub">
            <GrowthPill pct={growth.orders} /> Last 7 days
          </div>
        </div>

        <div className="stat-card green">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <Wallet size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              Today Sales
            </span>
            <button
              type="button"
              onClick={() => setShowRevenue(!showRevenue)}
              title={showRevenue ? "Hide" : "Show"}
              data-testid="revenue-toggle-orders"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
            >
              {showRevenue ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="stat-value" data-testid="stat-today-sales">
            {showRevenue ? `₹${revenue.toLocaleString("en-IN")}` : `₹${maskRevenue(revenue)}`}
          </div>
          <div className="stat-sub">
            <GrowthPill pct={growth.revenue} /> Last 7 days
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Users size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Active Tables
          </div>
          <div className="stat-value" data-testid="stat-active-tables">{stats?.active_tables ?? 0}</div>
          <div className="stat-sub">In progress</div>
        </div>

        <div className="stat-card" style={{ borderColor: "rgba(110,164,255,0.4)" }}>
          <div className="stat-label">
            <Receipt size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Orders Completed
          </div>
          <div className="stat-value" style={{ color: "#6ea4ff" }} data-testid="stat-orders-completed">
            {stats?.completed ?? 0}
          </div>
          <div className="stat-sub">
            <GrowthPill pct={growth.completed} /> Last 7 days
          </div>
        </div>
      </div>

      <div className="orders-section">
        <div className="section-header">
          <div className="section-header-title">All Orders</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="mini-btn primary"
              data-testid="walk-in-order-btn"
              disabled={noCreate}
              onClick={() => {
                if (noCreate) return toast.error("Subscribe to ZenTaap to place orders.");
                setWalkInOpen(true);
              }}
            >
              + Walk-in / Counter order
            </button>
            <div className="filter-tabs">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={`filter-tab ${filter === s ? "active" : ""}`}
                  onClick={() => setFilter(s)}
                  data-testid={`filter-${s}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Table</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody data-testid="orders-tbody">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>
                    No orders.
                  </td>
                </tr>
              )}
              {filtered.map((o) => {
                const nxt = nextStatus(o.status);
                const itemsLabel = (o.items || []).map((it) => `${it.name} ×${it.qty}`).join(", ");
                const t = formatOrderTime(o.created_at);
                return (
                  <tr key={o.id} data-testid={`order-row-${o.order_number}`}>
                    <td style={{ fontWeight: 500, color: "var(--gold)" }}>#{o.order_number}</td>
                    <td>{tableLabel(o.table)}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)", maxWidth: 220 }}>{itemsLabel}</td>
                    <td style={{ fontWeight: 500 }}>
                      {showRevenue ? `₹${o.amount ?? 0}` : `₹${maskRevenue(o.amount ?? 0)}`}
                    </td>
                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }} title={t.relative}>
                      <div style={{ fontSize: 13 }}>{t.absolute}</div>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>{t.relative}</div>
                    </td>
                    <td>{statusBadge(o.status)}</td>
                    <td className="order-action-cell">
                      <div className="order-actions">
                        {nxt ? (
                          <button
                            className="mini-btn"
                            onClick={() => updateOrder(o.id, nxt)}
                            data-testid={`order-update-${o.order_number}`}
                            disabled={noStatus}
                          >
                            → {nxt}
                          </button>
                        ) : (
                          <span className="order-action-spacer" aria-hidden="true" />
                        )}
                        {!["cancelled", "paid"].includes(o.status) && (
                          <button
                            className="mini-btn"
                            onClick={() => {
                              if (noStatus) return toast.error("Subscribe to ZenTaap to manage orders.");
                              if (!window.confirm(`Cancel order #${o.order_number}?`)) return;
                              updateOrder(o.id, "cancelled");
                            }}
                            data-testid={`order-cancel-${o.order_number}`}
                            disabled={noStatus}
                            title="Cancel / void"
                            style={{ color: "var(--red)" }}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          className="mini-btn primary"
                          onClick={() => {
                            if (noStatus) {
                              toast.error("Subscribe to ZenTaap to generate bills.");
                              return;
                            }
                            setBillOrder(o);
                          }}
                          data-testid={`generate-bill-${o.order_number}`}
                          title={noStatus ? "Requires subscription" : "Generate Bill"}
                          disabled={noStatus || o.status === "cancelled"}
                        >
                          <Receipt size={12} style={{ display: "inline", marginRight: 4 }} />
                          Bill
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {billOrder && (
        <BillModal
          order={billOrder}
          settings={settings}
          onClose={() => setBillOrder(null)}
          onSettled={onRefresh}
        />
      )}

      {walkInOpen && (
        <div
          className="bill-modal-overlay"
          data-testid="walk-in-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setWalkInOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 18,
              maxWidth: 520,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div className="font-serif" style={{ fontSize: 18, color: "var(--gold)", marginBottom: 12 }}>
              Walk-in / Counter order
            </div>
            <label className="form-label">Table (0 = walk-in)</label>
            <input
              type="number"
              min={0}
              value={wiTable}
              onChange={(e) => setWiTable(e.target.value)}
              data-testid="walk-in-table"
              style={{
                width: "100%",
                marginBottom: 12,
                background: "var(--bg)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            />
            <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12 }}>
              {(menu || []).filter((m) => m.available !== false).map((it) => {
                const qty = wiCart[it.id]?.qty || 0;
                return (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--line)",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>₹{it.price}</div>
                    </div>
                    <div className="qty-stepper">
                      <button
                        type="button"
                        onClick={() =>
                          setWiCart((c) => {
                            const cur = c[it.id]?.qty || 0;
                            if (cur <= 1) {
                              const n = { ...c };
                              delete n[it.id];
                              return n;
                            }
                            return { ...c, [it.id]: { item: it, qty: cur - 1 } };
                          })
                        }
                      >
                        −
                      </button>
                      <span className="qty-stepper-num">{qty}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setWiCart((c) => ({
                            ...c,
                            [it.id]: { item: it, qty: (c[it.id]?.qty || 0) + 1 },
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
              {(menu || []).length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No menu items loaded.</div>
              )}
            </div>
            <label className="form-label">Notes (optional)</label>
            <input
              value={wiNotes}
              onChange={(e) => setWiNotes(e.target.value)}
              placeholder="e.g. less spicy"
              data-testid="walk-in-notes"
              style={{
                width: "100%",
                marginBottom: 14,
                background: "var(--bg)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="submit-btn ghost" onClick={() => setWalkInOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="submit-btn"
                data-testid="walk-in-place-btn"
                disabled={wiPlacing}
                onClick={placeWalkIn}
                style={{ flex: 1 }}
              >
                {wiPlacing ? "Placing…" : "Place order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
