import { useState } from "react";
import { toast } from "sonner";
import { Save, ChefHat } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

export default function KitchenPinForm() {
  const [newKitchenPin, setNewKitchenPin] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!newKitchenPin) return toast.error("Please enter a new kitchen PIN.");
    if (newKitchenPin.length < 4 || newKitchenPin.length > 6) {
      return toast.error("Kitchen PIN must be 4 to 6 digits.");
    }
    setSaving(true);
    try {
      await api.put("/settings/kitchen-pin", { new_pin: newKitchenPin });
      toast.success("Kitchen PIN updated");
      setNewKitchenPin("");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update the kitchen PIN. Please try again."));
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
        Kitchen staff need this 4–6 digit PIN to open the kitchen display at <b>/kitchen</b>.
        The current PIN is hidden. Enter a new one only when you want to replace it.
      </div>

      <div className="form-group" style={{ marginBottom: 14, maxWidth: 280 }}>
        <label className="form-label">New Kitchen PIN (4–6 digits)</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={newKitchenPin}
          onChange={(e) => setNewKitchenPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          maxLength={6}
          placeholder="Enter new PIN"
          data-testid="new-kitchen-pin"
          style={{ letterSpacing: 6, textAlign: "center" }}
        />
      </div>
      <button type="submit" className="submit-btn" disabled={saving} data-testid="save-kitchen-pin-btn">
        <Save size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
        {saving ? "Saving…" : "Update Kitchen PIN"}
      </button>
    </form>
  );
}
