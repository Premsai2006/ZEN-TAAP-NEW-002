import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      return toast.error("Enter your admin username and password.");
    }
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", {
        username: username.trim(),
        password,
      });
      if (data.token) localStorage.setItem("admin_token", data.token);
      if (data.username) localStorage.setItem("admin_user", data.username);
      toast.success("Welcome back");
      navigate("/admin");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't log you in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell" data-testid="admin-login-page">
      <form className="login-card" onSubmit={submit} data-testid="admin-login-form">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div className="brand-logo-wrap" style={{ display: "inline-block" }}>
            <img src="/logo.png" alt="ZenTaap" className="brand-logo" style={{ height: 56 }} />
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
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
          <Shield size={12} /> ADMIN
        </div>
        <div className="font-serif" style={{ fontSize: 26, marginBottom: 6 }}>
          Admin login
        </div>
        <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 26 }}>
          Platform access for restaurants, subscriptions, and pricing.
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Username</label>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoFocus
            data-testid="admin-username"
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
          <label className="form-label">Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              data-testid="admin-password"
              style={{
                fontSize: 15,
                padding: "12px 44px 12px 14px",
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
              data-testid="admin-password-toggle"
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
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
          data-testid="admin-login-submit"
          style={{ width: "100%", padding: "14px", fontSize: 15 }}
        >
          {loading ? "Signing in…" : "Login"}
        </button>
      </form>
    </div>
  );
}
