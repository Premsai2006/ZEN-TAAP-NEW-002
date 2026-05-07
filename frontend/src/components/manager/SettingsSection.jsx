import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ImageIcon, Save } from "lucide-react";
import { api } from "@/lib/api";

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const GST_RATES = [0, 5, 12, 18];

export default function SettingsSection({ settings, onRefresh }) {
  const [form, setForm] = useState({
    restaurant_name: "",
    logo_url: "",
    gst_number: "",
    gst_rate: 5,
    address: "",
    phone: "",
    printer_type: "browser",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        restaurant_name: settings.restaurant_name || "",
        logo_url: settings.logo_url || "",
        gst_number: settings.gst_number || "",
        gst_rate: settings.gst_rate ?? 5,
        address: settings.address || "",
        phone: settings.phone || "",
        printer_type: settings.printer_type || "browser",
      });
    }
  }, [settings?.restaurant_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) {
      toast.error("Logo too large (max 1.8MB)");
      return;
    }
    try {
      const data = await fileToDataUrl(file);
      const { data: res } = await api.post("/upload-image", { data });
      set("logo_url", res.url);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error("Upload failed");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/settings", { ...form, gst_rate: parseFloat(form.gst_rate) });
      toast.success("Settings saved");
      onRefresh();
    } catch (err) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section active" data-testid="settings-section">
      <form className="add-item-card" onSubmit={save}>
        <div className="font-serif" style={{ fontSize: 18, marginBottom: 16 }}>
          Bill Branding
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Restaurant Name</label>
            <input
              type="text"
              value={form.restaurant_name}
              onChange={(e) => set("restaurant_name", e.target.value)}
              placeholder="TableTap Restaurant"
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
            <label className="form-label">GST Rate</label>
            <select
              value={form.gst_rate}
              onChange={(e) => set("gst_rate", e.target.value)}
              data-testid="settings-gst-rate-select"
            >
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
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
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 14,
            color: "var(--muted)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          <div style={{ color: "var(--text)", fontWeight: 500, marginBottom: 6 }}>
            How to connect a thermal printer
          </div>
          1. Plug your USB / Bluetooth thermal printer into this device.<br />
          2. In your operating system, set it as the <b>default printer</b>.<br />
          3. Click <b>Generate Bill</b> on any order — the system uses the browser print
          dialog, so the bill will be sent to whichever printer you've selected.<br />
          4. The bill layout auto-sizes to <b>80mm</b> for thermal printers.
        </div>

        <button type="submit" className="submit-btn" disabled={saving} data-testid="settings-save-btn">
          <Save size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
