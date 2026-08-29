import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, Link2, Lock, QrCode, Search } from "lucide-react";
import { toast } from "sonner";
import { restaurantOrderUrl } from "@/lib/qr";
import {
  buildLabeledQrPng,
  downloadAllQrsZip,
  qrFileName,
  triggerBlobDownload,
} from "@/lib/qrDownload";
import PageBar, { PAGE_SIZE, paginate } from "@/components/ui/PageBar";

const OPEN_ORDER = new Set(["new", "cooking", "done"]);

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
      if (OPEN_ORDER.has(o.status) && o.table > 0) {
        map[o.table] = (map[o.table] || 0) + o.amount;
      }
    }
    return map;
  }, [orders]);

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

  const occupiedNums = useMemo(
    () => tableNums.filter((n) => amountByTable[n]),
    [tableNums, amountByTable]
  );
  const occupiedCount = occupiedNums.length;
  const emptyCount = tableCount - occupiedCount;

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

  const openQrForTable = (n) => {
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
              const occupied = Boolean(amountByTable[n]);
              return (
                <button
                  key={n}
                  type="button"
                  className={`tables-floor-num${occupied ? " occupied" : ""}${floorPick === n ? " is-focus" : ""}`}
                  onClick={() => setFloorPick(n)}
                  title={occupied ? `Table ${n} · occupied` : `Table ${n} · empty`}
                  data-testid={`floor-table-${n}`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="tables-block-title">Occupied now</div>
          {occupiedNums.length === 0 ? (
            <div className="tables-qr-empty" data-testid="tables-occupied-empty">
              All tables are empty.
            </div>
          ) : (
            <div className="tables-occ-grid" data-testid="tables-occupied-list">
              {occupiedNums.map((n) => (
                <div
                  key={n}
                  className={`tables-occ-card${floorPick === n ? " is-focus" : ""}`}
                  data-testid={`occupied-table-${n}`}
                >
                  <div className="tables-occ-num">{n}</div>
                  <div className="tables-occ-meta">Occupied · ₹{amountByTable[n]}</div>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => openQrForTable(n)}
                    data-testid={`occupied-view-qr-${n}`}
                  >
                    <QrCode size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                    View QR
                  </button>
                </div>
              ))}
            </div>
          )}
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
    </div>
  );
}
