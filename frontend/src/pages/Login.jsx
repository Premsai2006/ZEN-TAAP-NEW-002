import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, ChefHat, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import ForgotPinDialog from "@/components/auth/ForgotPinDialog";

export default function Login() {
  const [contact, setContact] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();

  const onPinChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
    setPin(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (contact.replace(/[^0-9]/g, "").length < 7) {
      toast.error("Please enter the phone number on your account.");
      return;
    }
    if (!pin || pin.length < 4) {
      toast.error("Please enter your PIN.");
      return;
    }
    setLoading(true);
    try {
      let deviceId = localStorage.getItem("mgr_device_id");
      if (!deviceId) {
        deviceId = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 16);
        localStorage.setItem("mgr_device_id", deviceId);
      }
      let label = "Browser";
      try {
        const ua = navigator.userAgent || "";
        const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
        const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
        label = os ? `${browser} on ${os}` : browser;
      } catch {
        /* default */
      }
      const { data } = await api.post("/auth/login", {
        pin,
        contact_number: contact.trim(),
        device_id: deviceId,
        device_label: label,
      });
      if (data.token) {
        if (data.landing === "kitchen") {
          localStorage.removeItem("mgr_token");
          localStorage.removeItem("mgr_authed");
          localStorage.removeItem("mgr_role");
          localStorage.setItem("kitchen_token", data.token);
          if (data.slug) localStorage.setItem("kitchen_slug", data.slug);
        } else {
          localStorage.removeItem("kitchen_token");
          localStorage.setItem("mgr_authed", "1");
          localStorage.setItem("mgr_token", data.token);
          if (data.role) localStorage.setItem("mgr_role", data.role);
        }
      }
      if (data.slug) localStorage.setItem("mgr_slug", data.slug);
      if (data.restaurant_id) localStorage.setItem("mgr_restaurant_id", data.restaurant_id);
      if (data.active_devices >= data.max_devices) {
        toast.success(`Welcome back · ${data.active_devices}/${data.max_devices} devices used`);
      } else {
        toast.success(data.staff_name ? `Welcome back, ${data.staff_name}` : "Welcome back");
      }
      setPin("");
      if (data.landing === "kitchen") {
        navigate(data.slug ? `/kitchen/${data.slug}` : "/kitchen");
      } else {
        navigate("/manager/orders");
      }
    } catch (err) {
      setPin("");
      toast.error(friendlyError(err, "Couldn't log you in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell" data-testid="login-page">
      <form className="login-card" onSubmit={submit} data-testid="login-form" autoComplete="off">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div className="brand-logo-wrap" style={{ display: "inline-block" }}>
            <img src="/logo.png" alt="ZenTaap" className="brand-logo" style={{ height: 56 }} />
          </div>
        </div>
        <div className="font-serif" style={{ fontSize: 26, marginBottom: 6, textAlign: "center" }}>
          Login
        </div>
        <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 26, textAlign: "center" }}>
          Enter the restaurant phone number and your PIN
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Phone number</label>
          <input
            type="tel"
            name="zentaap-phone"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Registered mobile number"
            autoFocus
            autoComplete="tel"
            inputMode="tel"
            data-testid="login-contact-input"
            style={{
              fontSize: 15,
              padding: "12px 14px",
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              borderRadius: 8,
              outline: "none",
            }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 18 }}>
          <label className="form-label">PIN</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPin ? "text" : "password"}
              name="zentaap-pin"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={onPinChange}
              placeholder="Your staff PIN"
              maxLength={10}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              data-testid="login-pin-input"
              className={showPin ? "" : "pin-masked"}
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

        <div style={{ textAlign: "center", marginTop: 28 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>New to ZenTaap?</div>
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

        <div className="login-extra">
          <a
            href="/kitchen"
            className="role-card role-card-kitchen"
            data-testid="kitchen-view-link"
          >
            <div className="role-card-icon">
              <ChefHat size={22} />
            </div>
            <div className="role-card-body">
              <div className="role-card-title">Kitchen Display</div>
              <div className="role-card-sub">Live tickets</div>
            </div>
            <ArrowRight size={16} className="role-card-arrow" />
          </a>
        </div>
      </form>

      <ForgotPinDialog open={showForgot} onClose={() => setShowForgot(false)} />
    </div>
  );
}
