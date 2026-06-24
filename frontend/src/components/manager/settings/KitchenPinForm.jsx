import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, ChefHat, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";

export default function KitchenPinForm() {
  const [kitchenPin, setKitchenPin] = useState("");
  const [newKitchenPin, setNewKitchenPin] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/settings/kitchen-pin")
      .then((r) => setKitchenPin(r.data.customer_pin || ""))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!newKitchenPin) return toast.error("Enter a new Kitchen PIN");
    if (newKitchenPin.length < 4 || newKitchenPin.length > 6) return toast.error("Kitchen PIN must be 4–6 digits");
    setSaving(true);
    try {
      await api.put("/settings/kitchen-pin", { new_pin: newKitchenPin });
      toast.success("Kitchen PIN updated");
      setKitchenPin(newKitchenPin);
      setNewKitchenPin("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="add-item-card" onSubmit={submit} data-testid="kitchen-pin-form">
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <ChefHat size={16} color="var(--gold)" />
        Kitchen Display PIN
      </div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
        Kitchen staff need this 4–6 digit PIN to open the kitchen display at <b>/kitchen</b>. This is independent of your Manager PIN — share it with guests at the table.
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Current Kitchen PIN</label>
          <div style={{ position: "relative" }}>
            <input type={show ? "text" : "password"} value={kitchenPin} readOnly data-testid="current-kitchen-pin"
              style={{ letterSpacing: 6, textAlign: "center", paddingRight: 38, background: "var(--bg)" }} />
            <button type="button" onClick={() => setShow((v) => !v)} data-testid="kitchen-pin-toggle"
              title={show ? "Hide" : "Show"}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex" }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">New Kitchen PIN (4–6 digits)</label>
          <input type="password" inputMode="numeric" value={newKitchenPin}
            onChange={(e) => setNewKitchenPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            maxLength={6} placeholder="e.g. 4321" data-testid="new-kitchen-pin"
            style={{ letterSpacing: 6, textAlign: "center" }} />
        </div>
      </div>
      <button type="submit" className="submit-btn" disabled={saving} data-testid="save-kitchen-pin-btn">
        <Save size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
        {saving ? "Saving…" : "Update Kitchen PIN"}
      </button>
    </form>
  );
}
