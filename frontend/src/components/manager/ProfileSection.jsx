import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Phone, Store, User as UserIcon, Save, CreditCard, Calendar, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { slugify, isValidSlug } from "@/lib/slug";

const fmtINR = (n) => `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
};

export default function ProfileSection({ onRefresh, onOpenSubscribe }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    manager_name: "",
    email: "",
    contact_number: "",
    restaurant_name: "",
    slug: "",
  });
  const [subscription, setSubscription] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSub = () => {
    api.get("/subscription").then((r) => setSubscription(r.data)).catch(() => setSubscription(null));
  };

  useEffect(() => {
    api
      .get("/profile")
      .then((r) => {
        setProfile(r.data);
        if (r.data.slug) localStorage.setItem("mgr_slug", r.data.slug);
        if (r.data.restaurant_id) localStorage.setItem("mgr_restaurant_id", r.data.restaurant_id);
      })
      .catch(() => {});
    loadSub();
  }, []);

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (profile.slug && !isValidSlug(slugify(profile.slug))) {
      return toast.error("Restaurant URL can only use letters, numbers, and hyphens (min 2 characters).");
    }
    setSaving(true);
    try {
      const payload = { ...profile, slug: profile.slug ? slugify(profile.slug) : profile.slug };
      await api.put("/profile", payload);
      if (payload.slug) localStorage.setItem("mgr_slug", payload.slug);
      toast.success("Profile updated");
      setEditing(false);
      onRefresh?.();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save your profile. Please try again."));
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

  // Subscription summary helpers
  const sub = subscription;
  const subActive = sub && sub.tables && sub.status && sub.status !== "none" && sub.status !== "skipped";
  const hasPending = sub && sub.pending_tables && sub.pending_tables !== sub.tables;

  const subStatusLabel = sub?.status === "trial" ? "Free Trial" : sub?.status === "active" ? "Active" : "Not active";
  const subStatusColor =
    sub?.status === "trial" ? "var(--gold)" : sub?.status === "active" ? "var(--green)" : "var(--muted)";

  return (
    <div className="section active" data-testid="profile-section">
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
          className="profile-edit-btn-highlight"
          onClick={() => setEditing((v) => !v)}
          data-testid="profile-edit-btn"
        >
          {editing ? "Close" : "Edit Profile"}
        </button>
      </div>

      {/* Subscription Summary Card */}
      <div className="add-item-card" data-testid="profile-subscription-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div className="font-serif" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <CreditCard size={16} color="var(--gold)" />
            Subscription
          </div>
          <span
            data-testid="profile-sub-status"
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 999,
              background: `${subStatusColor}22`,
              color: subStatusColor,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {subStatusLabel}
          </span>
        </div>

        {subActive ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: hasPending ? 14 : 16 }}>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Tables</div>
                <div style={{ fontSize: 22, fontWeight: 600 }} data-testid="profile-sub-tables">{sub.tables}</div>
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Monthly Bill</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: "var(--gold)" }} data-testid="profile-sub-total">
                  {fmtINR(sub.total)}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11 }}>incl. 18% GST</div>
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {sub.status === "trial" ? "Trial Ends" : "Ends on"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500 }} data-testid="profile-sub-next">
                  <Calendar size={12} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                  {sub.status === "trial" ? fmtDate(sub.trial_end) : fmtDate(sub.cycle_end || sub.next_cycle_start)}
                </div>
              </div>
            </div>

            {/* Subscription cycle pills: start + end dates */}
            <div
              data-testid="profile-sub-dates"
              style={{
                display: "flex",
                gap: 10,
                paddingBottom: 16,
                marginBottom: 16,
                borderBottom: "1px solid var(--line)",
                flexWrap: "wrap",
              }}
            >
              <div className="cycle-pill cycle-pill-start" data-testid="profile-sub-started-pill">
                <Calendar size={13} />
                <div>
                  <div className="cycle-pill-label">Started</div>
                  <div className="cycle-pill-value" data-testid="profile-sub-started">{fmtDate(sub.cycle_start || sub.trial_start)}</div>
                </div>
              </div>
              <div className="cycle-pill cycle-pill-end" data-testid="profile-sub-ends-pill">
                <Calendar size={13} />
                <div>
                  <div className="cycle-pill-label">{sub.status === "trial" ? "Trial ends" : "Ends on"}</div>
                  <div className="cycle-pill-value" data-testid="profile-sub-ends">
                    {sub.status === "trial" ? fmtDate(sub.trial_end) : fmtDate(sub.cycle_end || sub.next_cycle_start)}
                  </div>
                </div>
              </div>
            </div>

            {hasPending && (
              <div
                data-testid="profile-sub-pending"
                style={{
                  background: "rgba(232,125,47,0.10)",
                  border: "1px solid rgba(232,125,47,0.35)",
                  color: "var(--gold)",
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  marginBottom: 16,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <RefreshCw size={14} />
                <span>
                  <b>Change scheduled:</b> {sub.pending_tables} tables ({fmtINR(sub.pending_total)}/mo) will take effect from{" "}
                  <b>{fmtDate(sub.next_cycle_start)}</b>. Current cycle continues at {sub.tables} tables.
                </span>
              </div>
            )}

            <button
              type="button"
              className="mini-btn"
              onClick={() => (onOpenSubscribe ? onOpenSubscribe() : navigate("/manager/subscribe"))}
              data-testid="profile-change-sub-btn"
              style={{ background: "var(--gold)", color: "white", borderColor: "var(--gold)" }}
            >
              <RefreshCw size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              Change Subscription
            </button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              You don&apos;t have an active subscription yet. Pay to unlock — first-time subscribers get 4 extra days on the first month.
            </div>
            <button
              type="button"
              className="mini-btn"
              onClick={() => (onOpenSubscribe ? onOpenSubscribe() : navigate("/manager/subscribe"))}
              data-testid="profile-start-sub-btn"
              style={{ background: "var(--gold)", color: "white", borderColor: "var(--gold)" }}
            >
              Choose a plan
            </button>
          </div>
        )}
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
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Restaurant URL</label>
            <input
              type="text"
              value={profile.slug || ""}
              onChange={(e) => set("slug", slugify(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                set("slug", slugify(e.clipboardData.getData("text")));
              }}
              placeholder="my-bistro"
              autoComplete="off"
              spellCheck={false}
              pattern="[a-z0-9-]*"
              title="Only lowercase letters, numbers, and hyphens"
              data-testid="profile-slug-input"
            />
            <span style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
              Letters, numbers, and hyphens only — zentaapqr.com/r/{profile.slug || "…"}
            </span>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                <Mail size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Email <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
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
    </div>
  );
}
