import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";

export default function ChangePinForm() {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!oldPin || !newPin) return toast.error("Fill both PIN fields");
    if (newPin.length < 6) return toast.error("New PIN must be at least 6 digits");
    if (newPin !== confirmPin) return toast.error("PINs do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-pin", { old_pin: oldPin, new_pin: newPin });
      toast.success("PIN updated");
      setOldPin(""); setNewPin(""); setConfirmPin("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="add-item-card" onSubmit={submit}>
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 6 }}>Change PIN</div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>Set a new numeric PIN (6–10 digits recommended).</div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Current PIN</label>
          <input type="password" inputMode="numeric" value={oldPin}
            onChange={(e) => setOldPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            maxLength={10} data-testid="change-old-pin" style={{ letterSpacing: 4, textAlign: "center" }} />
        </div>
        <div className="form-group">
          <label className="form-label">New PIN</label>
          <input type="password" inputMode="numeric" value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            maxLength={10} data-testid="change-new-pin" style={{ letterSpacing: 4, textAlign: "center" }} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Confirm New PIN</label>
        <input type="password" inputMode="numeric" value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          maxLength={10} data-testid="change-confirm-pin" style={{ letterSpacing: 4, textAlign: "center" }} />
      </div>
      <button type="submit" className="submit-btn" disabled={saving} data-testid="change-pin-btn">
        <KeyRound size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
        {saving ? "Updating…" : "Update PIN"}
      </button>
    </form>
  );
}
