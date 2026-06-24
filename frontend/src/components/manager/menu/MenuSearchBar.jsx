import { Search } from "lucide-react";

export default function MenuSearchBar({ value, onChange, total, shown }) {
  return (
    <div
      style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}
      data-testid="menu-search-bar"
    >
      <Search size={16} color="var(--muted)" />
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Search menu by name or category…" data-testid="menu-search-input"
        style={{ flex: 1, background: "transparent", border: "none", color: "var(--text)", fontSize: 14, outline: "none" }}
      />
      {value && (
        <button className="mini-btn" onClick={() => onChange("")} data-testid="menu-search-clear" style={{ padding: "4px 10px" }}>
          Clear
        </button>
      )}
      <span style={{ color: "var(--muted)", fontSize: 12 }} data-testid="menu-search-count">{shown}/{total}</span>
    </div>
  );
}
