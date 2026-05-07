import { useState } from "react";
import { toast } from "sonner";
import { X, Plus, ImageIcon, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

const initialForm = { name: "", price: "", category: "", emoji: "🍽️", image_url: "" };

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function MenuSection({ menu, categories, onRefresh }) {
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [newCat, setNewCat] = useState("");
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) {
      toast.error("Image too large (max ~1.8MB)");
      return;
    }
    setUploading(true);
    try {
      const data = await fileToDataUrl(file);
      const { data: res } = await api.post("/upload-image", { data });
      set("image_url", res.url);
      toast.success("Image attached");
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.category) {
      toast.error("Name, price, category are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      price: parseFloat(form.price),
      category: form.category,
      emoji: form.emoji || "🍽️",
      image_url: form.image_url || "",
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
      category: it.category,
      emoji: it.emoji || "🍽️",
      image_url: it.image_url || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
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

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      await api.post("/categories", { name: newCat.trim() });
      setNewCat("");
      toast.success("Category added");
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  const removeCategory = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? All items in this category will also be removed.`)) return;
    await api.delete(`/categories/${c.id}`);
    toast.success("Category removed");
    onRefresh();
  };

  return (
    <div className="section active" data-testid="menu-section">
      {/* Categories management */}
      <div className="add-item-card" data-testid="categories-card">
        <div className="font-serif" style={{ fontSize: 16, marginBottom: 12 }}>
          Categories
        </div>
        <div className="cat-chips">
          {categories.map((c) => (
            <span key={c.id} className="cat-chip" data-testid={`cat-chip-${c.slug}`}>
              {c.name}
              <button
                onClick={() => removeCategory(c)}
                data-testid={`cat-remove-${c.slug}`}
                title="Remove category"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {categories.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No categories yet.</div>
          )}
        </div>
        <form onSubmit={addCategory} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="New category name"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            data-testid="new-category-input"
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
            }}
          />
          <button type="submit" className="submit-btn" data-testid="add-category-btn">
            <Plus size={14} style={{ marginRight: 4, display: "inline" }} /> Add
          </button>
        </form>
      </div>

      {/* Add/Edit item */}
      <div className="add-item-card">
        <div
          className="font-serif"
          style={{ fontSize: 16, marginBottom: 14, display: "flex", justifyContent: "space-between" }}
        >
          <span>{editingId ? "Edit Item" : "Add New Item"}</span>
          {editingId && (
            <button onClick={cancelEdit} className="mini-btn" data-testid="cancel-edit-btn">
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                data-testid="item-category-select"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Emoji</label>
              <input
                type="text"
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                placeholder="🍗"
                maxLength={2}
                data-testid="item-emoji-input"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Image URL (optional)</label>
              <input
                type="text"
                value={form.image_url}
                onChange={(e) => set("image_url", e.target.value)}
                placeholder="https://… or upload below"
                data-testid="item-image-url-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Or upload fresh image</label>
              <label
                style={{
                  border: "1px dashed var(--line)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--muted)",
                  fontSize: 13,
                  background: "var(--bg)",
                }}
              >
                <ImageIcon size={14} />
                {uploading ? "Uploading…" : "Choose file (max 1.8MB)"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  style={{ display: "none" }}
                  data-testid="item-image-file-input"
                />
              </label>
            </div>
          </div>
          {form.image_url && (
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={form.image_url}
                alt="preview"
                style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
                data-testid="image-preview"
              />
              <button type="button" className="mini-btn danger" onClick={() => set("image_url", "")}>
                Remove image
              </button>
            </div>
          )}
          <button type="submit" className="submit-btn" data-testid="submit-item-btn">
            {editingId ? "Save Changes" : "Add to Menu"}
          </button>
        </form>
      </div>

      {/* Menu list */}
      <div className="menu-mgmt-grid" data-testid="menu-grid">
        {menu.map((it) => (
          <div
            key={it.id}
            className={`menu-item-card ${!it.available ? "unavailable" : ""}`}
            data-testid={`menu-item-${it.id}`}
          >
            <div className="menu-item-left">
              <div className="menu-emoji">
                {it.image_url ? <img src={it.image_url} alt={it.name} /> : it.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div className="menu-item-name">
                  {it.name}{" "}
                  {!it.available && <span className="badge badge-na" style={{ marginLeft: 6 }}>Not Available</span>}
                </div>
                <div className="menu-item-cat">{it.category}</div>
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
        ))}
        {menu.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>
            No menu items yet.
          </div>
        )}
      </div>
    </div>
  );
}
