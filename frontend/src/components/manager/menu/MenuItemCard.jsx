import { Pencil, Trash2 } from "lucide-react";

export default function MenuItemCard({ item, onEdit, onToggleAvail, onDelete }) {
  const imgs = item.images && item.images.length ? item.images : item.image_url ? [item.image_url] : [];
  const primary = imgs[0];
  return (
    <div className={`menu-item-card ${!item.available ? "unavailable" : ""}`} data-testid={`menu-item-${item.id}`}>
      <div className="menu-item-left">
        <div className="menu-emoji">
          {primary ? <img src={primary} alt={item.name} /> : <span style={{ fontSize: 22 }}>🍽️</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div className="menu-item-name">
            {item.name}{" "}
            {!item.available && <span className="badge badge-na" style={{ marginLeft: 6 }}>Not Available</span>}
            {imgs.length > 1 && (
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>+{imgs.length - 1} more</span>
            )}
          </div>
          {item.category && <div className="menu-item-cat">{item.category}</div>}
          <div className="menu-actions">
            <button className="mini-btn" onClick={() => onToggleAvail(item)} data-testid={`toggle-avail-${item.id}`}>
              {item.available ? "Mark Not Available" : "Mark Available"}
            </button>
            <button className="mini-btn" onClick={() => onEdit(item)} data-testid={`edit-${item.id}`}>
              <Pencil size={12} style={{ display: "inline", marginRight: 4 }} /> Edit
            </button>
            <button className="mini-btn danger" onClick={() => onDelete(item.id)} data-testid={`delete-${item.id}`}>
              <Trash2 size={12} style={{ display: "inline", marginRight: 4 }} /> Delete
            </button>
          </div>
        </div>
      </div>
      <div className="menu-item-price">₹{item.price}</div>
    </div>
  );
}
