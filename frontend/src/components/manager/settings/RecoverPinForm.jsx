import { useState } from "react";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import { api } from "@/lib/api";

export default function RecoverPinForm() {
  const [contact, setContact] = useState("");
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (contact.replace(/[^0-9]/g, "").length < 7) return toast.error("Enter your registered contact number");
    if (newPin.length < 4) return toast.error("New PIN must be 4–10 digits");
    setSaving(true);
    try {
      await api.post("/auth/recover-pin", { contact_number: contact, new_pin: newPin });
      toast.success("PIN reset successfully");
      setContact(""); setNewPin("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="add-item-card" onSubmit={submit}>
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 6 }}>Forgot PIN — Recover via Mobile</div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>Verify your registered contact number to set a new PIN.</div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Registered Contact Number</label>
          <input type="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+91 …" data-testid="recover-contact-input" />
        </div>
        <div className="form-group">
          <label className="form-label">New PIN</label>
          <input type="password" inputMode="numeric" value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            maxLength={10} data-testid="recover-newpin-input" style={{ letterSpacing: 4, textAlign: "center" }} />
        </div>
      </div>
      <button type="submit" className="submit-btn ghost" disabled={saving} data-testid="recover-pin-btn">
        <Phone size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
        {saving ? "Resetting…" : "Reset PIN"}
      </button>
    </form>
  );
}
