import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChefHat, ArrowLeft, Clock, RefreshCw, ClipboardList, Flame, CheckCircle2, PackageCheck, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useInterval } from "@/hooks/useInterval";

const KITCHEN_TOKEN_KEY = "kitchen_token";

function KitchenPinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) return toast.error("Enter the Kitchen PIN");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/kitchen-login", { pin });
      localStorage.setItem(KITCHEN_TOKEN_KEY, data.token);
      onUnlock();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Incorrect PIN");
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

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <input
              type={show ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              maxLength={6}
              autoFocus
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
  const [authed, setAuthed] = useState(!!localStorage.getItem(KITCHEN_TOKEN_KEY));
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("active");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (manual = false) => {
    if (!authed) return;
    if (manual) setRefreshing(true);
    try {
      const { data } = await api.get("/orders");
      setOrders(data);
      if (manual) toast.success("Refreshed");
    } catch {
      if (manual) toast.error("Could not refresh");
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
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  const filtered =
    filter === "active"
      ? orders.filter((o) => ACTIVE.includes(o.status))
      : orders.filter((o) => o.status === filter);

  if (!authed) return <KitchenPinGate onUnlock={() => setAuthed(true)} />;

  return (
    <div className="kitchen-shell" data-testid="kitchen-page">
      <div className="kitchen-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link to="/login" className="sub-back-btn" data-testid="kitchen-back-btn">
            <ArrowLeft size={16} /> Login
          </Link>
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
              {nxt && (
                <div className="ticket-actions">
                  <button
                    className="submit-btn"
                    onClick={() => advance(o)}
                    data-testid={`ticket-advance-${o.order_number}`}
                  >
                    → Mark {nxt}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
