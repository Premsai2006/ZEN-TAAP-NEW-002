import { useState, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import MenuForm, { useMenuForm } from "./menu/MenuForm";
import MenuItemCard from "./menu/MenuItemCard";
import MenuSearchBar from "./menu/MenuSearchBar";

export default function MenuSection({ menu, categories, onRefresh }) {
  const formState = useMenuForm();
  const [search, setSearch] = useState("");

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
