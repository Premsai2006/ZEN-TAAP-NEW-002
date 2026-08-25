import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2,
  CreditCard,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Save,
  Search,
  Shield,
  Store,
  Timer,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

const fmtINR = (n) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
};

const STATUS_TONE = {
  active: { bg: "rgba(95,184,122,0.16)", color: "var(--green)" },
  trial: { bg: "rgba(232,125,47,0.16)", color: "var(--gold)" },
  expired: { bg: "rgba(217,99,99,0.16)", color: "var(--red)" },
  none: { bg: "rgba(138,134,128,0.16)", color: "var(--muted)" },
  skipped: { bg: "rgba(138,134,128,0.16)", color: "var(--muted)" },
};

function StatusPill({ status }) {
  const key = (status || "none").toLowerCase();
  const tone = STATUS_TONE[key] || STATUS_TONE.none;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "3px 9px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
      }}
    >
      {status || "none"}
    </span>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [username, setUsername] = useState(() => localStorage.getItem("admin_user") || "admin");
  const [overview, setOverview] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [form, setForm] = useState({
    per_table: 80,
    base_fee: 0,
    gst_rate_pct: 18,
    min_tables: 10,
    max_tables: 60,
  });
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, rest, price] = await Promise.all([
        api.get("/admin/overview"),
        api.get("/admin/restaurants"),
        api.get("/admin/pricing"),
      ]);
      setOverview(ov.data);
      setRestaurants(rest.data.restaurants || []);
      setPricing(price.data);
      setForm({
        per_table: price.data.per_table,
        base_fee: price.data.base_fee,
        gst_rate_pct: price.data.gst_rate_pct,
        min_tables: price.data.min_tables,
        max_tables: price.data.max_tables,
      });
    } catch (err) {
      if (err?.response?.status === 401) return;
      toast.error(friendlyError(err, "Couldn't load admin data."));
    }
  }, []);

  useEffect(() => {
    api
      .get("/admin/me")
      .then((r) => {
        if (r.data?.username) {
          setUsername(r.data.username);
          localStorage.setItem("admin_user", r.data.username);
        }
      })
      .catch(() => {});
    load();
  }, [load]);

  const logout = async () => {
    try {
      await api.post("/admin/logout");
    } catch {
      /* still clear locally */
    }
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    navigate("/admin/login");
  };

  const savePricing = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put("/admin/pricing", {
        per_table: Number(form.per_table),
        base_fee: Number(form.base_fee),
        gst_rate_pct: Number(form.gst_rate_pct),
        min_tables: Number(form.min_tables),
        max_tables: Number(form.max_tables),
      });
      setPricing(data);
      toast.success("Pricing updated — new subscriptions use this rate.");
      load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save pricing."));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if ((pw.next || "").length < 8) {
      return toast.error("New password must be at least 8 characters.");
    }
    if (pw.next !== pw.confirm) {
      return toast.error("New password and confirmation do not match.");
    }
    setPwSaving(true);
    try {
      await api.put("/admin/password", {
        current_password: pw.current,
        new_password: pw.next,
      });
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password updated. Use the new password next time you log in.");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update the password."));
    } finally {
      setPwSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return restaurants;
    return restaurants.filter((r) =>
      [r.restaurant_name, r.slug, r.contact_number, r.manager_name, r.email, r.status]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [restaurants, q]);

  const preview = useMemo(() => {
    const per = Number(form.per_table) || 0;
    const base = Number(form.base_fee) || 0;
    const gst = (Number(form.gst_rate_pct) || 0) / 100;
    const n = Number(form.min_tables) || 10;
    const subtotal = base + per * n;
    const tax = subtotal * gst;
    return { n, subtotal, tax, total: subtotal + tax };
  }, [form]);

  const counts = overview?.counts || {};

  return (
    <div className="admin-shell" data-testid="admin-dashboard">
      <div className="admin-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="brand-logo-wrap" style={{ padding: "6px 12px" }}>
            <img src="/logo.png" alt="ZenTaap" className="brand-logo" style={{ height: 28 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: 0.6 }}>
              <Shield size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              ADMIN
            </div>
            <div className="font-serif" style={{ fontSize: 18 }}>Platform</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{username}</span>
          <button type="button" className="sub-logout-btn" onClick={logout} data-testid="admin-logout">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>

      <div className="admin-tabs" data-testid="admin-tabs">
        {[
          { key: "overview", label: "Overview", icon: LayoutDashboard },
          { key: "restaurants", label: "Restaurants", icon: Store },
          { key: "pricing", label: "Pricing", icon: IndianRupee },
          { key: "account", label: "Account", icon: KeyRound },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              className={`admin-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
              data-testid={`admin-tab-${t.key}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div data-testid="admin-overview">
          <div className="stats-row" style={{ marginBottom: 18 }}>
            <div className="stat-card">
              <div className="stat-label"><Users size={11} style={{ display: "inline", marginRight: 4 }} /> Restaurants</div>
              <div className="stat-value" data-testid="admin-count-restaurants">{counts.restaurants ?? "—"}</div>
              <div className="stat-sub">All accounts</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label"><CreditCard size={11} style={{ display: "inline", marginRight: 4 }} /> Active</div>
              <div className="stat-value">{counts.active ?? 0}</div>
              <div className="stat-sub">{counts.trial ?? 0} on trial</div>
            </div>
            <div className="stat-card gold">
              <div className="stat-label"><IndianRupee size={11} style={{ display: "inline", marginRight: 4 }} /> MRR</div>
              <div className="stat-value" data-testid="admin-mrr">{fmtINR(overview?.mrr)}</div>
              <div className="stat-sub">Sum of active monthly bills</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Building2 size={11} style={{ display: "inline", marginRight: 4 }} /> Per table</div>
              <div className="stat-value" data-testid="admin-per-table">{fmtINR(overview?.pricing?.per_table)}</div>
              <div className="stat-sub">
                {overview?.pricing?.min_tables}–{overview?.pricing?.max_tables} tables · GST {overview?.pricing?.gst_rate_pct}%
              </div>
            </div>
          </div>

          <div className="stats-row" style={{ marginBottom: 18, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="stat-card">
              <div className="stat-label"><Timer size={11} style={{ display: "inline", marginRight: 4 }} /> Expired</div>
              <div className="stat-value">{counts.expired ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">With access</div>
              <div className="stat-value">{counts.with_access ?? 0}</div>
              <div className="stat-sub">Trial + active</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Tables under access</div>
              <div className="stat-value">{overview?.tables_under_access ?? 0}</div>
              <div className="stat-sub">Avg {overview?.avg_tables ?? 0} / restaurant</div>
            </div>
          </div>

          <div className="add-item-card">
            <div className="font-serif" style={{ fontSize: 18, marginBottom: 12 }}>Recent accounts</div>
            {(overview?.recent || []).length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No restaurants yet.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Restaurant</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Tables</th>
                      <th>Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.recent || []).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.restaurant_name || "—"}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>/r/{r.slug}</div>
                        </td>
                        <td>{r.contact_number || "—"}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td>{r.tables ?? "—"}</td>
                        <td>{r.status === "active" ? fmtINR(r.monthly_total) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "restaurants" && (
        <div data-testid="admin-restaurants">
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, phone, slug…"
                data-testid="admin-restaurant-search"
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 34px",
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  color: "var(--text)",
                  borderRadius: 10,
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{filtered.length} shown</span>
          </div>
          <div className="add-item-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Manager</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Tables</th>
                    <th>Monthly</th>
                    <th>Renews</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(selected?.id === r.id ? null : r)}
                      style={{ cursor: "pointer", background: selected?.id === r.id ? "rgba(232,125,47,0.08)" : undefined }}
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.restaurant_name || "—"}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>/r/{r.slug}</div>
                      </td>
                      <td>{r.manager_name || "—"}</td>
                      <td>{r.contact_number || "—"}</td>
                      <td><StatusPill status={r.status} /></td>
                      <td>{r.tables ?? "—"}</td>
                      <td>{r.monthly_total ? fmtINR(r.monthly_total) : "—"}</td>
                      <td>{fmtDate(r.next_cycle_start)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {selected && (
            <div className="add-item-card" style={{ marginTop: 14 }} data-testid="admin-restaurant-detail">
              <div className="font-serif" style={{ fontSize: 18, marginBottom: 8 }}>{selected.restaurant_name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 13, color: "var(--muted)" }}>
                <div>Email: <b style={{ color: "var(--text)" }}>{selected.email || "—"}</b></div>
                <div>Autopay: <b style={{ color: "var(--text)" }}>{selected.autopay_enabled ? "On" : "Off"}</b></div>
                <div>Started: <b style={{ color: "var(--text)" }}>{fmtDate(selected.cycle_start)}</b></div>
                <div>Last payment: <b style={{ color: "var(--text)" }}>{fmtDate(selected.last_payment_at)}</b></div>
                <div>Payment method: <b style={{ color: "var(--text)" }}>{selected.payment_method || "—"}</b></div>
                <div>Trial ends: <b style={{ color: "var(--text)" }}>{fmtDate(selected.trial_end)}</b></div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "pricing" && (
        <form className="add-item-card" onSubmit={savePricing} data-testid="admin-pricing-form" style={{ maxWidth: 640 }}>
          <div className="font-serif" style={{ fontSize: 22, marginBottom: 6 }}>Table pricing</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
            This rate is used by the subscribe page and new Razorpay checkouts.
            Existing restaurants keep their current billed amount until they change plan or pay again.
          </div>

          <label className="form-label">Price per table / month (₹, before GST)</label>
          <input
            type="number"
            min="1"
            step="0.01"
            required
            value={form.per_table}
            onChange={(e) => setForm((f) => ({ ...f, per_table: e.target.value }))}
            data-testid="admin-per-table-input"
            className="admin-input"
          />

          <div className="form-row" style={{ marginTop: 14 }}>
            <div>
              <label className="form-label">Base fee (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.base_fee}
                onChange={(e) => setForm((f) => ({ ...f, base_fee: e.target.value }))}
                data-testid="admin-base-fee-input"
                className="admin-input"
              />
            </div>
            <div>
              <label className="form-label">GST (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.gst_rate_pct}
                onChange={(e) => setForm((f) => ({ ...f, gst_rate_pct: e.target.value }))}
                data-testid="admin-gst-input"
                className="admin-input"
              />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 14 }}>
            <div>
              <label className="form-label">Min tables</label>
              <input
                type="number"
                min="1"
                value={form.min_tables}
                onChange={(e) => setForm((f) => ({ ...f, min_tables: e.target.value }))}
                data-testid="admin-min-tables-input"
                className="admin-input"
              />
            </div>
            <div>
              <label className="form-label">Max tables</label>
              <input
                type="number"
                min="1"
                value={form.max_tables}
                onChange={(e) => setForm((f) => ({ ...f, max_tables: e.target.value }))}
                data-testid="admin-max-tables-input"
                className="admin-input"
              />
            </div>
          </div>

          <div className="formula-box" style={{ marginTop: 18 }} data-testid="admin-price-preview">
            <div className="formula-title">PREVIEW · {preview.n} TABLES</div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>
              {fmtINR(Number(form.per_table) || 0)} × {preview.n}
              {Number(form.base_fee) > 0 ? ` + ${fmtINR(Number(form.base_fee) || 0)} base` : ""}
              {" "}+ GST {form.gst_rate_pct}% ={" "}
              <b style={{ color: "var(--gold)" }}>{fmtINR(preview.total)}</b>
              /mo
            </div>
            {pricing?.updated_at && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                Last saved {fmtDate(pricing.updated_at)}
                {pricing.updated_by ? ` by ${pricing.updated_by}` : ""}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={saving}
            data-testid="admin-save-pricing"
            style={{ marginTop: 18, width: "100%", padding: "14px" }}
          >
            <Save size={15} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
            {saving ? "Saving…" : "Save pricing"}
          </button>
        </form>
      )}

      {tab === "account" && (
        <form className="add-item-card" onSubmit={savePassword} data-testid="admin-password-form" style={{ maxWidth: 480 }}>
          <div className="font-serif" style={{ fontSize: 22, marginBottom: 6 }}>Reset password</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
            Signed in as <b style={{ color: "var(--text)" }}>{username}</b>. This updates the admin login password for this panel.
          </div>
          <label className="form-label">Current password</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={pw.current}
            onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
            data-testid="admin-pw-current"
            className="admin-input"
          />
          <label className="form-label" style={{ marginTop: 14, display: "block" }}>New password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            data-testid="admin-pw-new"
            className="admin-input"
          />
          <label className="form-label" style={{ marginTop: 14, display: "block" }}>Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            data-testid="admin-pw-confirm"
            className="admin-input"
          />
          <button
            type="submit"
            className="submit-btn"
            disabled={pwSaving}
            data-testid="admin-save-password"
            style={{ marginTop: 18, width: "100%", padding: "14px" }}
          >
            <KeyRound size={15} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
            {pwSaving ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
