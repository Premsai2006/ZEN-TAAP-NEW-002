import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Grid3x3, UtensilsCrossed, BarChart3, LogOut, ChefHat } from "lucide-react";
import { api } from "@/lib/api";
import { useInterval } from "@/hooks/useInterval";
import OrdersSection from "@/components/manager/OrdersSection";
import TablesSection from "@/components/manager/TablesSection";
import MenuSection from "@/components/manager/MenuSection";
import SalesSection from "@/components/manager/SalesSection";
import LogoutDialog from "@/components/manager/LogoutDialog";

const NAV = [
  { key: "orders", label: "Live Orders", icon: ClipboardList },
  { key: "tables", label: "Tables", icon: Grid3x3 },
  { key: "menu", label: "Menu Management", icon: UtensilsCrossed },
  { key: "sales", label: "Sales Today", icon: BarChart3 },
];

export default function Manager() {
  const [active, setActive] = useState("orders");
  const [showLogout, setShowLogout] = useState(false);
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [clock, setClock] = useState("");
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const [o, m, c, s] = await Promise.all([
        api.get("/orders"),
        api.get("/menu"),
        api.get("/categories"),
        api.get("/stats/today"),
      ]);
      setOrders(o.data);
      setMenu(m.data);
      setCategories(c.data);
      setStats(s.data);
    } catch (err) {
      // silent retry — auto refresh
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Auto refresh every 1 second
  useInterval(refresh, 1000);

  // Clock
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      let h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, "0");
      const s = d.getSeconds().toString().padStart(2, "0");
      const ampm = h >= 12 ? "pm" : "am";
      h = h % 12 || 12;
      setClock(`${h.toString().padStart(2, "0")}:${m}:${s} ${ampm}`);
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
        <div className="brand">
          <ChefHat size={20} style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          TableTap
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

        {active === "orders" && <OrdersSection orders={orders} stats={stats} onRefresh={refresh} />}
        {active === "tables" && <TablesSection orders={orders} />}
        {active === "menu" && (
          <MenuSection
            menu={menu}
            categories={categories}
            onRefresh={refresh}
          />
        )}
        {active === "sales" && (
          <SalesSection stats={stats} onLogoutClick={() => setShowLogout(true)} />
        )}
      </div>

      <LogoutDialog
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
