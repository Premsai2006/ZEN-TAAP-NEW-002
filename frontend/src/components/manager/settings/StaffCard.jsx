import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import CustomSelect from "@/components/ui/CustomSelect";
import PageBar, { PAGE_SIZE, paginate } from "@/components/ui/PageBar";

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "kitchen", label: "Kitchen" },
];

export default function StaffCard() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ name: "", role: "cashier", pin: "" });
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [resetPin, setResetPin] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/staff");
      setStaff(data.staff || []);
    } catch (err) {
      if (err?.response?.status !== 403) {
        toast.error(friendlyError(err, "Couldn't load staff."));
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Enter the staff member's name.");
    if ((form.pin || "").length < 6) return toast.error("Staff PIN must be at least 6 digits.");
    setSaving(true);
    try {
      await api.post("/auth/staff", {
        name: form.name.trim(),
        role: form.role,
        pin: form.pin,
      });
      toast.success("Staff member added. They can log in with the restaurant phone and their PIN.");
      setForm({ name: "", role: "cashier", pin: "" });
      load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't add staff."));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row, active) => {
    try {
      await api.put(`/auth/staff/${row.id}/active`, { active });
      toast.success(active ? "Staff reactivated." : "PIN revoked — they are signed out.");
      load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update staff."));
    }
  };

  const submitReset = async (row) => {
    if ((resetPin || "").length < 6) return toast.error("New PIN must be at least 6 digits.");
    try {
      await api.put(`/auth/staff/${row.id}/pin`, { pin: resetPin });
      toast.success("PIN updated. They must sign in again.");
      setResetFor(null);
      setResetPin("");
      load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't reset PIN."));
    }
  };

  return (
    <div className="add-item-card" data-testid="staff-card">
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 6 }}>Staff accounts</div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
        Each person logs in with the restaurant phone number and their own PIN.
        Deactivating someone revokes their PIN without changing the owner PIN.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {paginate(staff, page).map((s) => (
          <div
            key={s.id}
            data-testid={`staff-row-${s.id}`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{s.name || "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "capitalize" }}>
                {s.role}
                {!s.active ? " · inactive" : ""}
              </div>
            </div>
            {s.role !== "owner" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    setResetFor(resetFor === s.id ? null : s.id);
                    setResetPin("");
                  }}
                  data-testid={`staff-reset-${s.id}`}
                >
                  Reset PIN
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  style={{ color: s.active ? "var(--red)" : "var(--green)" }}
                  onClick={() => setActive(s, !s.active)}
                  data-testid={`staff-active-${s.id}`}
                >
                  {s.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            )}
            {resetFor === s.id && (
              <div style={{ flexBasis: "100%", display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="New 6–10 digit PIN"
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  maxLength={10}
                  data-testid={`staff-reset-pin-${s.id}`}
                  style={{
                    flex: 1,
                    letterSpacing: 3,
                    textAlign: "center",
                    padding: "8px 10px",
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    color: "var(--text)",
                    borderRadius: 8,
                  }}
                />
                <button type="button" className="mini-btn primary" onClick={() => submitReset(s)}>
                  Save
                </button>
              </div>
            )}
          </div>
        ))}
        {staff.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>No staff yet — add a cashier or kitchen login below.</div>
        )}
        <PageBar page={page} total={staff.length} pageSize={PAGE_SIZE} onPage={setPage} testId="staff-page-bar" />
      </div>

      <form onSubmit={add}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Priya"
              data-testid="staff-name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <CustomSelect
              value={form.role}
              onChange={(role) => setForm((f) => ({ ...f, role }))}
              options={ROLES}
              data-testid="staff-role"
            />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">PIN (6–10 digits)</label>
          <input
            type="password"
            inputMode="numeric"
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))}
            maxLength={10}
            data-testid="staff-pin"
            style={{ letterSpacing: 4, textAlign: "center" }}
          />
        </div>
        <button type="submit" className="submit-btn" disabled={saving} data-testid="staff-add-btn" style={{ marginTop: 12 }}>
          <UserPlus size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          {saving ? "Adding…" : "Add staff"}
        </button>
      </form>
    </div>
  );
}
