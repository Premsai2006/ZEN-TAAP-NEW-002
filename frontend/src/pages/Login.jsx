import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ChefHat, Lock } from "lucide-react";

export default function Login() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onPinChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
    setPin(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) {
      toast.error("Enter your PIN");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { pin });
      localStorage.setItem("mgr_token", data.token);
      toast.success("Welcome back, Manager");
      navigate("/manager");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell" data-testid="login-page">
      <form className="login-card" onSubmit={submit} data-testid="login-form">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <ChefHat size={28} color="var(--gold)" />
          <div className="font-serif" style={{ fontSize: 26, color: "var(--gold)" }}>
            TableTap
          </div>
        </div>
        <div className="font-serif" style={{ fontSize: 22, marginBottom: 8 }}>
          Manager Sign-in
        </div>
        <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 28 }}>
          Enter your numeric PIN (up to 10 digits) to access the dashboard.
        </div>

        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">
            <Lock size={12} style={{ display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />
            Manager PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={onPinChange}
            placeholder="• • • • • •"
            maxLength={10}
            autoFocus
            data-testid="login-pin-input"
            style={{
              fontSize: 20,
              letterSpacing: 6,
              textAlign: "center",
              padding: "16px 12px",
            }}
          />
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
          data-testid="login-submit-btn"
          style={{ width: "100%", padding: "14px", fontSize: 15 }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--muted)" }}>
          Default PIN: <span style={{ color: "var(--gold)" }}>123456</span>
        </div>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a
            href="/customer"
            style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}
            data-testid="customer-view-link"
          >
            View customer menu →
          </a>
        </div>
      </form>
    </div>
  );
}
