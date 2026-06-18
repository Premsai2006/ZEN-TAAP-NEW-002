import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, X, Eye, EyeOff, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useInterval } from "@/hooks/useInterval";

const CUSTOMER_TOKEN_KEY = "tt_customer_token";

function CustomerPinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) return toast.error("Enter the customer PIN");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/customer-login", { pin });
      localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
      onUnlock();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Incorrect PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pin-gate-shell" data-testid="customer-pin-gate">
      <form className="pin-gate-card" onSubmit={submit}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="TableTaap" style={{ height: 42 }} />
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "var(--gold)",
            fontSize: 12,
            fontWeight: 700,
            background: "rgba(232,125,47,0.10)",
            border: "1px solid rgba(232,125,47,0.35)",
            borderRadius: 999,
            padding: "4px 12px",
            marginBottom: 14,
          }}
        >
          <Lock size={11} /> CUSTOMER ACCESS
        </div>
        <div className="font-serif" style={{ fontSize: 24, marginBottom: 6 }}>
          Enter Customer PIN
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22 }}>
          4–6 digit PIN. Ask your server if you don&apos;t know it.
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
              data-testid="customer-pin-input"
              style={{
                fontSize: 22,
                letterSpacing: 8,
                textAlign: "center",
                padding: "14px 44px 14px 12px",
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                borderRadius: 8,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              data-testid="customer-pin-toggle"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
          data-testid="customer-pin-submit"
          style={{ width: "100%", padding: "14px", fontSize: 15 }}
        >
          {loading ? "Verifying…" : "Unlock Menu"}
        </button>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            type="button"
            onClick={() => navigate("/login")}
            style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer" }}
            data-testid="customer-pin-back"
          >
            ← Back to Login
          </button>
        </div>
      </form>
    </div>
  );
}

function CartDrawer({ cart, setCart, onClose, onPlaceOrder, placing }) {
  const [tableNum, setTableNum] = useState("");
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
    const n = parseInt(tableNum, 10);
    if (!n || n < 1) return toast.error("Enter a valid table number");
    if (cart.length === 0) return toast.error("Your cart is empty");
    onPlaceOrder(n);
  };

  return (
    <div className="cart-overlay" onClick={onClose} data-testid="cart-overlay">
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()} data-testid="cart-drawer">
        <div className="cart-header">
          <div className="font-serif" style={{ fontSize: 20 }}>
            Your Cart
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
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Table Number</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 5"
                value={tableNum}
                onChange={(e) => setTableNum(e.target.value)}
                data-testid="cart-table-input"
              />
            </div>
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

export default function Customer() {
  const [authed, setAuthed] = useState(!!localStorage.getItem(CUSTOMER_TOKEN_KEY));
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState("all");
  const [cart, setCart] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  const refresh = async () => {
    try {
      const [m, c] = await Promise.all([api.get("/menu"), api.get("/categories")]);
      setMenu(m.data);
      setCategories(c.data);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    if (authed) refresh();
  }, [authed]);

  useInterval(() => {
    if (authed) refresh();
  }, 2000);

  if (!authed) return <CustomerPinGate onUnlock={() => setAuthed(true)} />;

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
      const amount = cart.reduce((s, l) => s + l.qty * l.price, 0);
      await api.post("/orders", { table: tableN, items, amount });
      toast.success(`Order placed for Table ${tableN}!`);
      setCart([]);
      setDrawerOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

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

      {cartCount > 0 && (
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
          onClose={() => setDrawerOpen(false)}
          onPlaceOrder={placeOrder}
          placing={placing}
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
