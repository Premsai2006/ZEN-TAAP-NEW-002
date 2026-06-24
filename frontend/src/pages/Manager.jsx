import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Grid3x3, UtensilsCrossed, BarChart3, LogOut, Settings as SettingsIcon, User, Lock, ArrowRight, Menu, X, CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import { useInterval } from "@/hooks/useInterval";
import OrdersSection from "@/components/manager/OrdersSection";
import TablesSection from "@/components/manager/TablesSection";
import MenuSection from "@/components/manager/MenuSection";
import SalesSection from "@/components/manager/SalesSection";
import ProfileSection from "@/components/manager/ProfileSection";
import SettingsSection from "@/components/manager/SettingsSection";
import LogoutDialog from "@/components/manager/LogoutDialog";

const NAV = [
  { key: "orders", label: "Live Orders", icon: ClipboardList },
  { key: "tables", label: "Tables", icon: Grid3x3 },
  { key: "menu", label: "Menu Management", icon: UtensilsCrossed },
  { key: "sales", label: "Sales", icon: BarChart3 },
  { key: "profile", label: "Profile", icon: User },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export default function Manager() {
  // Default landing section is "orders". When subscription is locked/expired, the gating
  // useEffect below switches it to "profile" automatically (no flash).
  const [active, setActive] = useState("orders");
  const [showLogout, setShowLogout] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [clock, setClock] = useState("");
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const [o, m, c, s, st, sub] = await Promise.all([
        api.get("/orders"),
        api.get("/menu"),
        api.get("/categories"),
        api.get("/stats/today"),
        api.get("/settings"),
        api.get("/subscription"),
      ]);
      setOrders(o.data);
      setMenu(m.data);
      setCategories(c.data);
      setStats(s.data);
      setSettings(st.data);
      setSubscription(sub.data);
    } catch (err) {
      // Silent on 1s poll loop — would spam the toast. Log so devs see it in console.
      console.warn("Manager.refresh failed:", err?.response?.status, err?.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto refresh every 1 second
  useInterval(refresh, 1000);

  // Clock with month + date
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      let h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      const monthShort = d.toLocaleString("en-IN", { month: "short" });
      const day = d.getDate();
      setClock(`${monthShort} ${day} · ${h.toString().padStart(2, "0")}:${m} ${ampm}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // Even if the server call fails, we still clear local state so the user
      // is logged out client-side. Log so devs can see it.
      console.warn("logout request failed:", err?.message);
    }
    localStorage.removeItem("mgr_token");
    localStorage.removeItem("mgr_authed");
    navigate("/login");
  };

  const activeNav = NAV.find((n) => n.key === active);
  const hasAccess = !subscription || subscription.has_access !== false;

  // Force-redirect to /subscribe ONLY if subscription has hard-expired (not just 'none/skipped'):
  // expired managers must take action; first-time visitors stay in Explore Mode.
  useEffect(() => {
    if (subscription?.status === "expired" && !["profile", "settings"].includes(active)) {
      navigate("/subscribe", { replace: true });
    }
  }, [subscription?.status, active, navigate]);

  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className={`layout ${mobileNav ? "mobile-nav-open" : ""}`} data-testid="manager-dashboard">
      {/* Mobile menu toggle (visible on small screens) */}
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setMobileNav((v) => !v)}
        aria-label="Toggle navigation"
        data-testid="mobile-nav-toggle"
      >
        {mobileNav ? <X size={18} /> : <Menu size={18} />}
      </button>
      {mobileNav && <div className="mobile-nav-backdrop" onClick={() => setMobileNav(false)} />}

      <aside className="sidebar" data-testid="sidebar">
        <div style={{ marginBottom: 22, padding: "4px 8px" }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="ZenTaap" className="brand-logo" style={{ height: 30 }} />
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <div
                key={n.key}
                className={`nav-link ${active === n.key ? "active" : ""}`}
                onClick={() => {
                  setActive(n.key);
                  setMobileNav(false);
                }}
                data-testid={`nav-${n.key}`}
              >
                <Icon size={16} className="icon" />
                <span>{n.label}</span>
              </div>
            );
          })}
          {/* Subscribe link — always available */}
          <div
            className="nav-link"
            onClick={() => { navigate("/subscribe"); setMobileNav(false); }}
            data-testid="nav-subscribe"
            style={{ marginTop: 6, color: "var(--gold)" }}
          >
            <CreditCard size={16} className="icon" />
            <span>Subscription</span>
          </div>
        </nav>

        <div
          className="nav-link"
          onClick={() => setShowLogout(true)}
          data-testid="sidebar-logout-btn"
          style={{ marginTop: 8, color: "var(--red)", borderColor: "rgba(217,99,99,0.25)" }}
        >
          <LogOut size={16} className="icon" />
          <span>Logout</span>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="page-title" data-testid="page-title">{activeNav?.label}</div>
          <div className="topbar-right">
            <div className="live-pill">
              <div className="live-dot-g" /> Live · auto-refresh 1s
            </div>
            <span style={{ fontSize: 13, color: "var(--muted)" }} data-testid="top-clock">
              {clock}
            </span>
          </div>
        </div>

        {/* Lock banner — shown when subscription is not active (none/skipped/expired). */}
        {subscription && !["trial", "active"].includes(subscription.status) && (
          <div className="explore-banner" data-testid="explore-mode-banner">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 220 }}>
              <Lock size={18} color="var(--gold)" />
              <div className="explore-banner-text">
                {subscription.status === "expired" ? (
                  <>
                    <b>Subscription expired</b> — Your last cycle ended on{" "}
                    <b>{subscription.cycle_end ? new Date(subscription.cycle_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b>.
                    Pay to resume orders, billing &amp; analytics.
                  </>
                ) : (
                  <>
                    <b>Explore Mode</b> — Browse freely, but you&apos;ll need an active subscription to take orders, generate bills &amp; mark tickets. Start your <b>4-day free trial</b> any time.
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              className="explore-banner-cta"
              onClick={() => navigate("/subscribe")}
              data-testid="explore-subscribe-btn"
            >
              {subscription.status === "expired" ? "Pay & Resume" : "Start Free Trial"} <ArrowRight size={14} />
            </button>
          </div>
        )}

        {active === "orders" && (
          <OrdersSection
            orders={orders}
            stats={stats}
            settings={settings}
            showRevenue={showRevenue}
            setShowRevenue={setShowRevenue}
            onRefresh={refresh}
          />
        )}
        {active === "tables" && <TablesSection orders={orders} subscription={subscription} />}
        {active === "menu" && (
          <MenuSection
            menu={menu}
            categories={categories}
            onRefresh={refresh}
          />
        )}
        {active === "sales" && (
          <SalesSection
            stats={stats}
            showRevenue={showRevenue}
            setShowRevenue={setShowRevenue}
            onLogoutClick={() => setShowLogout(true)}
          />
        )}
        {active === "profile" && <ProfileSection onRefresh={refresh} />}
        {active === "settings" && <SettingsSection settings={settings} onRefresh={refresh} />}
      </div>

      <LogoutDialog
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
