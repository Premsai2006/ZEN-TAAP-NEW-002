import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, X, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { useInterval } from "@/hooks/useInterval";

function CartDrawer({ cart, setCart, tableLocked, onClose, onPlaceOrder, placing }) {
  const total = cart.reduce((sum, l) => sum + l.qty * l.price, 0);

  const updateQty = (id, delta) => {
    setCart((c) =>
      c
        .map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const removeLine = (id) => setCart((c) => c.filter((l) => l.id !== id));

  const handlePlace = () => {
    if (cart.length === 0) return toast.error("Your cart is empty. Add something tasty first.");
    onPlaceOrder(tableLocked);
  };

  return (
    <div className="cart-overlay" onClick={onClose} data-testid="cart-overlay">
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()} data-testid="cart-drawer">
        <div className="cart-header">
          <div className="cart-table-pill" data-testid="cart-table-pill">
            <span className="cart-table-dot" />
            {tableLocked ? `Table ${tableLocked}` : "Walk-in / Counter"}
          </div>
          <button
            onClick={onClose}
            data-testid="cart-close-btn"
            style={{ background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="cart-items" data-testid="cart-items">
          {cart.length === 0 && <div className="cart-empty">Your cart is empty. Tap + on a dish to add it.</div>}
          {cart.map((l) => (
            <div key={l.id} className="cart-row" data-testid={`cart-row-${l.id}`}>
              <div className="cart-row-img">
                {l.image_url ? <img src={l.image_url} alt={l.name} /> : <span style={{ fontSize: 20 }}>{l.emoji || "🍽️"}</span>}
              </div>
              <div className="cart-row-body">
                <div className="cart-row-name">{l.name}</div>
                <div className="cart-row-price">
                  ₹{l.price} · <b style={{ color: "var(--gold)" }}>₹{l.qty * l.price}</b>
                </div>
              </div>
              <div className="qty-stepper">
                <button onClick={() => updateQty(l.id, -1)} data-testid={`cart-dec-${l.id}`}>
                  <Minus size={12} />
                </button>
                <span className="qty-stepper-num" data-testid={`cart-qty-${l.id}`}>{l.qty}</span>
                <button onClick={() => updateQty(l.id, 1)} data-testid={`cart-inc-${l.id}`}>
                  <Plus size={12} />
                </button>
              </div>
              <button
                onClick={() => removeLine(l.id)}
                data-testid={`cart-remove-${l.id}`}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex" }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="cart-footer">
            <div className="cart-total-row">
              <span>Total</span>
              <span className="total-amt" data-testid="cart-total">₹{total}</span>
            </div>
            <button
              type="button"
              className="submit-btn"
              onClick={handlePlace}
              disabled={placing}
              data-testid="cart-place-order-btn"
              style={{ width: "100%", padding: "14px", fontSize: 15 }}
            >
              {placing ? "Placing…" : "Place Order"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderSuccessOverlay({ tableNum, orderNumber, onDone }) {
  // Auto-dismiss after a short celebration
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="order-success-overlay" data-testid="order-success-overlay" onClick={onDone}>
      <div className="order-success-card" onClick={(e) => e.stopPropagation()}>
        <div className="confetti">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className={`confetti-piece p${i % 6}`} style={{ left: `${(i * 5.5) % 100}%`, animationDelay: `${(i * 60) % 800}ms` }} />
          ))}
        </div>
        <div className="success-tick" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="80" height="80">
            <circle className="tick-circle" cx="26" cy="26" r="24" fill="none" stroke="var(--gold)" strokeWidth="2.5" />
            <path className="tick-check" fill="none" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M14 27 l8 8 l16 -18" />
          </svg>
        </div>
        <div className="font-serif" style={{ fontSize: 26, marginBottom: 6, color: "var(--gold)" }}>
          Order Placed!
        </div>
        <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 4 }}>
          {tableNum ? `Sit tight at Table ${tableNum} — kitchen is on it.` : "Sit tight — kitchen is on it."}
        </div>
        {orderNumber && (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Order ID · #{orderNumber}</div>
        )}
      </div>
    </div>
  );
}

export default function Customer() {
  const { slug } = useParams();
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState("all");
  const [cart, setCart] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null); // { tableNum, orderNumber }
  const [restaurantName, setRestaurantName] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Lock the table number from URL (?table=N). When missing/invalid -> null (walk-in).
  const tableFromUrl = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const n = parseInt(sp.get("table") || "", 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, []);

  const refresh = async () => {
    if (!slug) return;
    try {
      const [m, c, r] = await Promise.all([
        api.get(`/r/${slug}/menu`),
        api.get(`/r/${slug}/categories`),
        api.get(`/r/${slug}`),
      ]);
      setMenu(m.data);
      setCategories(c.data);
      setRestaurantName(r.data?.restaurant_name || "");
      setNotFound(false);
    } catch (err) {
      if (err?.response?.status === 404) setNotFound(true);
      console.warn("Customer.refresh failed:", err?.response?.status, err?.message);
    }
  };

  useEffect(() => { refresh(); }, [slug]);

  useInterval(() => refresh(), 2000);


  const filtered = activeCat === "all" ? menu : menu.filter((m) => m.category === activeCat);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const addToCart = (it) => {
    setCart((c) => {
      const existing = c.find((l) => l.id === it.id);
      if (existing) return c.map((l) => (l.id === it.id ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...c,
        { id: it.id, name: it.name, price: it.price, qty: 1, emoji: it.emoji, image_url: it.image_url },
      ];
    });
    toast.success(`${it.name} added`);
  };

  const updateCartQty = (id, delta) => {
    setCart((c) =>
      c
        .map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const placeOrder = async (tableN) => {
    setPlacing(true);
    try {
      const items = cart.map((l) => ({ name: l.name, qty: l.qty, price: l.price }));
      const { data } = await api.post(`/r/${slug}/orders`, { table: tableN || 0, items });
      setSuccessInfo({ tableNum: tableN || null, orderNumber: data?.order_number || null });
      setCart([]);
      setDrawerOpen(false);
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't place your order. Please try again."));
    } finally {
      setPlacing(false);
    }
  };

  if (!slug || notFound) {
    return (
      <div className="main" style={{ maxWidth: 480, margin: "80px auto", textAlign: "center" }}>
        <div className="font-serif" style={{ fontSize: 22, marginBottom: 8 }}>Restaurant not found</div>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          Check the QR code or ask staff for the correct ordering link.
        </div>
      </div>
    );
  }

  return (
    <div className="main" style={{ maxWidth: 1100, margin: "0 auto" }} data-testid="customer-page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="ZenTaap" className="brand-logo" style={{ height: 32 }} />
          </div>
          {restaurantName && (
            <div style={{ fontSize: 14, fontWeight: 600 }} data-testid="customer-restaurant-name">
              {restaurantName}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {tableFromUrl ? (
            <div className="table-badge" data-testid="customer-table-badge">
              <Lock size={11} /> Table {tableFromUrl}
            </div>
          ) : (
            <div className="table-badge walk-in" data-testid="customer-table-badge">
              Walk-in
            </div>
          )}
          <div className="live-pill">
            <div className="live-dot-g" /> Live menu
          </div>
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
        {filtered.map((it) => {
          const inCart = cart.find((l) => l.id === it.id);
          const qty = inCart?.qty || 0;
          return (
            <div
              key={it.id}
              className={`menu-item-card ${!it.available ? "unavailable" : ""} ${qty > 0 ? "in-cart" : ""}`}
              data-testid={`cust-item-${it.id}`}
            >
              <div className="menu-item-left">
                <div className="menu-emoji">
                  {it.image_url ? <img src={it.image_url} alt={it.name} /> : <span>🍽️</span>}
                </div>
                <div>
                  <div className="menu-item-name">
                    {it.name}{" "}
                    {!it.available && (
                      <span className="badge badge-na" style={{ marginLeft: 6 }} data-testid={`cust-na-${it.id}`}>
                        Not Available
                      </span>
                    )}
                    {qty > 0 && (
                      <span className="cart-qty-badge" data-testid={`cust-qty-badge-${it.id}`}>
                        Added × {qty}
                      </span>
                    )}
                  </div>
                  <div className="menu-item-cat">{it.category}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="menu-item-price">₹{it.price}</div>
                {it.available && (
                  qty === 0 ? (
                    <button
                      type="button"
                      className="add-to-cart-btn"
                      onClick={() => addToCart(it)}
                      data-testid={`cust-add-${it.id}`}
                    >
                      <Plus size={12} /> Add
                    </button>
                  ) : (
                    <div className="qty-stepper" data-testid={`cust-stepper-${it.id}`}>
                      <button onClick={() => updateCartQty(it.id, -1)} data-testid={`cust-dec-${it.id}`}>
                        <Minus size={12} />
                      </button>
                      <span className="qty-stepper-num" data-testid={`cust-qty-${it.id}`}>{qty}</span>
                      <button onClick={() => updateCartQty(it.id, 1)} data-testid={`cust-inc-${it.id}`}>
                        <Plus size={12} />
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>
            No items in this category.
          </div>
        )}
      </div>

      {cartCount > 0 && !drawerOpen && (
        <button
          type="button"
          className="cart-fab"
          onClick={() => setDrawerOpen(true)}
          data-testid="cart-fab"
        >
          <ShoppingCart size={16} /> View Cart
          <span className="cart-fab-badge" data-testid="cart-fab-count">{cartCount}</span>
        </button>
      )}

      {drawerOpen && (
        <CartDrawer
          cart={cart}
          setCart={setCart}
          tableLocked={tableFromUrl}
          onClose={() => setDrawerOpen(false)}
          onPlaceOrder={placeOrder}
          placing={placing}
        />
      )}

      {successInfo && (
        <OrderSuccessOverlay
          tableNum={successInfo.tableNum}
          orderNumber={successInfo.orderNumber}
          onDone={() => setSuccessInfo(null)}
        />
      )}

      <div style={{ textAlign: "center", marginTop: 30, fontSize: 12, color: "var(--muted)" }}>
        <a href="/login" style={{ color: "var(--gold)", textDecoration: "none" }} data-testid="back-to-login">
          ← Manager sign-in
        </a>
      </div>
    </div>
  );
}
