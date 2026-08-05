import { useState, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import MenuForm, { useMenuForm } from "./menu/MenuForm";
import MenuItemCard from "./menu/MenuItemCard";
import MenuSearchBar from "./menu/MenuSearchBar";

export default function MenuSection({ menu, categories, onRefresh, locked }) {
  const formState = useMenuForm();
  const [search, setSearch] = useState("");

  const removeItem = async (id) => {
    if (locked) return toast.error("Subscribe to ZenTaap to manage the menu.");
    if (!window.confirm("Delete this item?")) return;
    try {
      await api.delete(`/menu/${id}`);
      toast.success("Item removed");
      onRefresh();
    } catch (err) {
      if (err?.response?.status !== 402) {
        toast.error(friendlyError(err, "Couldn't remove that item. Please try again."));
      }
    }
  };

  const toggleAvail = async (it) => {
    if (locked) return toast.error("Subscribe to ZenTaap to manage the menu.");
    try {
      await api.put(`/menu/${it.id}`, { available: !it.available });
      toast.success(it.available ? "Marked Not Available" : "Marked Available");
      onRefresh();
    } catch (err) {
      if (err?.response?.status !== 402) {
        toast.error(friendlyError(err, "Couldn't update that item. Please try again."));
      }
    }
  };

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter(
      (it) => it.name.toLowerCase().includes(q) || (it.category || "").toLowerCase().includes(q)
    );
  }, [menu, search]);

  return (
    <div className="section active" data-testid="menu-section">
      <MenuForm formState={formState} categories={categories} onRefresh={onRefresh} />

      <MenuSearchBar value={search} onChange={setSearch} total={menu.length} shown={filteredMenu.length} />

      <div className="menu-mgmt-grid" data-testid="menu-grid">
        {filteredMenu.map((it) => (
          <MenuItemCard
            key={it.id}
            item={it}
            onEdit={formState.startEdit}
            onToggleAvail={toggleAvail}
            onDelete={removeItem}
          />
        ))}
        {filteredMenu.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 30 }} data-testid="menu-empty">
            {search ? `No items match "${search}".` : "No menu items yet."}
          </div>
        )}
      </div>
    </div>
  );
}
