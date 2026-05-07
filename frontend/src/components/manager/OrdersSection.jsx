import { useState } from "react";
import { api } from "@/lib/api";

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

export default function OrdersSection({ orders, stats, onRefresh }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const updateOrder = async (id, status) => {
    await api.put(`/orders/${id}`, { status });
    onRefresh();
  };

  return (
    <div className="section active" data-testid="orders-section">
      <div className="stats-row">
        <div className="stat-card gold">
          <div className="stat-label">Total Orders Today</div>
          <div className="stat-value" data-testid="stat-total-orders">{stats?.total_orders ?? 0}</div>
          <div className="stat-sub">Live</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Revenue Today</div>
          <div className="stat-value" data-testid="stat-revenue">₹{(stats?.revenue ?? 0).toLocaleString("en-IN")}</div>
          <div className="stat-sub">
            Avg ₹{stats?.total_orders ? Math.round(stats.revenue / stats.total_orders) : 0}/order
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Tables</div>
          <div className="stat-value" data-testid="stat-active-tables">{stats?.active_tables ?? 0}</div>
          <div className="stat-sub">In progress</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Pending Orders</div>
          <div className="stat-value" data-testid="stat-pending">{stats?.pending ?? 0}</div>
          <div className="stat-sub">Needs attention</div>
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
                  <td style={{ fontWeight: 500 }}>₹{o.amount}</td>
                  <td style={{ color: "var(--muted)" }}>{timeAgo(o.created_at)}</td>
                  <td>{statusBadge(o.status)}</td>
                  <td>
                    {nxt ? (
                      <button
                        className="mini-btn"
                        onClick={() => updateOrder(o.id, nxt)}
                        data-testid={`order-update-${o.order_number}`}
                      >
                        → {nxt}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
