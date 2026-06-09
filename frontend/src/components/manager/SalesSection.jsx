import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Wallet,
  CheckCircle2,
  TrendingUp,
  PieChart as PieIcon,
  LogOut,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";

const COLORS = ["#e87d2f", "#5fb87a", "#6ea4ff", "#d96363", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6"];

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "total", label: "Total" },
];

const maskRev = (v) => "•".repeat(Math.max(4, String(v).length));

export default function SalesSection({ stats, showRevenue, setShowRevenue, onLogoutClick }) {
  const [period, setPeriod] = useState("week");
  const [series, setSeries] = useState([]);

  useEffect(() => {
    api
      .get(`/stats/revenue?period=${period}`)
      .then((r) => setSeries(r.data.series || []))
      .catch(() => setSeries([]));
  }, [period]);

  const fmt = (v) => (showRevenue ? `₹${(v ?? 0).toLocaleString("en-IN")}` : `₹${maskRev(v ?? 0)}`);
  const pieData = (stats?.revenue_by_category || []).map((c) => ({
    name: c.category || "Uncategorized",
    value: c.revenue,
    percent: c.percent,
  }));

  return (
    <div className="section active" data-testid="sales-section">
      {/* 4 stat cards */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-card gold">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <Wallet size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              Total Revenue
            </span>
            <button
              type="button"
              onClick={() => setShowRevenue(!showRevenue)}
              title={showRevenue ? "Hide" : "Show"}
              data-testid="revenue-toggle-sales"
              style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex" }}
            >
              {showRevenue ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="stat-value" data-testid="sales-revenue">{fmt(stats?.revenue)}</div>
          <div className="stat-sub">Today</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">
            <CheckCircle2 size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Orders Completed
          </div>
          <div className="stat-value" data-testid="sales-completed">{stats?.completed ?? 0}</div>
          <div className="stat-sub">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <TrendingUp size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Avg Order Value
          </div>
          <div className="stat-value" data-testid="sales-aov">{fmt(stats?.avg_order_value)}</div>
          <div className="stat-sub">Per order</div>
        </div>
        <div className="stat-card" style={{ borderColor: "rgba(192,132,252,0.4)" }}>
          <div className="stat-label">
            <PieIcon size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Gross Profit
          </div>
          <div className="stat-value" style={{ color: "#c084fc" }} data-testid="sales-gross-profit">
            {fmt(stats?.gross_profit)}
          </div>
          <div className="stat-sub">@ 65% margin</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="charts-row">
        {/* Revenue overview */}
        <div className="chart-card" data-testid="revenue-chart-card">
          <div className="section-header">
            <div className="section-header-title">Revenue Overview</div>
            <div className="filter-tabs">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  className={`filter-tab ${period === p.key ? "active" : ""}`}
                  onClick={() => setPeriod(p.key)}
                  data-testid={`period-${p.key}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e87d2f" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#e87d2f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card-2)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    color: "var(--text)",
                  }}
                  formatter={(v) => [showRevenue ? `₹${v.toLocaleString("en-IN")}` : `₹${maskRev(v)}`, "Revenue"]}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#e87d2f"
                  strokeWidth={2.5}
                  dot={{ fill: "#e87d2f", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by category pie */}
        <div className="chart-card" data-testid="category-chart-card">
          <div className="section-header" style={{ marginBottom: 8 }}>
            <div className="section-header-title">Revenue by Category</div>
          </div>
          {pieData.length === 0 ? (
            <div style={{ color: "var(--muted)", padding: 30, textAlign: "center" }}>No data yet.</div>
          ) : (
            <>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card-2)",
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        color: "var(--text)",
                      }}
                      formatter={(v) => [showRevenue ? `₹${v.toLocaleString("en-IN")}` : `₹${maskRev(v)}`, "Revenue"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="cat-breakdown" data-testid="category-breakdown">
                {pieData.map((c, i) => (
                  <div className="cat-row" key={i}>
                    <span className="cat-dot" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="cat-name">{c.name}</span>
                    <span className="cat-pct">{c.percent}%</span>
                    <span className="cat-rev">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top selling items */}
      <div className="orders-section" data-testid="top-items-card">
        <div className="section-header">
          <div className="section-header-title">Top Selling Items</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Quantity Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody data-testid="top-items-tbody">
            {(!stats?.top_items || stats.top_items.length === 0) && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>
                  No sales yet.
                </td>
              </tr>
            )}
            {(stats?.top_items || []).map((t) => (
              <tr key={t.name}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td style={{ color: "var(--muted)" }}>{t.category || "—"}</td>
                <td>
                  <span className="qty-pill">{t.qty}</span>
                </td>
                <td style={{ color: "var(--gold)", fontWeight: 500 }}>{fmt(t.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Logout box */}
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
