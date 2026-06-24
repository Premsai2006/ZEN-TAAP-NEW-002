import { useState } from "react";
import { toast } from "sonner";
import { Sun, Moon } from "lucide-react";
import { getTheme, setTheme as applyTheme } from "@/lib/theme";

export default function AppearanceCard() {
  const [theme, setThemeState] = useState(getTheme());
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setThemeState(next);
    toast.success(`${next === "dark" ? "Dark" : "Light"} mode on`);
  };
  return (
    <div className="add-item-card">
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 14 }}>Appearance</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>Theme</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Currently using <b>{theme === "dark" ? "Dark" : "Light"}</b> mode.
          </div>
        </div>
        <button type="button" className="submit-btn ghost" onClick={toggle} data-testid="theme-toggle-btn">
          {theme === "dark" ? (
            <><Sun size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />Switch to Light</>
          ) : (
            <><Moon size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />Switch to Dark</>
          )}
        </button>
      </div>
    </div>
  );
}
