import { useState } from "react";
import { Receipt, Eye, EyeOff, Wallet, Users, ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import BillModal from "@/components/manager/BillModal";

const STATUSES = ["all", "new", "cooking", "done", "delivered"];

const statusBadge = (s) => {
  const cls = {
    new: "badge-new",
    cooking: "badge-cooking",
    done: "badge-done",
    delivered: "badge-delivered",
  }[s] || "badge-new";
  return <span className={`badge ${cls}`}>{s}</span>;
};

const nextStatus = (s) => ({ new: "cooking", cooking: "done", done: "delivered" }[s]);

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  return `${Math.floor(diff / 3600)} hr ago`;
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

export default function OrdersSection({ orders, stats, settings, showRevenue, setShowRevenue, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const [billOrder, setBillOrder] = useState(null);

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const updateOrder = async (id, status) => {
    await api.put(`/orders/${id}`, { status });
    onRefresh();
  };

  const revenue = stats?.revenue ?? 0;
  const growth = stats?.growth_7d || {};

  return (
    <div className="section active" data-testid="orders-section">
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
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
              const itemsLabel = o.items.map((it) => `${it.name} ×${it.qty}`).join(", ");
              return (
                <tr key={o.id} data-testid={`order-row-${o.order_number}`}>
                  <td style={{ fontWeight: 500, color: "var(--gold)" }}>#{o.order_number}</td>
                  <td>Table {o.table}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)", maxWidth: 220 }}>{itemsLabel}</td>
                  <td style={{ fontWeight: 500 }}>
                    {showRevenue ? `₹${o.amount}` : `₹${maskRevenue(o.amount)}`}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{timeAgo(o.created_at)}</td>
                  <td>{statusBadge(o.status)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {nxt && (
                        <button
                          className="mini-btn"
                          onClick={() => updateOrder(o.id, nxt)}
                          data-testid={`order-update-${o.order_number}`}
                        >
                          → {nxt}
                        </button>
                      )}
                      <button
                        className="mini-btn primary"
                        onClick={() => setBillOrder(o)}
                        data-testid={`generate-bill-${o.order_number}`}
                        title="Generate Bill"
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

      {billOrder && (
        <BillModal order={billOrder} settings={settings} onClose={() => setBillOrder(null)} />
      )}
    </div>
  );
}
