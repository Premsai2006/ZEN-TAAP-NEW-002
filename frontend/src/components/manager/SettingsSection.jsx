import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ImageIcon, Save, KeyRound, Sun, Moon, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { getTheme, setTheme as applyTheme } from "@/lib/theme";
import { SubscriptionCard } from "@/components/manager/ProfileSection";

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function SettingsSection({ settings, subscription, onRefresh }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    restaurant_name: "",
    logo_url: "",
    gst_number: "",
    gst_rate: "",
    address: "",
    phone: "",
    printer_type: "browser",
  });
  const [saving, setSaving] = useState(false);
  const [theme, setThemeState] = useState(getTheme());

  // Change PIN
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  // Recover via contact
  const [recContact, setRecContact] = useState("");
  const [recNewPin, setRecNewPin] = useState("");
  const [recSaving, setRecSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        restaurant_name: settings.restaurant_name || "",
        logo_url: settings.logo_url || "",
        gst_number: settings.gst_number || "",
        gst_rate: settings.gst_rate === null || settings.gst_rate === undefined ? "" : String(settings.gst_rate),
        address: settings.address || "",
        phone: settings.phone || "",
        printer_type: settings.printer_type || "browser",
      });
    }
  }, [settings?.restaurant_name, settings?.gst_rate]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) return toast.error("Logo too large (max 1.8MB)");
    try {
      const data = await fileToDataUrl(file);
      const { data: res } = await api.post("/upload-image", { data });
      set("logo_url", res.url);
      toast.success("Logo uploaded");
    } catch {
      toast.error("Upload failed");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (form.gst_rate === "" || form.gst_rate === null) {
      payload.gst_rate = null;
    } else {
      const parsed = parseFloat(form.gst_rate);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        toast.error("GST rate must be a number between 0 and 100");
        setSaving(false);
        return;
      }
      payload.gst_rate = parsed;
    }
    try {
      await api.put("/settings", payload);
      toast.success("Settings saved");
      onRefresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setThemeState(next);
    toast.success(`${next === "dark" ? "Dark" : "Light"} mode on`);
  };

  const submitChangePin = async (e) => {
    e.preventDefault();
    if (!oldPin || !newPin) return toast.error("Fill both PIN fields");
    if (newPin.length < 4) return toast.error("New PIN must be 4–10 digits");
    if (newPin !== confirmPin) return toast.error("PINs do not match");
    setPinSaving(true);
    try {
      await api.post("/auth/change-pin", { old_pin: oldPin, new_pin: newPin });
      toast.success("PIN updated");
      setOldPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setPinSaving(false);
    }
  };

  const submitRecover = async (e) => {
    e.preventDefault();
    if (recContact.replace(/[^0-9]/g, "").length < 7) return toast.error("Enter your registered contact number");
    if (recNewPin.length < 4) return toast.error("New PIN must be 4–10 digits");
    setRecSaving(true);
    try {
      await api.post("/auth/recover-pin", { contact_number: recContact, new_pin: recNewPin });
      toast.success("PIN reset successfully");
      setRecContact("");
      setRecNewPin("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setRecSaving(false);
    }
  };

  return (
    <div className="section active" data-testid="settings-section">
      {/* Subscription summary */}
      <SubscriptionCard
        subscription={subscription}
        status={subscription?.status || "none"}
        planName={subscription?.plan_info?.name}
        navigate={navigate}
      />

      {/* Appearance */}
      <div className="add-item-card">
        <div className="font-serif" style={{ fontSize: 18, marginBottom: 14 }}>
          Appearance
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Theme</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Currently using <b>{theme === "dark" ? "Dark" : "Light"}</b> mode.
            </div>
          </div>
          <button
            type="button"
            className="submit-btn ghost"
            onClick={toggleTheme}
            data-testid="theme-toggle-btn"
          >
            {theme === "dark" ? (
              <>
                <Sun size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                Switch to Light
              </>
            ) : (
              <>
                <Moon size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                Switch to Dark
              </>
            )}
          </button>
        </div>
      </div>

      {/* Branding + Tax + Printer */}
      <form className="add-item-card" onSubmit={save}>
        <div className="font-serif" style={{ fontSize: 18, marginBottom: 14 }}>
          Bill Branding
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Restaurant Name</label>
            <input
              type="text"
              value={form.restaurant_name}
              onChange={(e) => set("restaurant_name", e.target.value)}
              placeholder="TableTaap Restaurant"
              data-testid="settings-name-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 …"
              data-testid="settings-phone-input"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Address (printed on bills)</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="123 Food Street, City"
            data-testid="settings-address-input"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Logo (shown at top of every bill)</label>
          <label
            style={{
              border: "1px dashed var(--line)",
              borderRadius: 8,
              padding: "12px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--muted)",
              fontSize: 13,
              background: "var(--bg)",
            }}
          >
            <ImageIcon size={16} />
            Click to upload logo (max 1.8MB)
            <input
              type="file"
              accept="image/*"
              onChange={handleLogo}
              style={{ display: "none" }}
              data-testid="settings-logo-input"
            />
          </label>
          {form.logo_url && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
              <img
                src={form.logo_url}
                alt="logo"
                style={{
                  width: 70,
                  height: 70,
                  objectFit: "contain",
                  background: "white",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  padding: 4,
                }}
                data-testid="settings-logo-preview"
              />
              <button type="button" className="mini-btn danger" onClick={() => set("logo_url", "")}>
                Remove logo
              </button>
            </div>
          )}
        </div>

        <div className="font-serif" style={{ fontSize: 18, margin: "22px 0 14px" }}>
          Tax / GST
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">GST Number (printed on bills)</label>
            <input
              type="text"
              value={form.gst_number}
              onChange={(e) => set("gst_number", e.target.value)}
              placeholder="e.g. 22AAAAA0000A1Z5"
              data-testid="settings-gst-number-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">GST Rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.gst_rate}
              onChange={(e) => set("gst_rate", e.target.value)}
              placeholder="e.g. 5"
              data-testid="settings-gst-rate-input"
            />
            <span style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
              Leave empty for no tax line on bills.
            </span>
          </div>
        </div>

        <div className="font-serif" style={{ fontSize: 18, margin: "22px 0 14px" }}>
          Printer Setup
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Printer / Paper width</label>
          <select
            value={form.printer_type}
            onChange={(e) => set("printer_type", e.target.value)}
            data-testid="settings-printer-select"
          >
            <option value="browser">Browser default (A4 / Letter)</option>
            <option value="thermal-58mm">Thermal 58mm</option>
            <option value="thermal-80mm">Thermal 80mm (recommended)</option>
          </select>
        </div>

        <button type="submit" className="submit-btn" disabled={saving} data-testid="settings-save-btn">
          <Save size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>

      {/* Change PIN */}
      <form className="add-item-card" onSubmit={submitChangePin}>
        <div className="font-serif" style={{ fontSize: 18, marginBottom: 6 }}>
          Change PIN
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
          Set a new numeric PIN (4–10 digits).
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Current PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              maxLength={10}
              data-testid="change-old-pin"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              maxLength={10}
              data-testid="change-new-pin"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Confirm New PIN</label>
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            maxLength={10}
            data-testid="change-confirm-pin"
            style={{ letterSpacing: 4, textAlign: "center" }}
          />
        </div>
        <button type="submit" className="submit-btn" disabled={pinSaving} data-testid="change-pin-btn">
          <KeyRound size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          {pinSaving ? "Updating…" : "Update PIN"}
        </button>
      </form>

      {/* Recover PIN via contact */}
      <form className="add-item-card" onSubmit={submitRecover}>
        <div className="font-serif" style={{ fontSize: 18, marginBottom: 6 }}>
          Forgot PIN — Recover via Mobile
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
          Verify your registered contact number to set a new PIN.
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Registered Contact Number</label>
            <input
              type="tel"
              value={recContact}
              onChange={(e) => setRecContact(e.target.value)}
              placeholder="+91 …"
              data-testid="recover-contact-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={recNewPin}
              onChange={(e) => setRecNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              maxLength={10}
              data-testid="recover-newpin-input"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
        </div>
        <button type="submit" className="submit-btn ghost" disabled={recSaving} data-testid="recover-pin-btn">
          <Phone size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          {recSaving ? "Resetting…" : "Reset PIN"}
        </button>
      </form>
    </div>
  );
}
