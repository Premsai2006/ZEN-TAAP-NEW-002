import { useState, useMemo } from "react";
import { toast } from "sonner";
import { X, Plus, ImageIcon, Pencil, Trash2, Search } from "lucide-react";
import { api } from "@/lib/api";

const MAX_IMAGES = 4;
const initialForm = { name: "", price: "", category: "", images: [] };

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
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [search, setSearch] = useState("");

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
      category: it.category || "",
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

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      const { data } = await api.post("/categories", { name: newCat.trim() });
      setForm((f) => ({ ...f, category: data.name }));
      setNewCat("");
      setShowNewCatInput(false);
      toast.success("Category added");
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  const removeCategory = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? Items in this category will be moved to Uncategorized.`)) return;
    try {
      await api.delete(`/categories/${c.id}`);
      toast.success("Category removed");
      onRefresh();
    } catch (err) {
      toast.error("Failed to remove");
    }
  };

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.category || "").toLowerCase().includes(q)
    );
  }, [menu, search]);

  const hasContent = form.name || form.price || form.images.length || form.category;

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
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Category</span>
              {!showNewCatInput && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShowNewCatInput(true)}
                  data-testid="show-new-cat-btn"
                  style={{ fontSize: 12 }}
                >
                  + New category
                </button>
              )}
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                data-testid="item-category-select"
                style={{ flex: 1 }}
              >
                <option value="">— Uncategorized —</option>
                {(categories || []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {form.category && (
                <>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      const cat = (categories || []).find((c) => c.name === form.category);
                      if (!cat) return;
                      const newName = window.prompt("Rename category to:", cat.name);
                      if (!newName || !newName.trim() || newName.trim() === cat.name) return;
                      api
                        .put(`/categories/${cat.id}`, { name: newName.trim() })
                        .then(() => {
                          toast.success("Category renamed");
                          set("category", newName.trim());
                          onRefresh();
                        })
                        .catch((err) => toast.error(err?.response?.data?.detail || "Failed"));
                    }}
                    data-testid="edit-selected-cat-btn"
                    title="Rename this category"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="mini-btn danger"
                    onClick={() => {
                      const cat = (categories || []).find((c) => c.name === form.category);
                      if (!cat) return;
                      if (!window.confirm(`Delete "${cat.name}"? Items in this category will become Uncategorized.`)) return;
                      api
                        .delete(`/categories/${cat.id}`)
                        .then(() => {
                          toast.success("Category removed");
                          set("category", "");
                          onRefresh();
                        })
                        .catch(() => toast.error("Failed"));
                    }}
                    data-testid="delete-selected-cat-btn"
                    title="Delete this category"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
            {showNewCatInput && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }} data-testid="inline-new-cat-row">
                <input
                  type="text"
                  placeholder="New category name"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  data-testid="new-category-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory(e);
                    }
                  }}
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
                <button
                  type="button"
                  className="mini-btn primary"
                  onClick={addCategory}
                  data-testid="add-category-btn"
                >
                  Add
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    setShowNewCatInput(false);
                    setNewCat("");
                  }}
                  data-testid="cancel-new-cat-btn"
                >
                  Cancel
                </button>
              </div>
            )}
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

      {/* Search bar */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
        data-testid="menu-search-bar"
      >
        <Search size={16} color="var(--muted)" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu by name or category…"
          data-testid="menu-search-input"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "var(--text)",
            fontSize: 14,
            outline: "none",
          }}
        />
        {search && (
          <button
            className="mini-btn"
            onClick={() => setSearch("")}
            data-testid="menu-search-clear"
            style={{ padding: "4px 10px" }}
          >
            Clear
          </button>
        )}
        <span style={{ color: "var(--muted)", fontSize: 12 }} data-testid="menu-search-count">
          {filteredMenu.length}/{menu.length}
        </span>
      </div>

      {/* Menu list */}
      <div className="menu-mgmt-grid" data-testid="menu-grid">
        {filteredMenu.map((it) => {
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
                  {primary ? <img src={primary} alt={it.name} /> : <span style={{ fontSize: 22 }}>🍽️</span>}
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
                  {it.category && <div className="menu-item-cat">{it.category}</div>}
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
        {filteredMenu.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 30 }} data-testid="menu-empty">
            {search ? `No items match "${search}".` : "No menu items yet."}
          </div>
        )}
      </div>
    </div>
  );
}
