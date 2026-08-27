import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * In-house dropdown — styled to match ZenTaap, no native <select>.
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  "data-testid": testId,
  disabled = false,
  style,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`custom-select ${open ? "open" : ""}`} ref={wrapRef} data-testid={testId} style={style}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span className={selected ? "" : "custom-select-placeholder"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              role="option"
              className={`custom-select-option ${String(o.value) === String(value) ? "active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
