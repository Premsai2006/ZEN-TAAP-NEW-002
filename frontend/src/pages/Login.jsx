import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import ForgotPinDialog from "@/components/auth/ForgotPinDialog";

export default function Login() {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/auth/status")
      .then((r) => {
        if (!r.data.setup_complete) navigate("/signup", { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

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
      toast.success("Welcome back");
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
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div className="brand-logo-wrap" style={{ display: "inline-block" }}>
            <img src="/logo.png" alt="TableTaap" className="brand-logo" style={{ height: 56 }} />
          </div>
        </div>
        <div className="font-serif" style={{ fontSize: 26, marginBottom: 6, textAlign: "center" }}>
          Login
        </div>
        <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 26, textAlign: "center" }}>
          Enter your numeric PIN to access the dashboard
        </div>

        <div className="form-group" style={{ marginBottom: 18 }}>
          <label className="form-label">Manager PIN</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={onPinChange}
              placeholder=""
              maxLength={10}
              autoFocus
              data-testid="login-pin-input"
              style={{
                fontSize: 20,
                letterSpacing: 6,
                textAlign: "center",
                padding: "16px 44px 16px 12px",
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
              onClick={() => setShowPin((v) => !v)}
              data-testid="login-pin-toggle"
              title={showPin ? "Hide PIN" : "Show PIN"}
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
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
          data-testid="login-submit-btn"
          style={{ width: "100%", padding: "14px", fontSize: 15 }}
        >
          {loading ? "Signing in…" : "Login"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowForgot(true)}
            data-testid="forgot-pin-link"
          >
            Forgot PIN?
          </button>
        </div>

        {/* Create Account — bold and prominent (no highlight box) */}
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>New to TableTaap?</div>
          <a
            href="/signup"
            style={{
              color: "var(--gold)",
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: 0.5,
              textDecoration: "none",
              fontFamily: "'Playfair Display', serif",
            }}
            data-testid="signup-link"
          >
            Create Account →
          </a>
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a
            href="/customer"
            style={{ color: "var(--muted)", fontSize: 12, textDecoration: "none" }}
            data-testid="customer-view-link"
          >
            View customer menu →
          </a>
        </div>
      </form>

      <ForgotPinDialog open={showForgot} onClose={() => setShowForgot(false)} />
    </div>
  );
}
