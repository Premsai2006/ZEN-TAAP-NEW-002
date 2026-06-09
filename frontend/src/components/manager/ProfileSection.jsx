import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Phone, Store, User as UserIcon, Save, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ProfileSection({ subscription, onRefresh }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ manager_name: "", email: "", contact_number: "", restaurant_name: "" });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/profile")
      .then((r) => setProfile(r.data))
      .catch(() => {});
  }, []);

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/profile", profile);
      toast.success("Profile updated");
      setEditing(false);
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const initials = (profile.manager_name || "M")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sub = subscription || {};
  const status = sub.status || "none";
  const planName = sub.plan_info?.name;

  return (
    <div className="section active" data-testid="profile-section">
      {/* Profile card */}
      <div className="add-item-card" style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div
          style={{
            width: 86,
            height: 86,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--gold), var(--gold-soft))",
            color: "white",
            fontSize: 30,
            fontWeight: 700,
            fontFamily: "'Playfair Display', serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 6px 20px rgba(232,125,47,0.35)",
          }}
          data-testid="profile-avatar"
        >
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div className="font-serif" style={{ fontSize: 24, marginBottom: 2 }} data-testid="profile-name">
            {profile.manager_name || "Manager"}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
            <Store size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            {profile.restaurant_name || "—"}
          </div>
          <div style={{ display: "flex", gap: 18, color: "var(--muted)", fontSize: 13, flexWrap: "wrap" }}>
            <span data-testid="profile-email">
              <Mail size={12} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              {profile.email || "No email set"}
            </span>
            <span data-testid="profile-phone">
              <Phone size={12} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              {profile.contact_number || "—"}
            </span>
          </div>
        </div>
        <button
          className="mini-btn"
          onClick={() => setEditing((v) => !v)}
          data-testid="profile-edit-btn"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing && (
        <form className="add-item-card" onSubmit={save} data-testid="profile-edit-form">
          <div className="font-serif" style={{ fontSize: 18, marginBottom: 14 }}>
            Edit Profile
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                <UserIcon size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Manager Name
              </label>
              <input
                type="text"
                value={profile.manager_name}
                onChange={(e) => set("manager_name", e.target.value)}
                data-testid="profile-name-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                <Store size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Restaurant Name
              </label>
              <input
                type="text"
                value={profile.restaurant_name}
                onChange={(e) => set("restaurant_name", e.target.value)}
                data-testid="profile-restaurant-input"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                <Mail size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@restaurant.com"
                data-testid="profile-email-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                <Phone size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Contact Number
              </label>
              <input
                type="tel"
                value={profile.contact_number}
                onChange={(e) => set("contact_number", e.target.value)}
                data-testid="profile-phone-input"
              />
            </div>
          </div>
          <button type="submit" className="submit-btn" disabled={saving} data-testid="profile-save-btn">
            <Save size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </form>
      )}

      {/* Subscription card */}
      <SubscriptionCard subscription={sub} status={status} planName={planName} navigate={navigate} />
    </div>
  );
}

export function SubscriptionCard({ subscription, status, planName, navigate }) {
  const sub = subscription || {};
  const isActive = status === "trial" || status === "active";
  const isSkipped = status === "skipped";

  return (
    <div className="add-item-card" data-testid="subscription-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div className="font-serif" style={{ fontSize: 18 }}>
          Subscription
        </div>
        {isActive && (
          <span className="badge badge-done" data-testid="sub-status-active">
            <CheckCircle2 size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
            {status === "trial" ? "Free Trial" : "Active"}
          </span>
        )}
        {isSkipped && (
          <span className="badge badge-na" data-testid="sub-status-skipped">
            <XCircle size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
            View-only
          </span>
        )}
        {!isActive && !isSkipped && (
          <span className="badge badge-new" data-testid="sub-status-none">No plan</span>
        )}
      </div>

      {isActive ? (
        <>
          <div
            style={{
              background: "linear-gradient(135deg, rgba(232,125,47,0.18), rgba(232,125,47,0.06))",
              border: "1px solid rgba(232,125,47,0.45)",
              borderRadius: 12,
              padding: 18,
              marginBottom: 14,
            }}
          >
            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Current Plan
            </div>
            <div className="font-serif" style={{ fontSize: 30, color: "var(--gold)", marginTop: 4, marginBottom: 4 }} data-testid="sub-plan-name">
              {planName || "—"}
            </div>
            <div style={{ color: "var(--text)", fontSize: 13 }}>
              ₹{sub.plan_info?.price?.toLocaleString("en-IN") || "—"}/mo
            </div>
          </div>

          <div className="summary-trial-row">
            <span style={{ color: "var(--muted)" }}>Trial started</span>
            <span>{fmtDate(sub.trial_start)}</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-trial-row">
            <span style={{ color: "var(--muted)" }}>Trial ends</span>
            <span style={{ color: "var(--gold)" }}>{fmtDate(sub.trial_end)}</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-trial-row">
            <span style={{ color: "var(--muted)" }}>Autopay</span>
            <span style={{ color: "var(--green)" }}>Enabled</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-trial-row">
            <span style={{ color: "var(--muted)" }}>Payment method</span>
            <span style={{ textTransform: "capitalize" }}>{sub.payment_method || "—"}</span>
          </div>

          <button
            className="submit-btn ghost"
            onClick={() => navigate("/subscribe")}
            data-testid="sub-change-btn"
            style={{ marginTop: 16, width: "100%" }}
          >
            Change Plan
          </button>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "12px 8px 4px" }}>
          <Sparkles size={32} color="var(--gold)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
            {isSkipped ? "You skipped subscription" : "No active subscription"}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
            Subscribe to unlock all manager features and start a 5-day free trial.
          </div>
          <button
            className="submit-btn"
            onClick={() => navigate("/subscribe")}
            data-testid="sub-subscribe-btn"
          >
            Choose a Plan
          </button>
        </div>
      )}
    </div>
  );
}
