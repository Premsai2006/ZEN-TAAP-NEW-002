import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function Signup() {
  const [form, setForm] = useState({
    manager_name: "",
    restaurant_name: "",
    contact_number: "",
    pin: "",
    confirm_pin: "",
  });
  const [accountExists, setAccountExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/auth/status")
      .then((r) => {
        setAccountExists(!!r.data.setup_complete);
      })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.manager_name.trim()) return toast.error("Manager name is required");
    if (!form.restaurant_name.trim()) return toast.error("Restaurant name is required");
    const digits = form.contact_number.replace(/[^0-9]/g, "");
    if (digits.length < 7) return toast.error("Enter a valid contact number");
    if (form.pin.length < 4) return toast.error("PIN must be at least 4 digits");
    if (form.pin !== form.confirm_pin) return toast.error("PINs do not match");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", {
        manager_name: form.manager_name.trim(),
        restaurant_name: form.restaurant_name.trim(),
        contact_number: form.contact_number.trim(),
        pin: form.pin,
      });
      localStorage.setItem("mgr_token", data.token);
      toast.success("Account created — welcome!");
      navigate("/manager");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell" data-testid="signup-page">
      <form className="login-card wide" onSubmit={submit} data-testid="signup-form">
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div className="brand-logo-wrap">
            <img src="/logo.png" alt="TableTaap" className="brand-logo" style={{ height: 40 }} />
          </div>
        </div>
        <div className="font-serif" style={{ fontSize: 24, marginBottom: 6, textAlign: "center" }}>
          Create your account
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24, textAlign: "center" }}>
          First-time setup — register your restaurant and choose your PIN.
        </div>

        {accountExists && (
          <div
            data-testid="signup-existing-notice"
            style={{
              background: "rgba(232,125,47,0.10)",
              border: "1px solid rgba(232,125,47,0.4)",
              color: "var(--gold)",
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 18,
              textAlign: "center",
            }}
          >
            An account is already registered on this device.{" "}
            <a href="/login" style={{ color: "var(--gold)", fontWeight: 600 }}>Login here</a>.
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Manager Name</label>
          <input
            type="text"
            value={form.manager_name}
            onChange={(e) => set("manager_name", e.target.value)}
            placeholder="Your full name"
            data-testid="signup-manager-name"
            autoFocus
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Restaurant Name</label>
          <input
            type="text"
            value={form.restaurant_name}
            onChange={(e) => set("restaurant_name", e.target.value)}
            placeholder="e.g. TableTaap Bistro"
            data-testid="signup-restaurant-name"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Contact Number</label>
          <input
            type="tel"
            inputMode="tel"
            value={form.contact_number}
            onChange={(e) => set("contact_number", e.target.value)}
            placeholder="+91 …"
            data-testid="signup-contact-number"
          />
          <span style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
            Used to recover your PIN if you forget it.
          </span>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Set PIN (4–10 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={(e) => set("pin", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              placeholder=""
              maxLength={10}
              data-testid="signup-pin"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={form.confirm_pin}
              onChange={(e) => set("confirm_pin", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              placeholder=""
              maxLength={10}
              data-testid="signup-confirm-pin"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
          data-testid="signup-submit-btn"
          style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 8 }}
        >
          {loading ? "Creating…" : "Create Account"}
        </button>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "var(--muted)" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--gold)", textDecoration: "none" }} data-testid="back-to-login-link">
            Login
          </a>
        </div>
      </form>
    </div>
  );
}
