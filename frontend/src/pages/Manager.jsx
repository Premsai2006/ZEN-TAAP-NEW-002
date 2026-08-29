import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

const Subscribe = lazy(() => import("@/pages/Subscribe"));

const NAV = [
  { key: "orders", label: "Live Orders", icon: ClipboardList, needsSub: true },
  { key: "tables", label: "Tables", icon: Grid3x3, needsSub: true },
  { key: "menu", label: "Menu Management", icon: UtensilsCrossed, needsSub: true },
  { key: "sales", label: "Sales", icon: BarChart3, needsSub: true },
  { key: "subscribe", label: "Subscription", icon: CreditCard, needsSub: false },
  { key: "profile", label: "Profile", icon: User, needsSub: false },
  { key: "settings", label: "Settings", icon: SettingsIcon, needsSub: false },
];

const LIVE_TABS = new Set(["orders", "tables"]);

export default function Manager() {
  const navigate = useNavigate();
  const { tab } = useParams();
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
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem("mgr_role") || "owner"; } catch { return "owner"; }
  });
  const [restaurantSlug, setRestaurantSlug] = useState(() => {
    try { return localStorage.getItem("mgr_slug") || ""; } catch { return ""; }
  });
  const [clock, setClock] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const cashier = role === "cashier";
  const canSubscribe = role === "owner" || role === "manager";
  const visibleNav = cashier
    ? NAV.filter((n) => n.key === "orders" || n.key === "tables")
    : canSubscribe
      ? NAV
      : NAV.filter((n) => n.key !== "subscribe");
  const allowed = visibleNav.map((n) => n.key);
  const active = allowed.includes(tab) ? tab : (allowed[0] || "orders");

  const setActive = (key) => {
    const next = allowed.includes(key) ? key : (allowed[0] || "orders");
    navigate(`/manager/${next}`);
    setMobileNav(false);
  };

  const setShowRevenuePersist = useCallback((v) => {
    const next = typeof v === "function" ? v(showRevenue) : v;
    setShowRevenue(next);
    try { localStorage.setItem("tt_show_revenue", next ? "1" : "0"); } catch { /* ignore */ }
  }, [showRevenue]);

  const refresh = useCallback(async () => {
    try {
      // On Settings/Profile, skip live orders/stats polling payload (issue #19)
      if (active === "settings" || active === "profile" || active === "subscribe") {
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
      const hasAccess = ["trial", "active"].includes(subscription?.status);
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

  useEffect(() => {
    api.get("/auth/me")
      .then(({ data }) => {
        const r = (data?.role || "owner").toLowerCase();
        setRole(r);
        try { localStorage.setItem("mgr_role", r); } catch { /* ignore */ }
        if (data?.slug) {
          setRestaurantSlug(data.slug);
          try { localStorage.setItem("mgr_slug", data.slug); } catch { /* ignore */ }
        }
        if (r === "kitchen") {
          const slug = data?.slug || restaurantSlug;
          navigate(slug ? `/kitchen/${slug}` : "/kitchen", { replace: true });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

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
    localStorage.removeItem("mgr_role");
    navigate("/login");
  };

  useEffect(() => {
    if (!tab || !allowed.includes(tab)) {
      navigate(`/manager/${allowed[0] || "orders"}`, { replace: true });
    }
  }, [tab, cashier, canSubscribe, navigate]);

  const activeNav = visibleNav.find((n) => n.key === active) || visibleNav[0];
  const subStatus = subscription?.status;
  const locked = subscription && !["trial", "active"].includes(subStatus);
  const expired = subStatus === "expired";
  const createLocked = Boolean(locked);
  const statusLocked = Boolean(locked) && !expired;

  return (
    <div className={`layout ${mobileNav ? "mobile-nav-open" : ""}`} data-testid="manager-dashboard">
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setMobileNav(true)}
        aria-label="Open navigation"
        data-testid="mobile-nav-toggle"
      >
        <Menu size={18} />
      </button>
      {mobileNav && <div className="mobile-nav-backdrop" onClick={() => setMobileNav(false)} />}

      <aside className="sidebar" data-testid="sidebar">
        <div className="sidebar-brand">
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
            data-testid="sidebar-close-btn"
          >
            <X size={18} />
          </button>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="ZenTaap" className="brand-logo" style={{ height: 30 }} />
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const liveWhenExpired = expired && (n.key === "orders" || n.key === "tables");
            const isLocked = locked && n.needsSub && !liveWhenExpired;
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
        </nav>

        <div
          className="nav-link"
          onClick={() => {
            setMobileNav(false);
            setShowLogout(true);
          }}
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

        {subscription && !["trial", "active"].includes(subscription.status) && active !== "subscribe" && (
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
                    <b>Explore Mode</b> — browse freely. Pay to subscribe and unlock full features. First-time subscribers get 4 extra days on the first billing period.
                  </>
                )}
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }} data-testid="feature-lock-matrix">
                  {subscription.status === "expired" ? (
                    <>
                      Finish tickets already in the kitchen, then bill and settle them.
                      New QR and walk-in orders stay blocked until you renew. Menu edits, sales, and downloadable table QRs stay locked.
                    </>
                  ) : (
                    <>
                      <b>Blocked without subscription:</b> placing/updating orders, generating bills, adding/editing menu items &amp; categories, sales analytics, and downloading clear table QRs.
                      {" "}Profile &amp; Settings stay available. Tables show blurred QRs — pay to unlock.
                    </>
                  )}
                </div>
              </div>
            </div>
            {canSubscribe && (
            <button
              type="button"
              className="explore-banner-cta"
              onClick={() => { setActive("subscribe"); }}
              data-testid="explore-subscribe-btn"
            >
              {subscription.status === "expired" ? "Pay & Resume" : "Subscribe"} <ArrowRight size={14} />
            </button>
            )}
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
            createLocked={createLocked}
            statusLocked={statusLocked}
            menu={menu}
          />
        )}
        {active === "tables" && (
          <TablesSection
            orders={orders}
            subscription={subscription}
            slug={restaurantSlug}
            restaurantName={settings?.restaurant_name}
            locked={locked}
            onOpenSubscribe={() => setActive("subscribe")}
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
        {active === "subscribe" && (
          <Suspense fallback={<div style={{ padding: 24, color: "var(--muted)" }}>Loading subscription…</div>}>
            <Subscribe
              embedded
              restaurantName={settings?.restaurant_name}
              onApplied={refresh}
              onGoTab={(key) => setActive(key)}
              onGoDashboard={() => {
                setActive("orders");
                refresh();
              }}
            />
          </Suspense>
        )}
        {active === "profile" && (
          <ProfileSection onRefresh={refresh} onOpenSubscribe={() => setActive("subscribe")} />
        )}
        {active === "settings" && <SettingsSection settings={settings} onRefresh={refresh} role={role} />}
      </div>

      <LogoutDialog
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
