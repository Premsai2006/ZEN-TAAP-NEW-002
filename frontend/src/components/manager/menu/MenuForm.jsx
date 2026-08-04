import { useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

const MAX_IMAGES = 4;
const initialForm = { name: "", price: "", cost_price: "", category: "", images: [] };

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export const useMenuForm = () => {
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { setForm(initialForm); setEditingId(null); };
  const startEdit = (it) => {
    setEditingId(it.id);
    setForm({
      name: it.name,
      price: it.price,
      cost_price: it.cost_price ?? "",
      category: it.category || "",
      images: it.images && it.images.length ? it.images : it.image_url ? [it.image_url] : [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return { form, setForm, set, editingId, reset, startEdit };
};

export default function MenuForm({ formState, categories, onRefresh }) {
  const { form, setForm, set, editingId, reset } = formState;
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [showNewCatInput, setShowNewCatInput] = useState(false);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - form.images.length;
    if (remaining <= 0) { toast.error(`Max ${MAX_IMAGES} photos`); return; }
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    const uploaded = [];
    for (const f of toUpload) {
      if (f.size > 1_800_000) { toast.error(`${f.name} is too large (max 1.8MB)`); continue; }
      try {
        const data = await fileToDataUrl(f);
        const { data: res } = await api.post("/upload-image", { data });
        uploaded.push(res.url);
      } catch {
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

  const removeImage = (idx) => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) { toast.error("Name and price are required"); return; }
    const payload = {
      name: form.name.trim(),
      price: parseFloat(form.price),
      cost_price: form.cost_price === "" || form.cost_price == null ? null : parseFloat(form.cost_price),
      category: form.category || "",
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
      reset();
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      const { data } = await api.post("/categories", { name: newCat.trim() });
      set("category", data.name);
      setNewCat("");
      setShowNewCatInput(false);
      toast.success("Category added");
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  const renameSelectedCat = () => {
    const cat = (categories || []).find((c) => c.name === form.category);
    if (!cat) return;
    const newName = window.prompt("Rename category to:", cat.name);
    if (!newName || !newName.trim() || newName.trim() === cat.name) return;
    api.put(`/categories/${cat.id}`, { name: newName.trim() })
      .then(() => { toast.success("Category renamed"); set("category", newName.trim()); onRefresh(); })
      .catch((err) => toast.error(err?.response?.data?.detail || "Failed"));
  };

  const deleteSelectedCat = () => {
    const cat = (categories || []).find((c) => c.name === form.category);
    if (!cat) return;
    if (!window.confirm(`Delete "${cat.name}"? Items in this category will become Uncategorized.`)) return;
    api.delete(`/categories/${cat.id}`)
      .then(() => { toast.success("Category removed"); set("category", ""); onRefresh(); })
      .catch(() => toast.error("Failed"));
  };

  const hasContent = form.name || form.price || form.images.length || form.category;

  return (
    <div className="add-item-card">
      <div className="font-serif" style={{ fontSize: 16, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{editingId ? "Edit Item" : "Add New Item"}</span>
        {(editingId || hasContent) && (
          <button onClick={reset} className="mini-btn" data-testid="cancel-form-btn">Cancel</button>
        )}
      </div>
      <form onSubmit={submit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Item Name</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Chicken Tikka" data-testid="item-name-input" />
          </div>
          <div className="form-group">
            <label className="form-label">Price (₹)</label>
            <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. 280" data-testid="item-price-input" />
          </div>
          <div className="form-group">
            <label className="form-label">Cost / COGS (₹) — optional</label>
            <input
              type="number"
              value={form.cost_price}
              onChange={(e) => set("cost_price", e.target.value)}
              placeholder="e.g. 110"
              data-testid="item-cost-input"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Category</span>
            {!showNewCatInput && (
              <button type="button" className="link-btn" onClick={() => setShowNewCatInput(true)} data-testid="show-new-cat-btn" style={{ fontSize: 12 }}>
                + New category
              </button>
            )}
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} data-testid="item-category-select" style={{ flex: 1 }}>
              <option value="">— Uncategorized —</option>
              {(categories || []).map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            {form.category && (
              <button type="button" className="mini-btn" onClick={renameSelectedCat} data-testid="edit-selected-cat-btn" title="Rename this category">
                <Pencil size={12} /> Rename
              </button>
            )}
          </div>
          {form.category && (
            <div
              data-testid="delete-category-zone"
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px dashed rgba(217,99,99,0.35)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                Danger zone — deleting <b>{form.category}</b> cannot be undone. Items move to Uncategorized.
              </div>
              <button
                type="button"
                className="mini-btn danger"
                onClick={deleteSelectedCat}
                data-testid="delete-selected-cat-btn"
                title="Delete this category"
                style={{ flexShrink: 0 }}
              >
                <Trash2 size={12} style={{ marginRight: 4 }} /> Delete category
              </button>
            </div>
          )}
          {showNewCatInput && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }} data-testid="inline-new-cat-row">
              <input
                type="text" placeholder="New category name" value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                data-testid="new-category-input"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(e); } }}
                style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", padding: "10px 12px", borderRadius: 8, fontSize: 14, outline: "none" }}
              />
              <button type="button" className="mini-btn primary" onClick={addCategory} data-testid="add-category-btn">Add</button>
              <button type="button" className="mini-btn" onClick={() => { setShowNewCatInput(false); setNewCat(""); }} data-testid="cancel-new-cat-btn">Cancel</button>
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Photos ({form.images.length}/{MAX_IMAGES}) — add up to 4</label>
          <label style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: "12px 14px", cursor: form.images.length >= MAX_IMAGES ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13, background: "var(--bg)", opacity: form.images.length >= MAX_IMAGES ? 0.5 : 1 }}>
            <ImageIcon size={16} />
            {uploading ? "Uploading…" : form.images.length >= MAX_IMAGES ? "Max 4 photos reached" : "Click to upload photos (jpg/png, max 1.8MB each)"}
            <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={form.images.length >= MAX_IMAGES} style={{ display: "none" }} data-testid="item-image-file-input" />
          </label>
          {form.images.length > 0 && (
            <div className="image-thumbs" data-testid="image-thumbs">
              {form.images.map((src, i) => (
                <div key={`${src}-${i}`} className="image-thumb" data-testid={`image-thumb-${i}`}>
                  <img src={src} alt={`thumb-${i}`} />
                  <button type="button" className="x" onClick={() => removeImage(i)} data-testid={`image-remove-${i}`} title="Remove">×</button>
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
            <button type="button" onClick={reset} className="submit-btn ghost" data-testid="cancel-form-btn-bottom">Cancel</button>
          )}
        </div>
      </form>
    </div>
  );
}
