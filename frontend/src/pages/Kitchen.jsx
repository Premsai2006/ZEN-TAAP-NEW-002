import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChefHat, Clock, RefreshCw, ClipboardList, Flame, CheckCircle2, PackageCheck, Lock, Eye, EyeOff, LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { useInterval } from "@/hooks/useInterval";
import LogoutDialog from "@/components/manager/LogoutDialog";

const KITCHEN_TOKEN_KEY = "kitchen_token";

function KitchenPinGate({ slug, onUnlock }) {
  const [pin, setPin] = useState("");
  const [slugInput, setSlugInput] = useState(
    slug || (typeof window !== "undefined" ? localStorage.getItem("mgr_slug") || localStorage.getItem("kitchen_slug") || "" : "")
  );
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const s = (slug || slugInput || "").trim().toLowerCase();
    if (!s) return toast.error("Enter your restaurant URL name (slug).");
    if (!pin) return toast.error("Please enter the kitchen PIN.");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/kitchen-login", { pin, slug: s });
      localStorage.setItem(KITCHEN_TOKEN_KEY, data.token);
      if (data.slug) localStorage.setItem("kitchen_slug", data.slug);
      onUnlock(data.slug || s);
    } catch (err) {
      setPin("");
      toast.error(friendlyError(err, "That kitchen PIN is incorrect. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pin-gate-shell" data-testid="kitchen-pin-gate">
      <form className="pin-gate-card" onSubmit={submit}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="ZenTaap" style={{ height: 42 }} />
          </div>
        </div>
        <div
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            color: "var(--gold)", fontSize: 12, fontWeight: 700,
            background: "rgba(232,125,47,0.10)", border: "1px solid rgba(232,125,47,0.35)",
            borderRadius: 999, padding: "4px 12px", marginBottom: 14,
          }}
        >
          <Lock size={11} /> KITCHEN ACCESS
        </div>
        <div className="font-serif" style={{ fontSize: 24, marginBottom: 6 }}>
          Enter Kitchen PIN
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22 }}>
          Ask your manager for the kitchen PIN — set under <b>Manager → Settings → Kitchen Display PIN</b>.
        </div>

        {!slug && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Restaurant URL</label>
            <input
              type="text"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-"))}
              onPaste={(e) => {
                e.preventDefault();
                const t = e.clipboardData.getData("text").toLowerCase().replace(/[''`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
                setSlugInput(t);
              }}
              placeholder="my-bistro"
              autoComplete="off"
              spellCheck={false}
              pattern="[a-z0-9-]*"
              title="Only lowercase letters, numbers, and hyphens"
              data-testid="kitchen-slug-input"
              style={{ width: "100%", padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8 }}
            />
            <span style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
              Letters, numbers, hyphens only — same as Manager → Profile (zentaapqr.com/r/<b>your-url</b>)
            </span>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <input
              type={show ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              maxLength={6}
              autoFocus={!!slug}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-testid="kitchen-pin-input"
              style={{ fontSize: 22, letterSpacing: 8, textAlign: "center", padding: "14px 44px 14px 12px", width: "100%", background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, outline: "none" }}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              data-testid="kitchen-pin-toggle"
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex" }}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <button type="submit" className="submit-btn" disabled={loading} data-testid="kitchen-pin-submit" style={{ width: "100%", padding: "14px", fontSize: 15 }}>
          {loading ? "Verifying…" : "Unlock Display"}
        </button>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <Link to="/login" style={{ color: "var(--muted)", fontSize: 12 }} data-testid="kitchen-pin-back">← Back to Login</Link>
        </div>
      </form>
    </div>
  );
}

const ACTIVE = ["new", "cooking", "done"];

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr`;
  const days = Math.floor(diff / 86400);
  return `${days} ${days === 1 ? "day" : "days"}`;
};

const nextStatus = (s) => ({ new: "cooking", cooking: "done", done: "delivered" }[s]);

const isToday = (iso) => {
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  } catch {
    return false;
  }
};

export default function Kitchen() {
  const navigate = useNavigate();
  const { slug: slugParam } = useParams();
  const [authed, setAuthed] = useState(!!localStorage.getItem(KITCHEN_TOKEN_KEY));
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("active");
  const [refreshing, setRefreshing] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.warn("kitchen logout failed:", err?.message);
    }
    localStorage.removeItem(KITCHEN_TOKEN_KEY);
    localStorage.removeItem("kitchen_slug");
    localStorage.removeItem("mgr_token");
    localStorage.removeItem("mgr_authed");
    localStorage.removeItem("mgr_role");
    setShowLogout(false);
    setAuthed(false);
    navigate("/login", { replace: true });
  };

  const refresh = useCallback(async (manual = false) => {
    if (!authed) return;
    if (manual) setRefreshing(true);
    try {
      const { data } = await api.get("/orders");
      setOrders(data);
      if (manual) toast.success("Refreshed");
    } catch {
      if (manual) toast.error("Couldn't refresh orders. Please try again.");
    } finally {
      if (manual) setTimeout(() => setRefreshing(false), 350);
    }
  }, [authed]);

  useEffect(() => {
    if (authed) refresh();
  }, [authed, refresh]);

  // Auto-refresh every 1 second
  useInterval(() => { if (authed) refresh(false); }, 1000);

  // Stats: count by status; "delivered" only counts today's
  const stats = useMemo(() => {
    const counts = { new: 0, cooking: 0, done: 0, delivered_today: 0 };
    orders.forEach((o) => {
      if (o.status === "new") counts.new += 1;
      else if (o.status === "cooking") counts.cooking += 1;
      else if (o.status === "done") counts.done += 1;
      else if (o.status === "delivered" && isToday(o.created_at)) counts.delivered_today += 1;
    });
    const active = counts.new + counts.cooking + counts.done;
    return { ...counts, active };
  }, [orders]);

  const advance = async (o) => {
    const nxt = nextStatus(o.status);
    if (!nxt) return;
    try {
      await api.put(`/orders/${o.id}`, { status: nxt });
      toast.success(`Order #${o.order_number} → ${nxt}`);
      refresh();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update that order. Please try again."));
    }
  };

  const filtered =
    filter === "active"
      ? orders.filter((o) => ACTIVE.includes(o.status))
      : orders.filter((o) => o.status === filter);

  if (!authed) return <KitchenPinGate slug={slugParam} onUnlock={() => setAuthed(true)} />;

  return (
    <div className="kitchen-shell" data-testid="kitchen-page">
      <div className="kitchen-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            className="sub-logout-btn"
            onClick={() => setShowLogout(true)}
            data-testid="kitchen-logout-btn"
          >
            <LogOut size={16} /> Logout
          </button>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="ZenTaap" style={{ height: 30 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--gold)", fontWeight: 700 }}>
            <ChefHat size={20} /> Kitchen Display
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="live-pill" data-testid="kitchen-live-pill">
            <div className="live-dot-g" /> Live · 1s
          </div>
          <button
            type="button"
            className="kitchen-refresh-btn"
            onClick={() => refresh(true)}
            disabled={refreshing}
            data-testid="kitchen-refresh-btn"
            title="Refresh now"
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Kitchen stat tiles */}
      <div className="kitchen-stats" data-testid="kitchen-stats">
        <div className="kitchen-stat new" data-testid="kstat-new">
          <ClipboardList size={18} />
          <div>
            <div className="kstat-label">New Orders</div>
            <div className="kstat-value">{stats.new}</div>
          </div>
        </div>
        <div className="kitchen-stat active" data-testid="kstat-active">
          <Flame size={18} />
          <div>
            <div className="kstat-label">Active Orders</div>
            <div className="kstat-value">{stats.active}</div>
          </div>
        </div>
        <div className="kitchen-stat cooking" data-testid="kstat-cooking">
          <CheckCircle2 size={18} />
          <div>
            <div className="kstat-label">Cooking</div>
            <div className="kstat-value">{stats.cooking}</div>
          </div>
        </div>
        <div className="kitchen-stat delivered" data-testid="kstat-delivered">
          <PackageCheck size={18} />
          <div>
            <div className="kstat-label">Delivered Today</div>
            <div className="kstat-value">{stats.delivered_today}</div>
          </div>
        </div>
      </div>

      <div className="filter-tabs" data-testid="kitchen-filter" style={{ marginBottom: 18 }}>
        {[
          { k: "active", l: "Active" },
          { k: "new", l: "New" },
          { k: "cooking", l: "Cooking" },
          { k: "done", l: "Ready" },
          { k: "delivered", l: "Delivered" },
        ].map((x) => (
          <button
            key={x.k}
            className={`filter-tab ${filter === x.k ? "active" : ""}`}
            onClick={() => setFilter(x.k)}
            data-testid={`kitchen-filter-${x.k}`}
          >
            {x.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: 60 }} data-testid="kitchen-empty">
          No active tickets. Caught up!
        </div>
      )}

      <div className="ticket-grid" data-testid="ticket-grid">
        {filtered.map((o) => {
          const nxt = nextStatus(o.status);
          return (
            <div key={o.id} className={`ticket-card ${o.status}`} data-testid={`ticket-${o.order_number}`}>
              <div className="ticket-head">
                <div>
                  <div className="ticket-num">#{o.order_number}</div>
                  <div className="ticket-table">{o.table === 0 || o.table == null ? "Walk-in" : `Table ${o.table}`}</div>
                </div>
                <div className="ticket-time">
                  <Clock size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
                  {timeAgo(o.created_at)}
                </div>
              </div>
              <ul className="ticket-items">
                {o.items.map((it, i) => (
                  <li key={`${o.id}-${it.name}-${i}`}>
                    <span>{it.name}</span>
                    <span className="qty-pill">×{it.qty}</span>
                  </li>
                ))}
              </ul>
              <div className="ticket-actions">
                {nxt ? (
                  <button
                    className="submit-btn"
                    onClick={() => advance(o)}
                    data-testid={`ticket-advance-${o.order_number}`}
                  >
                    → Mark {nxt}
                  </button>
                ) : (
                  <div className="ticket-status-done" data-testid={`ticket-final-${o.order_number}`}>
                    {o.status === "delivered" ? "Delivered" : "Ready"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LogoutDialog
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
        description="You will be signed out of the kitchen display and returned to the login screen."
      />
    </div>
  );
}
