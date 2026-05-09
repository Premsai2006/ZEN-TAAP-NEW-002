import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useInterval } from "@/hooks/useInterval";

export default function Customer() {
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState("all");

  const refresh = async () => {
    try {
      const [m, c] = await Promise.all([api.get("/menu"), api.get("/categories")]);
      setMenu(m.data);
      setCategories(c.data);
    } catch (err) {
      // silent
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  useInterval(refresh, 1000);

  const filtered = activeCat === "all" ? menu : menu.filter((m) => m.category === activeCat);

  return (
    <div className="main" style={{ maxWidth: 1100, margin: "0 auto" }} data-testid="customer-page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="TableTaap" className="brand-logo" style={{ height: 32 }} />
          </div>
        </div>
        <div className="live-pill">
          <div className="live-dot-g" /> Live menu
        </div>
      </div>

      <div className="filter-tabs" style={{ flexWrap: "wrap", marginBottom: 22 }}>
        <button
          className={`filter-tab ${activeCat === "all" ? "active" : ""}`}
          onClick={() => setActiveCat("all")}
          data-testid="cust-filter-all"
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`filter-tab ${activeCat === c.name ? "active" : ""}`}
            onClick={() => setActiveCat(c.name)}
            data-testid={`cust-filter-${c.slug}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="menu-mgmt-grid" data-testid="customer-menu-grid">
        {filtered.map((it) => (
          <div
            key={it.id}
            className={`menu-item-card ${!it.available ? "unavailable" : ""}`}
            data-testid={`cust-item-${it.id}`}
          >
            <div className="menu-item-left">
              <div className="menu-emoji">
                {it.image_url ? <img src={it.image_url} alt={it.name} /> : it.emoji}
              </div>
              <div>
                <div className="menu-item-name">
                  {it.name}{" "}
                  {!it.available && (
                    <span className="badge badge-na" style={{ marginLeft: 6 }} data-testid={`cust-na-${it.id}`}>
                      Not Available
                    </span>
                  )}
                </div>
                <div className="menu-item-cat">{it.category}</div>
              </div>
            </div>
            <div className="menu-item-price">₹{it.price}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>
            No items in this category.
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 30, fontSize: 12, color: "var(--muted)" }}>
        <a href="/login" style={{ color: "var(--gold)", textDecoration: "none" }} data-testid="back-to-login">
          ← Manager sign-in
        </a>
      </div>
    </div>
  );
}
