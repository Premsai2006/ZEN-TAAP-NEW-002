import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, Link2, Lock, QrCode, Search, Receipt } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { restaurantOrderUrl } from "@/lib/qr";
import {
  buildLabeledQrPng,
  downloadAllQrsZip,
  qrFileName,
  triggerBlobDownload,
} from "@/lib/qrDownload";
import PageBar, { PAGE_SIZE, paginate } from "@/components/ui/PageBar";
import BillModal from "@/components/manager/BillModal";

const LEGACY_OPEN = new Set(["new", "cooking", "done", "delivered"]);

function statusLabel(s) {
  if (s === "payment_pending") return "Payment pending";
  if (s === "available") return "Available";
  if (s === "closed") return "Closed";
  if (s === "open") return "Open";
  return s || "Available";
}

function rupee(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function TableQrCard({
  n,
  restaurantName,
  slug,
  qrLocked,
  onDownload,
  onCopy,
}) {
  return (
    <div className="table-qr-card qr-simple-card" data-testid={`table-${n}`}>
      <div className="qr-simple-name">{restaurantName || "Restaurant"}</div>
      <div className="qr-simple-table">Table {n}</div>
      <div className="qr-simple-qr" data-testid={`table-qr-${n}`}>
        <QRCodeSVG
          value={restaurantOrderUrl(slug, n)}
          size={148}
          bgColor="#ffffff"
          fgColor="#161310"
          level="H"
        />
      </div>
      <div className="qr-simple-powered">Powered by ZenTaap</div>
      <div className="qr-simple-actions">
        <button
          type="button"
          onClick={() => onDownload(n)}
          className="mini-btn"
          data-testid={`download-qr-${n}`}
          style={{ fontSize: 11 }}
          disabled={!slug && !qrLocked}
        >
          <Download size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
          Download
        </button>
        <button
          type="button"
          onClick={() => onCopy(n)}
          className="mini-btn"
          data-testid={`copy-qr-link-${n}`}
          style={{ fontSize: 11 }}
          disabled={!slug && !qrLocked}
        >
          <Link2 size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
          Copy link
        </button>
      </div>
    </div>
  );
}

export default function TablesSection({
  orders,
  subscription,
  slug: slugProp,
  restaurantName,
  locked = false,
  onOpenSubscribe,
  settings,
  onRefresh,
}) {
  const navigate = useNavigate();
  const slug = (slugProp || localStorage.getItem("mgr_slug") || "").trim().toLowerCase();
  const tableCount = useMemo(() => {
    const t = subscription?.tables;
    if (Number.isFinite(t) && t > 0) return t;
    return 15;
  }, [subscription]);

  const qrLocked = Boolean(locked);
  const isExpired = subscription?.status === "expired";

  const amountByTable = useMemo(() => {
    const map = {};
    for (const o of orders || []) {
      if (LEGACY_OPEN.has(o.status) && o.table > 0) {
        map[o.table] = (map[o.table] || 0) + o.amount;
      }
    }
    return map;
  }, [orders]);

  const [floor, setFloor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [billSession, setBillSession] = useState(null);

  const [tab, setTab] = useState("floor");
  const [zipping, setZipping] = useState(false);
  const [page, setPage] = useState(1);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupTable, setLookupTable] = useState(null);
  const [showAllQrs, setShowAllQrs] = useState(false);
  const [floorPick, setFloorPick] = useState(null);

  const tableNums = useMemo(
    () => Array.from({ length: tableCount }, (_, i) => i + 1),
    [tableCount]
  );

  const rowByTable = useMemo(() => {
    const map = {};
    for (const row of floor?.tables || []) {
      map[row.table] = row;
    }
    return map;
  }, [floor]);

  const occupiedNums = useMemo(() => {
    if (floor?.tables) {
      return tableNums.filter((n) => rowByTable[n] && rowByTable[n].status !== "available");
    }
    return tableNums.filter((n) => amountByTable[n]);
  }, [tableNums, floor, rowByTable, amountByTable]);
  const occupiedCount = floor?.occupied ?? occupiedNums.length;
  const emptyCount = floor?.available ?? tableCount - occupiedCount;

  const lookupParsed = lookupInput === "" ? NaN : parseInt(lookupInput, 10);
  const lookupValid =
    Number.isInteger(lookupParsed) && lookupParsed >= 1 && lookupParsed <= tableCount;

  useEffect(() => {
    setPage(1);
    setLookupInput("");
    setLookupTable(null);
    setShowAllQrs(false);
    setFloorPick(null);
  }, [tableCount]);

  useEffect(() => {
    setPage(1);
  }, [showAllQrs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/table-sessions/floor");
        if (!cancelled) setFloor(data);
      } catch {
        /* keep legacy occupancy from orders */
      }
    })();
    return () => { cancelled = true; };
  }, [orders]);

  const openTable = async (n) => {
    setFloorPick(n);
    const row = rowByTable[n];
    if (!row || row.status === "available" || !row.session_id) {
      setDetail(null);
      return;
    }
    try {
      const { data } = await api.get(`/table-sessions/${row.session_id}`);
      setDetail(data);
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't load this table session."));
    }
  };

  const requestBill = async (sessionId) => {
    try {
      const { data } = await api.post(`/table-sessions/${sessionId}/request-bill`);
      setDetail(data);
      toast.success("Bill requested — table is payment pending.");
      onRefresh?.();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't request the bill."));
    }
  };

  const openQrForTable = (n) => {
    setDetail(null);
    setTab("qr");
    setShowAllQrs(false);
    setLookupInput(String(n));
    setLookupTable(n);
  };

  const viewLookup = (e) => {
    e?.preventDefault?.();
    if (!lookupValid) {
      toast.error(`Enter a table number from 1 to ${tableCount}.`);
      return;
    }
    setShowAllQrs(false);
    setLookupTable(lookupParsed);
  };

  const getQrSvg = (n) => document.querySelector(`[data-qr-svg="${n}"] svg`);

  const requireUnlock = () => {
    toast.message(isExpired ? "Pay to unlock your QR codes" : "Subscribe to unlock QR codes", {
      description: isExpired
        ? "Renew your subscription first, then download clear table QRs."
        : "Subscribe to download table QRs.",
      id: "qr-locked",
    });
    if (onOpenSubscribe) onOpenSubscribe();
    else navigate("/manager/subscribe");
  };

  const downloadOneQR = async (n) => {
    if (qrLocked) return requireUnlock();
    const el = getQrSvg(n);
    if (!el) return toast.error("QR code isn't ready yet. Please try again.");
    try {
      const png = await buildLabeledQrPng(el, n, { restaurantName });
      triggerBlobDownload(png, qrFileName(n));
      toast.success(`Downloaded Table ${n} QR`);
    } catch {
      toast.error("Couldn't download this QR. Please try again.");
    }
  };

  const downloadAllQRs = async () => {
    if (qrLocked) return requireUnlock();
    if (!slug) {
      return toast.error("Set your restaurant URL in Profile first — QR codes need it to link tables.");
    }
    const items = tableNums
      .map((n) => ({ tableNum: n, svgEl: getQrSvg(n) }))
      .filter((x) => x.svgEl);
    if (items.length === 0) {
      return toast.error("QR codes aren't ready yet. Please wait a moment and try again.");
    }
    setZipping(true);
    try {
      await downloadAllQrsZip(items, { slug, restaurantName });
      toast.success(`Downloaded ZIP with ${items.length} table QRs`);
    } catch {
      toast.error("Couldn't create the ZIP. Please try again.");
    } finally {
      setZipping(false);
    }
  };

  const copyLink = async (n) => {
    if (qrLocked) return requireUnlock();
    const url = restaurantOrderUrl(slug, n);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Table ${n} link copied`);
    } catch {
      toast.message(url);
    }
  };

  return (
    <div className="section active" data-testid="tables-section">
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
          width: 300,
          height: 300 * tableCount,
          overflow: "hidden",
        }}
      >
        {tableNums.map((n) => (
          <div key={`hidden-qr-${n}`} data-qr-svg={n}>
            <QRCodeSVG
              value={restaurantOrderUrl(slug, n)}
              size={280}
              bgColor="#ffffff"
              fgColor="#161310"
              level="H"
            />
          </div>
        ))}
      </div>

      <div className="tables-toolbar">
        <div className="tables-summary" data-testid="tables-summary">
          <div className="tables-heading">
            <span className="tables-heading-count">{tableCount}</span>
            <span className="tables-heading-label">tables</span>
          </div>
          <div className="filter-tabs" data-testid="tables-tabs">
            <button
              type="button"
              className={`filter-tab ${tab === "floor" ? "active" : ""}`}
              onClick={() => setTab("floor")}
              data-testid="tables-tab-floor"
            >
              Floor
            </button>
            <button
              type="button"
              className={`filter-tab ${tab === "qr" ? "active" : ""}`}
              onClick={() => setTab("qr")}
              data-testid="tables-tab-qr"
            >
              QR codes
            </button>
          </div>
        </div>
        {tab === "qr" && (
          <button
            type="button"
            onClick={downloadAllQRs}
            className="mini-btn"
            data-testid="download-all-qr-btn"
            disabled={zipping || (!slug && !qrLocked)}
            style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
          >
            <Download size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            {zipping ? "Preparing ZIP…" : qrLocked ? "Pay to unlock" : "Download all QRs"}
          </button>
        )}
      </div>

      {tab === "floor" && (
        <>
          <div className="tables-pills" data-testid="tables-occupancy">
            <span className={`tables-pill occupied${occupiedCount ? "" : " is-zero"}`}>
              <b>{occupiedCount}</b> occupied
            </span>
            <span className="tables-pill empty">
              <b>{emptyCount}</b> empty
            </span>
          </div>

          <div className="tables-floor" data-testid="tables-floor">
            {tableNums.map((n) => {
              const row = rowByTable[n];
              const occupied = row ? row.status !== "available" : Boolean(amountByTable[n]);
              const pending = row?.status === "payment_pending";
              return (
                <button
                  key={n}
                  type="button"
                  className={`tables-floor-num${occupied ? " occupied" : ""}${pending ? " pending" : ""}${floorPick === n ? " is-focus" : ""}`}
                  onClick={() => openTable(n)}
                  title={occupied ? `Table ${n} · ${statusLabel(row?.status || "open")}` : `Table ${n} · available`}
                  data-testid={`floor-table-${n}`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="table-scroll tables-session-list" data-testid="tables-session-list">
            <table className="tables-session-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Current Total</th>
                </tr>
              </thead>
              <tbody>
                {tableNums.map((n) => {
                  const row = rowByTable[n];
                  const status = row?.status || (amountByTable[n] ? "open" : "available");
                  const code = row?.session_code || "—";
                  const total = row?.current_total ?? amountByTable[n] ?? 0;
                  return (
                    <tr
                      key={n}
                      className={floorPick === n ? "is-focus" : ""}
                      onClick={() => openTable(n)}
                      data-testid={`floor-row-${n}`}
                      style={{ cursor: status === "available" ? "default" : "pointer" }}
                    >
                      <td style={{ fontWeight: 600 }}>T{n}</td>
                      <td style={{ color: "var(--muted)", fontSize: 13 }}>{status === "available" ? "—" : code}</td>
                      <td>
                        <span className={`badge ${status === "available" ? "badge-na" : status === "payment_pending" ? "badge-cooking" : "badge-new"}`}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{rupee(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "qr" && (
        <>
          {!slug && (
            <div className="tables-slug-warning" data-testid="qr-slug-warning">
              Restaurant URL is missing. Go to Profile and set it, then come back to generate linked QRs.
            </div>
          )}

          <form className="tables-lookup" onSubmit={viewLookup} data-testid="tables-qr-lookup">
            <div className="tables-lookup-left">
              <label className="tables-lookup-label" htmlFor="table-qr-lookup">
                Table number
              </label>
              <div className="tables-lookup-bar">
                <input
                  id="table-qr-lookup"
                  className="tables-lookup-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`1–${tableCount}`}
                  value={lookupInput}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, "");
                    setLookupInput(raw);
                  }}
                  data-testid="tables-lookup-input"
                />
                <button
                  type="submit"
                  className="tables-lookup-search"
                  disabled={!lookupValid}
                  aria-label="View QR"
                  data-testid="tables-lookup-btn"
                >
                  <Search size={16} />
                </button>
              </div>
            </div>
            <button
              type="button"
              className={`mini-btn tables-show-all-qrs${showAllQrs ? " primary" : ""}`}
              onClick={() => {
                setShowAllQrs(true);
                setLookupTable(null);
              }}
              data-testid="tables-show-all-qrs"
            >
              <QrCode size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              Show all QR codes
            </button>
          </form>

          <div className={`qr-locked-wrap${qrLocked ? " is-locked" : ""}`} data-testid="tables-qr-locked-wrap">
            <div className={qrLocked ? "qr-locked-blur" : undefined}>
              {!showAllQrs && !lookupTable && (
                <div className="tables-qr-empty" data-testid="tables-qr-idle">
                  Enter a table number to see that QR, or show all QR codes to print and download.
                </div>
              )}
              {lookupTable && !showAllQrs && (
                <div className="tables-qr-grid tables-qr-grid-one" data-testid="tables-qr-grid">
                  <TableQrCard
                    n={lookupTable}
                    restaurantName={restaurantName}
                    slug={slug}
                    qrLocked={qrLocked}
                    onDownload={downloadOneQR}
                    onCopy={copyLink}
                  />
                </div>
              )}
              {showAllQrs && (
                <>
                  <div className="tables-qr-grid" data-testid="tables-qr-grid">
                    {paginate(tableNums, page).map((n) => (
                      <TableQrCard
                        key={n}
                        n={n}
                        restaurantName={restaurantName}
                        slug={slug}
                        qrLocked={qrLocked}
                        onDownload={downloadOneQR}
                        onCopy={copyLink}
                      />
                    ))}
                  </div>
                  <PageBar
                    page={page}
                    total={tableNums.length}
                    pageSize={PAGE_SIZE}
                    onPage={setPage}
                    testId="tables-page-bar"
                  />
                </>
              )}
            </div>
            {qrLocked && (
              <div className="qr-paywall-overlay" data-testid="tables-qr-paywall">
                <Lock size={28} className="qr-paywall-icon" color="#000" />
                <div className="qr-paywall-title">
                  {isExpired ? "Pay to unlock" : "Subscribe to unlock"}
                </div>
                <div className="qr-paywall-sub">
                  {isExpired
                    ? "Renew your subscription first, then download clear table QRs."
                    : "Subscribe to download clear table QRs."}
                </div>
                <button
                  type="button"
                  className="qr-paywall-cta"
                  onClick={() => (onOpenSubscribe ? onOpenSubscribe() : navigate("/manager/subscribe"))}
                  data-testid="tables-qr-unlock-btn"
                >
                  {isExpired ? "Pay & Resume" : "Unlock QRs"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {detail && (
        <div
          className="bill-modal-overlay"
          data-testid="table-session-detail"
          onClick={() => setDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 18,
              maxWidth: 520,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div className="font-serif" style={{ fontSize: 20, color: "var(--gold)" }}>
                Table {detail.table} — Current Bill
              </div>
              <span className={`badge ${detail.status === "payment_pending" ? "badge-cooking" : "badge-new"}`}>
                {statusLabel(detail.status)}
              </span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 14px" }}>
              Session {detail.session_code}
            </div>

            <div className="tables-block-title">Orders</div>
            {(detail.orders || []).filter((o) => o.status !== "cancelled").length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>No orders yet.</div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                {(detail.orders || []).filter((o) => o.status !== "cancelled").map((o) => (
                  <div
                    key={o.id}
                    data-testid={`session-order-${o.order_number}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--line)",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>Order #{o.order_number}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        {formatWhen(o.created_at)} · {(o.items || []).map((it) => `${it.name} ×${it.qty}`).join(", ")}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{rupee(o.amount)}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              <span>Current Bill</span>
              <span data-testid="session-current-total">{rupee(detail.current_total)}</span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {detail.status === "open" && (
                <button
                  type="button"
                  className="mini-btn"
                  data-testid="session-request-bill"
                  onClick={() => requestBill(detail.id)}
                >
                  Request bill
                </button>
              )}
              <button
                type="button"
                className="mini-btn primary"
                data-testid="session-open-bill"
                onClick={() => setBillSession(detail)}
              >
                <Receipt size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                Bill / Close table
              </button>
              <button type="button" className="mini-btn" onClick={() => openQrForTable(detail.table)}>
                <QrCode size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                View QR
              </button>
              <button type="button" className="submit-btn ghost" onClick={() => setDetail(null)} style={{ marginLeft: "auto" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {billSession && (
        <BillModal
          session={billSession}
          settings={settings}
          onClose={() => setBillSession(null)}
          onSettled={() => {
            setBillSession(null);
            setDetail(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
