import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Grid3x3, UtensilsCrossed, BarChart3, LogOut, Settings as SettingsIcon, User, Lock, ArrowRight, Menu, X, CreditCard } from "lucide-react";
import { toast } from "sonner";
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
  { key: "orders", label: "Live Orders", icon: ClipboardList, needsSub: true },
  { key: "tables", label: "Tables", icon: Grid3x3, needsSub: true },
  { key: "menu", label: "Menu Management", icon: UtensilsCrossed, needsSub: true },
  { key: "sales", label: "Sales", icon: BarChart3, needsSub: true },
  { key: "profile", label: "Profile", icon: User, needsSub: false },
  { key: "settings", label: "Settings", icon: SettingsIcon, needsSub: false },
];

const LIVE_TABS = new Set(["orders", "tables"]);

export default function Manager() {
  const [active, setActive] = useState("orders");
  const [showLogout, setShowLogout] = useState(false);
  const [showRevenue, setShowRevenue] = useState(() => {
    try { return localStorage.getItem("tt_show_revenue") === "1"; } catch { return false; }
  });
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [restaurantSlug, setRestaurantSlug] = useState(() => {
    try { return localStorage.getItem("mgr_slug") || ""; } catch { return ""; }
  });
  const [clock, setClock] = useState("");
  const navigate = useNavigate();

  const setShowRevenuePersist = useCallback((v) => {
    const next = typeof v === "function" ? v(showRevenue) : v;
    setShowRevenue(next);
    try { localStorage.setItem("tt_show_revenue", next ? "1" : "0"); } catch { /* ignore */ }
  }, [showRevenue]);

  const refresh = useCallback(async () => {
    try {
      // On Settings/Profile, skip live orders/stats polling payload (issue #19)
      if (active === "settings" || active === "profile") {
        const [st, sub, prof] = await Promise.all([
          api.get("/settings"),
          api.get("/subscription"),
          api.get("/profile"),
        ]);
        setSettings(st.data);
        setSubscription(sub.data);
        if (prof.data?.slug) {
          setRestaurantSlug(prof.data.slug);
          try { localStorage.setItem("mgr_slug", prof.data.slug); } catch { /* ignore */ }
        }
        return;
      }
      const hasAccess = !subscription || ["trial", "active"].includes(subscription.status);
      // allSettled so a 402 on gated stats doesn't blank the dashboard (issue #7)
      const results = await Promise.allSettled([
        api.get("/orders"),
        api.get("/menu"),
        api.get("/categories"),
        hasAccess ? api.get("/stats/today") : Promise.resolve({ data: null }),
        api.get("/settings"),
        api.get("/subscription"),
        api.get("/profile"),
      ]);
      const val = (i) => (results[i].status === "fulfilled" ? results[i].value.data : undefined);
      if (val(0) !== undefined) setOrders(val(0));
      if (val(1) !== undefined) setMenu(val(1));
      if (val(2) !== undefined) setCategories(val(2));
      if (hasAccess && val(3) !== undefined) setStats(val(3));
      else if (!hasAccess) setStats(null);
      if (val(4) !== undefined) setSettings(val(4));
      if (val(5) !== undefined) setSubscription(val(5));
      if (val(6)?.slug) {
        setRestaurantSlug(val(6).slug);
        try { localStorage.setItem("mgr_slug", val(6).slug); } catch { /* ignore */ }
      }
    } catch (err) {
      console.warn("Manager.refresh failed:", err?.response?.status, err?.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only subscription.status gates stats fetch
  }, [active, subscription?.status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Fast poll only on live ops tabs; slower elsewhere; none on settings/profile
  const pollMs = LIVE_TABS.has(active) ? 2000 : (active === "sales" || active === "menu" ? 15000 : null);
  useInterval(refresh, pollMs);

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
      console.warn("logout request failed:", err?.message);
    }
    localStorage.removeItem("mgr_token");
    localStorage.removeItem("mgr_authed");
    navigate("/login");
  };

  const activeNav = NAV.find((n) => n.key === active);
  const subStatus = subscription?.status;
  const locked = subscription && !["trial", "active"].includes(subStatus);

  useEffect(() => {
    if (subscription?.status === "expired" && !["profile", "settings"].includes(active)) {
      navigate("/subscribe", { replace: true });
    }
  }, [subscription?.status, active, navigate]);

  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className={`layout ${mobileNav ? "mobile-nav-open" : ""}`} data-testid="manager-dashboard">
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
            const isLocked = locked && n.needsSub;
            return (
              <div
                key={n.key}
                className={`nav-link ${active === n.key ? "active" : ""} ${isLocked ? "locked" : ""}`}
                onClick={() => {
                  if (isLocked) {
                    toast.message(`${n.label} needs an active subscription to use.`, {
                      description: "You can browse; writes stay locked until you subscribe.",
                      id: `locked-${n.key}`,
                    });
                  }
                  setActive(n.key);
                  setMobileNav(false);
                }}
                data-testid={`nav-${n.key}`}
                title={isLocked ? "Requires an active subscription" : undefined}
              >
                <Icon size={16} className="icon" />
                <span>{n.label}</span>
                {isLocked && <Lock size={12} style={{ marginLeft: "auto", opacity: 0.7 }} />}
              </div>
            );
          })}
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
            {LIVE_TABS.has(active) && (
              <div className="live-pill">
                <div className="live-dot-g" /> Live · auto-refresh 2s
              </div>
            )}
            <span style={{ fontSize: 13, color: "var(--muted)" }} data-testid="top-clock">
              {clock}
            </span>
          </div>
        </div>

        {subscription && !["trial", "active"].includes(subscription.status) && (
          <div className="explore-banner" data-testid="explore-mode-banner">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1, minWidth: 220 }}>
              <Lock size={18} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div className="explore-banner-text">
                {subscription.status === "expired" ? (
                  <>
                    <b>Subscription expired</b> — cycle ended{" "}
                    <b>{subscription.cycle_end ? new Date(subscription.cycle_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b>.
                  </>
                ) : (
                  <>
                    <b>Explore Mode</b> — browse freely. Start a <b>4-day free trial</b> to unlock full features.
                  </>
                )}
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }} data-testid="feature-lock-matrix">
                  <b>Blocked without subscription:</b> placing/updating orders, generating bills, adding/editing menu items &amp; categories, and sales analytics APIs.
                  {" "}Profile &amp; Settings stay available.
                </div>
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
            setShowRevenue={setShowRevenuePersist}
            onRefresh={refresh}
            locked={locked}
            menu={menu}
          />
        )}
        {active === "tables" && (
          <TablesSection
            orders={orders}
            subscription={subscription}
            slug={restaurantSlug}
            restaurantName={settings?.restaurant_name}
          />
        )}
        {active === "menu" && (
          <MenuSection
            menu={menu}
            categories={categories}
            onRefresh={refresh}
            locked={locked}
          />
        )}
        {active === "sales" && (
          <SalesSection
            stats={stats}
            showRevenue={showRevenue}
            setShowRevenue={setShowRevenuePersist}
            onLogoutClick={() => setShowLogout(true)}
            locked={locked}
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
