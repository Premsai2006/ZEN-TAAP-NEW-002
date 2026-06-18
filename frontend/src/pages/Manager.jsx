import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Grid3x3, UtensilsCrossed, BarChart3, LogOut, Settings as SettingsIcon, User, Lock, ArrowRight } from "lucide-react";
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
      // eslint-disable-next-line no-console
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

  const handleLogout = () => {
    localStorage.removeItem("mgr_token");
    navigate("/login");
  };

  const activeNav = NAV.find((n) => n.key === active);

  return (
    <div className="layout" data-testid="manager-dashboard">
      <aside className="sidebar">
        <div style={{ marginBottom: 22, padding: "4px 8px" }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="TableTaap" className="brand-logo" style={{ height: 30 }} />
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <div
                key={n.key}
                className={`nav-link ${active === n.key ? "active" : ""}`}
                onClick={() => setActive(n.key)}
                data-testid={`nav-${n.key}`}
              >
                <Icon size={16} className="icon" />
                <span>{n.label}</span>
              </div>
            );
          })}
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

        {/* Explore Mode banner — shown when no active subscription. Manager can VIEW but not USE features. */}
        {subscription && !["trial", "active"].includes(subscription.status) && (
          <div className="explore-banner" data-testid="explore-mode-banner">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 220 }}>
              <Lock size={18} color="var(--gold)" />
              <div className="explore-banner-text">
                <b>Explore Mode</b> — You&apos;re browsing TableTaap without an active subscription. Start your 4-day free trial to place orders, generate bills and unlock all features.
              </div>
            </div>
            <button
              type="button"
              className="explore-banner-cta"
              onClick={() => navigate("/subscribe")}
              data-testid="explore-subscribe-btn"
            >
              Start Free Trial <ArrowRight size={14} />
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
        {active === "tables" && <TablesSection orders={orders} />}
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
