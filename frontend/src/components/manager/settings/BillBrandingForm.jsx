import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ImageIcon, Save } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import CustomSelect from "@/components/ui/CustomSelect";

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function BillBrandingForm({ settings, onRefresh }) {
  const [form, setForm] = useState({
    restaurant_name: "", logo_url: "", gst_number: "", gst_rate: "",
    address: "", phone: "", printer_type: "browser",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      restaurant_name: settings.restaurant_name || "",
      logo_url: settings.logo_url || "",
      gst_number: settings.gst_number || "",
      gst_rate: settings.gst_rate === null || settings.gst_rate === undefined ? "" : String(settings.gst_rate),
      address: settings.address || "",
      phone: settings.phone || "",
      printer_type: settings.printer_type || "browser",
    });
  }, [settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) return toast.error("That logo is too large. Please use one under 1.8 MB.");
    try {
      const data = await fileToDataUrl(file);
      const { data: res } = await api.post("/upload-image", { data });
      set("logo_url", res.url);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't upload the logo. Please try again."));
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
        toast.error("GST rate should be a number between 0 and 100.");
        setSaving(false);
        return;
      }
      payload.gst_rate = parsed;
    }
    try {
      await api.put("/settings", payload);
      toast.success("Settings saved");
      onRefresh();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save settings. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="add-item-card" onSubmit={save}>
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 14 }}>Bill Branding</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Restaurant Name</label>
          <input type="text" value={form.restaurant_name} onChange={(e) => set("restaurant_name", e.target.value)} placeholder="ZenTaap Restaurant" data-testid="settings-name-input" />
        </div>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input type="text" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 …" data-testid="settings-phone-input" />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Address (printed on bills)</label>
        <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Food Street, City" data-testid="settings-address-input" />
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Logo (shown at top of every bill)</label>
        <label style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13, background: "var(--bg)" }}>
          <ImageIcon size={16} />
          Click to upload logo (max 1.8MB)
          <input type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} data-testid="settings-logo-input" />
        </label>
        {form.logo_url && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <img src={form.logo_url} alt="logo" style={{ width: 70, height: 70, objectFit: "contain", background: "white", borderRadius: 8, border: "1px solid var(--line)", padding: 4 }} data-testid="settings-logo-preview" />
            <button type="button" className="mini-btn danger" onClick={() => set("logo_url", "")}>Remove logo</button>
          </div>
        )}
      </div>

      <div className="font-serif" style={{ fontSize: 18, margin: "22px 0 14px" }}>Tax / GST</div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">GST Number (printed on bills)</label>
          <input type="text" value={form.gst_number} onChange={(e) => set("gst_number", e.target.value)} placeholder="e.g. 22AAAAA0000A1Z5" data-testid="settings-gst-number-input" />
        </div>
        <div className="form-group">
          <label className="form-label">GST Rate (%)</label>
          <input type="number" min="0" max="100" step="0.5" value={form.gst_rate} onChange={(e) => set("gst_rate", e.target.value)} placeholder="e.g. 5" data-testid="settings-gst-rate-input" />
          <span style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>Leave empty for no tax line on bills.</span>
        </div>
      </div>

      <div className="font-serif" style={{ fontSize: 18, margin: "22px 0 14px" }}>Printer Setup</div>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Printer / Paper width</label>
        <CustomSelect
          value={form.printer_type}
          onChange={(printer_type) => set("printer_type", printer_type)}
          options={[
            { value: "browser", label: "Browser default (A4 / Letter)" },
            { value: "thermal-58mm", label: "Thermal 58mm" },
            { value: "thermal-80mm", label: "Thermal 80mm (recommended)" },
          ]}
          data-testid="settings-printer-select"
        />
      </div>

      <button type="submit" className="submit-btn" disabled={saving} data-testid="settings-save-btn">
        <Save size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </form>
  );
}
