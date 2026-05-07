import { LogOut } from "lucide-react";

export default function SalesSection({ stats, onLogoutClick }) {
  const top = stats?.top_items || [];
  return (
    <div className="section active" data-testid="sales-section">
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-card gold">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value" data-testid="sales-revenue">
            ₹{(stats?.revenue ?? 0).toLocaleString("en-IN")}
          </div>
          <div className="stat-sub">Today</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Orders Completed</div>
          <div className="stat-value" data-testid="sales-completed">{stats?.completed ?? 0}</div>
          <div className="stat-sub">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Most Ordered</div>
          <div className="stat-value" style={{ fontSize: 18 }} data-testid="sales-most-ordered">
            {stats?.most_ordered || "—"}
          </div>
          <div className="stat-sub">{stats?.most_count || 0} times today</div>
        </div>
      </div>

      <div className="orders-section">
        <div className="section-header">
          <div className="section-header-title">Top Selling Items Today</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Qty Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody data-testid="top-items-tbody">
            {top.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>
                  No sales yet.
                </td>
              </tr>
            )}
            {top.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td>{t.category || "—"}</td>
                <td>{t.qty}</td>
                <td>₹{t.revenue.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Logout box below Sales Today */}
      <div className="logout-box" data-testid="sales-logout-box">
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>Session</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Logged in as Manager · ending the session will require PIN to re-enter.
          </div>
        </div>
        <button
          className="submit-btn"
          onClick={onLogoutClick}
          data-testid="sales-logout-btn"
          style={{ background: "var(--red)", color: "white" }}
        >
          <LogOut size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Logout
        </button>
      </div>
    </div>
  );
}
