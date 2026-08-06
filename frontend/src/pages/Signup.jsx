import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { slugify, isValidSlug } from "@/lib/slug";

const PinInput = ({ value, onChange, testId, autoFocus }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
        maxLength={10}
        autoFocus={autoFocus}
        data-testid={testId}
        style={{
          letterSpacing: 4,
          textAlign: "center",
          padding: "10px 38px 10px 12px",
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--line)",
          color: "var(--text)",
          borderRadius: 8,
          outline: "none",
          fontSize: 14,
        }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        data-testid={`${testId}-toggle`}
        title={show ? "Hide PIN" : "Show PIN"}
        style={{
          position: "absolute",
          right: 8,
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
  );
};

export default function Signup() {
  const [form, setForm] = useState({
    manager_name: "",
    restaurant_name: "",
    slug: "",
    contact_number: "",
    email: "",
    pin: "",
    confirm_pin: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.manager_name.trim()) return toast.error("Please enter the manager's name.");
    if (!form.restaurant_name.trim()) return toast.error("Please enter your restaurant name.");
    const slug = slugify(form.slug || form.restaurant_name);
    if (!isValidSlug(slug)) {
      return toast.error("Restaurant URL can only use letters, numbers, and hyphens (min 2 characters).");
    }
    const digits = form.contact_number.replace(/[^0-9]/g, "");
    if (digits.length < 7) return toast.error("Please enter a valid phone number.");
    if (form.pin.length < 6) return toast.error("Your PIN needs to be at least 6 digits.");
    if (form.pin !== form.confirm_pin) return toast.error("Your PINs don't match — please try again.");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", {
        manager_name: form.manager_name.trim(),
        restaurant_name: form.restaurant_name.trim(),
        slug,
        contact_number: form.contact_number.trim(),
        email: form.email.trim(),
        pin: form.pin,
      });
      localStorage.setItem("mgr_token", data.token);
      if (data.slug) localStorage.setItem("mgr_slug", data.slug);
      if (data.restaurant_id) localStorage.setItem("mgr_restaurant_id", data.restaurant_id);
      toast.success("Account created — next, choose your plan.");
      navigate("/subscribe");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const previewSlug = slugify(slugTouched ? form.slug : form.slug || form.restaurant_name) || "your-restaurant";

  return (
    <div className="login-shell" data-testid="signup-page">
      <form className="login-card wide" onSubmit={submit} data-testid="signup-form">
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div className="brand-logo-wrap" data-testid="signup-brand">
            <img src="/logo.png" alt="ZenTaap" style={{ height: 50, display: "block" }} />
          </div>
        </div>
        <div className="font-serif" style={{ fontSize: 24, marginBottom: 6, textAlign: "center" }}>
          Create your account
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22, textAlign: "center" }}>
          Register your restaurant — each venue gets its own login and menu.
        </div>

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
            onChange={(e) => {
              const v = e.target.value;
              set("restaurant_name", v);
              if (!slugTouched) set("slug", slugify(v));
            }}
            placeholder="e.g. ZenTaap Bistro"
            data-testid="signup-restaurant-name"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Restaurant URL</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
            onPaste={(e) => {
              e.preventDefault();
              setSlugTouched(true);
              set("slug", slugify(e.clipboardData.getData("text")));
            }}
            placeholder="my-bistro"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            pattern="[a-z0-9-]*"
            title="Only lowercase letters, numbers, and hyphens"
            data-testid="signup-slug"
          />
          <span style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
            Letters, numbers, and hyphens only — customers order at zentaapqr.com/r/{previewSlug}
          </span>
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
            Used to log in and recover your PIN.
          </span>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Email (optional)</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@restaurant.com"
            data-testid="signup-email"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Set PIN (6–10 digits)</label>
            <PinInput value={form.pin} onChange={(v) => set("pin", v)} testId="signup-pin" />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm PIN</label>
            <PinInput value={form.confirm_pin} onChange={(v) => set("confirm_pin", v)} testId="signup-confirm-pin" />
          </div>
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
          data-testid="signup-submit-btn"
          style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 14 }}
        >
          {loading ? "Creating…" : "Create Account"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--gold)", textDecoration: "none" }} data-testid="back-to-login-link">
            Login
          </a>
        </div>
      </form>
    </div>
  );
}
