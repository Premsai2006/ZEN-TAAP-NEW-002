import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Smartphone, LogOut as LogOutIcon } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

export default function DevicesCard() {
  const [sessions, setSessions] = useState([]);
  const [max, setMax] = useState(4);
  const [loading, setLoading] = useState(false);
  const myDeviceId = typeof window !== "undefined" ? localStorage.getItem("mgr_device_id") : null;

  const load = async () => {
    try {
      const { data } = await api.get("/auth/sessions");
      setSessions(
        (data.sessions || []).filter(
          (s, i, arr) => arr.findIndex((x) => x.device_id === s.device_id) === i
        )
      );
      setMax(data.max_devices || 2);
    } catch (err) {
      console.warn("sessions load failed:", err?.message);
    }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (deviceId, isMe) => {
    if (isMe) return toast.error("To sign out this device, use Logout instead.");
    setLoading(true);
    try {
      await api.delete(`/auth/sessions/${deviceId}`);
      toast.success("Device signed out");
      load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't sign out that device. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const fmtTime = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="add-item-card" data-testid="devices-card">
      <div className="font-serif" style={{ fontSize: 18, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <Smartphone size={16} color="var(--gold)" />
        Active Devices · {sessions.length}/{max}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
        ZenTaap allows up to <b>{max} signed-in devices</b>. When you exceed {max} devices, the least-recently-used one is automatically signed out.
      </div>
      {sessions.length === 0 && (
        <div style={{ color: "var(--muted)", fontSize: 13, padding: 14, textAlign: "center" }}>
          No active sessions yet.
        </div>
      )}
      {sessions.map((s) => {
        const isMe = s.device_id === myDeviceId;
        return (
          <div key={s.device_id} className={`session-row ${isMe ? "this-device" : ""}`} data-testid={`session-${s.device_id}`}>
            <Smartphone size={16} color={isMe ? "var(--gold)" : "var(--muted)"} />
            <div className="label">
              <div>{s.device_label || "Browser"}{isMe && <span style={{ marginLeft: 8, color: "var(--gold)", fontSize: 11, fontWeight: 700 }}>· THIS DEVICE</span>}</div>
              <div className="meta">Last used {fmtTime(s.last_used)} · joined {fmtTime(s.created_at)}</div>
            </div>
            {!isMe && (
              <button type="button" className="mini-btn"
                onClick={() => revoke(s.device_id, isMe)} disabled={loading}
                data-testid={`revoke-session-${s.device_id}`}
                style={{ color: "var(--red)", borderColor: "rgba(217,99,99,0.4)" }}>
                <LogOutIcon size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Sign out
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
