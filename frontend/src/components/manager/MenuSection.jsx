import { useState } from "react";
import { toast } from "sonner";
import { X, Plus, ImageIcon, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

const MAX_IMAGES = 4;
const initialForm = { name: "", price: "", images: [] };

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function MenuSection({ menu, onRefresh }) {
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - form.images.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_IMAGES} photos`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    const uploaded = [];
    for (const f of toUpload) {
      if (f.size > 1_800_000) {
        toast.error(`${f.name} is too large (max 1.8MB)`);
        continue;
      }
      try {
        const data = await fileToDataUrl(f);
        const { data: res } = await api.post("/upload-image", { data });
        uploaded.push(res.url);
      } catch (err) {
        toast.error(`${f.name} upload failed`);
      }
    }
    if (uploaded.length) {
      setForm((f) => ({ ...f, images: [...f.images, ...uploaded].slice(0, MAX_IMAGES) }));
      toast.success(`${uploaded.length} photo${uploaded.length > 1 ? "s" : ""} attached`);
    }
    setUploading(false);
    e.target.value = "";
  };

  const removeImage = (idx) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      toast.error("Name and price are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      price: parseFloat(form.price),
      images: form.images,
      image_url: form.images[0] || "",
    };
    try {
      if (editingId) {
        await api.put(`/menu/${editingId}`, payload);
        toast.success("Item updated");
      } else {
        await api.post("/menu", payload);
        toast.success("Item added to menu");
      }
      setForm(initialForm);
      setEditingId(null);
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  const startEdit = (it) => {
    setEditingId(it.id);
    setForm({
      name: it.name,
      price: it.price,
      images: it.images && it.images.length ? it.images : it.image_url ? [it.image_url] : [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelForm = () => {
    setEditingId(null);
    setForm(initialForm);
  };

  const removeItem = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    await api.delete(`/menu/${id}`);
    toast.success("Item removed");
    onRefresh();
  };

  const toggleAvail = async (it) => {
    await api.put(`/menu/${it.id}`, { available: !it.available });
    toast.success(it.available ? "Marked Not Available" : "Marked Available");
    onRefresh();
  };

  const hasContent = form.name || form.price || form.images.length;

  return (
    <div className="section active" data-testid="menu-section">
      {/* Add/Edit item */}
      <div className="add-item-card">
        <div
          className="font-serif"
          style={{ fontSize: 16, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>{editingId ? "Edit Item" : "Add New Item"}</span>
          {(editingId || hasContent) && (
            <button onClick={cancelForm} className="mini-btn" data-testid="cancel-form-btn">
              Cancel
            </button>
          )}
        </div>
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Item Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Chicken Tikka"
                data-testid="item-name-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Price (₹)</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="e.g. 280"
                data-testid="item-price-input"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">
              Photos ({form.images.length}/{MAX_IMAGES}) — add up to 4
            </label>
            <label
              style={{
                border: "1px dashed var(--line)",
                borderRadius: 8,
                padding: "12px 14px",
                cursor: form.images.length >= MAX_IMAGES ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "var(--muted)",
                fontSize: 13,
                background: "var(--bg)",
                opacity: form.images.length >= MAX_IMAGES ? 0.5 : 1,
              }}
            >
              <ImageIcon size={16} />
              {uploading
                ? "Uploading…"
                : form.images.length >= MAX_IMAGES
                ? "Max 4 photos reached"
                : "Click to upload photos (jpg/png, max 1.8MB each)"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFiles}
                disabled={form.images.length >= MAX_IMAGES}
                style={{ display: "none" }}
                data-testid="item-image-file-input"
              />
            </label>
            {form.images.length > 0 && (
              <div className="image-thumbs" data-testid="image-thumbs">
                {form.images.map((src, i) => (
                  <div key={i} className="image-thumb" data-testid={`image-thumb-${i}`}>
                    <img src={src} alt={`thumb-${i}`} />
                    <button
                      type="button"
                      className="x"
                      onClick={() => removeImage(i)}
                      data-testid={`image-remove-${i}`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="submit-btn" data-testid="submit-item-btn">
              {editingId ? "Save Changes" : "Add to Menu"}
            </button>
            {(editingId || hasContent) && (
              <button
                type="button"
                onClick={cancelForm}
                className="submit-btn ghost"
                data-testid="cancel-form-btn-bottom"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Menu list */}
      <div className="menu-mgmt-grid" data-testid="menu-grid">
        {menu.map((it) => {
          const imgs = it.images && it.images.length ? it.images : it.image_url ? [it.image_url] : [];
          const primary = imgs[0];
          return (
            <div
              key={it.id}
              className={`menu-item-card ${!it.available ? "unavailable" : ""}`}
              data-testid={`menu-item-${it.id}`}
            >
              <div className="menu-item-left">
                <div className="menu-emoji">
                  {primary ? <img src={primary} alt={it.name} /> : <ImageIcon size={22} color="var(--muted)" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="menu-item-name">
                    {it.name}{" "}
                    {!it.available && <span className="badge badge-na" style={{ marginLeft: 6 }}>Not Available</span>}
                    {imgs.length > 1 && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>
                        +{imgs.length - 1} more
                      </span>
                    )}
                  </div>
                  <div className="menu-actions">
                    <button
                      className="mini-btn"
                      onClick={() => toggleAvail(it)}
                      data-testid={`toggle-avail-${it.id}`}
                    >
                      {it.available ? "Mark Not Available" : "Mark Available"}
                    </button>
                    <button
                      className="mini-btn"
                      onClick={() => startEdit(it)}
                      data-testid={`edit-${it.id}`}
                    >
                      <Pencil size={12} style={{ display: "inline", marginRight: 4 }} /> Edit
                    </button>
                    <button
                      className="mini-btn danger"
                      onClick={() => removeItem(it.id)}
                      data-testid={`delete-${it.id}`}
                    >
                      <Trash2 size={12} style={{ display: "inline", marginRight: 4 }} /> Delete
                    </button>
                  </div>
                </div>
              </div>
              <div className="menu-item-price">₹{it.price}</div>
            </div>
          );
        })}
        {menu.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>
            No menu items yet.
          </div>
        )}
      </div>
    </div>
  );
}
