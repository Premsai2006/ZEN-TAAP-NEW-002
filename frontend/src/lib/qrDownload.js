/** Print-ready table QR tent cards — poster layout with ZenTaap branding. */

export const ZENTAAP_LOGO_SRC = "/zentaap-logo.png";

const ORANGE = "#e87d2f";
const INK = "#161310";
const NAVY = "#1c2740";
const CREAM = "#F6EFE4";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

let _logoPromise;
function loadLogo() {
  if (!_logoPromise) {
    _logoPromise = loadImage(ZENTAAP_LOGO_SRC).catch(() => null);
  }
  return _logoPromise;
}

function padTable(n) {
  return String(n).padStart(2, "0");
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function logoSize(img, maxW, maxH) {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const scale = Math.min(maxW / iw, maxH / ih);
  return { w: iw * scale, h: ih * scale };
}

function drawLogoFit(ctx, img, cx, cy, maxW, maxH) {
  const { w, h } = logoSize(img, maxW, maxH);
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Clip the wordmark onto a light plate — the asset is designed for white/beige. */
function drawLogoPlate(ctx, img, cx, cy, maxW, maxH, radius = 18) {
  const { w, h } = logoSize(img, maxW, maxH);
  ctx.save();
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, radius);
  ctx.clip();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function drawPhoneIcon(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.6, s * 0.08);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const pw = s * 0.48;
  const ph = s * 0.78;
  const px = x + (s - pw) / 2;
  const py = y + (s - ph) / 2;
  roundRect(ctx, px, py, pw, ph, s * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + pw * 0.28, py + ph * 0.22);
  ctx.lineTo(px + pw * 0.72, py + ph * 0.22);
  ctx.moveTo(px + pw * 0.28, py + ph * 0.22);
  ctx.lineTo(px + pw * 0.28, py + ph * 0.42);
  ctx.moveTo(px + pw * 0.72, py + ph * 0.22);
  ctx.lineTo(px + pw * 0.72, py + ph * 0.42);
  ctx.moveTo(px + pw * 0.22, py + ph * 0.58);
  ctx.lineTo(px + pw * 0.78, py + ph * 0.58);
  ctx.stroke();
  ctx.restore();
}

function drawMenuIcon(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.6, s * 0.08);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const mw = s * 0.62;
  const mh = s * 0.72;
  const mx = x + (s - mw) / 2;
  const my = y + (s - mh) / 2;
  roundRect(ctx, mx, my, mw, mh, s * 0.1);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const ly = my + mh * (0.32 + i * 0.2);
    ctx.moveTo(mx + mw * 0.2, ly);
    ctx.lineTo(mx + mw * 0.8, ly);
  }
  ctx.stroke();
  ctx.restore();
}

function drawClocheIcon(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.6, s * 0.08);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const cx = x + s / 2;
  const cy = y + s * 0.58;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.28, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.34, cy);
  ctx.lineTo(cx + s * 0.34, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, y + s * 0.24, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a print-ready tent card: logo, SCAN TO ORDER NOW, QR, 3 steps, footer.
 * @returns {Promise<Blob>} PNG blob
 */
export async function buildLabeledQrPng(svgEl, tableNum, { restaurantName } = {}) {
  let svgMarkup = new XMLSerializer().serializeToString(svgEl);
  if (!/xmlns=/.test(svgMarkup)) {
    svgMarkup = svgMarkup.replace(
      /<svg\b/,
      '<svg xmlns="http://www.w3.org/2000/svg"'
    );
  }
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const [qrImg, logo] = await Promise.all([loadImage(svgUrl), loadLogo()]);

  const W = 900;
  const H = 1480;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 14, 14, W - 28, H - 28, 38);
  ctx.fill();

  ctx.save();
  roundRect(ctx, 14, 14, W - 28, H - 28, 38);
  ctx.clip();

  ctx.fillStyle = "rgba(232,125,47,0.06)";
  [[70, 430], [830, 390], [80, 870], [820, 910], [150, 990]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(dx, dy, 16, 0, Math.PI * 2);
    ctx.fill();
  });

  // Top-left orange wave
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * 0.58, 0);
  ctx.quadraticCurveTo(W * 0.32, 28, W * 0.2, 96);
  ctx.quadraticCurveTo(W * 0.08, 168, 0, 188);
  ctx.closePath();
  ctx.fill();

  const logoY = 128;
  if (logo) {
    drawLogoPlate(ctx, logo, W / 2, logoY, 520, 132, 20);
  } else {
    ctx.fillStyle = ORANGE;
    ctx.font = "800 54px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillText("ZenTaap", W / 2, logoY);
  }

  // SCAN TO ORDER NOW — ORDER NOW in brand orange, ticks on both sides
  const ctaY = 224;
  ctx.font = "800 32px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  const wScan = ctx.measureText("SCAN TO  ").width;
  ctx.font = "900 40px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  const wOrderNow = ctx.measureText("ORDER NOW").width;
  let ctaX = W / 2 - (wScan + wOrderNow) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "800 32px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText("SCAN TO  ", ctaX, ctaY);
  ctaX += wScan;
  ctx.fillStyle = ORANGE;
  ctx.font = "900 40px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText("ORDER NOW", ctaX, ctaY);
  ctx.textAlign = "center";

  ctx.fillStyle = ORANGE;
  [W / 2 - 278, W / 2 + 248].forEach((ax) => {
    ctx.save();
    ctx.translate(ax, ctaY);
    ctx.rotate(-0.48);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(i * 9, -11, 3, 22);
    }
    ctx.restore();
  });

  const tableLabel = `TABLE ${padTable(tableNum)}`;
  const rest = restaurantName ? String(restaurantName).slice(0, 40) : "";
  ctx.fillStyle = NAVY;
  ctx.font = "800 26px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText(tableLabel, W / 2, 272);
  if (rest) {
    ctx.fillStyle = "#666666";
    ctx.font = "500 17px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillText(rest, W / 2, 300);
  }

  const qrSize = 408;
  const qrX = (W - qrSize) / 2;
  const qrY = rest ? 328 : 318;
  ctx.fillStyle = INK;
  roundRect(ctx, qrX - 18, qrY - 18, qrSize + 36, qrSize + 36, 24);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 16);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  if (logo) {
    const badge = 108;
    const bx = W / 2;
    const by = qrY + qrSize / 2;
    ctx.beginPath();
    ctx.arc(bx, by, badge / 2 + 7, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, badge / 2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, badge / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = CREAM;
    ctx.fill();
    drawLogoFit(ctx, logo, bx, by, badge - 8, badge - 16);
    ctx.restore();
  }

  const stepY = qrY + qrSize + 86;
  const steps = [
    { label: "SCAN", rest: "the QR code", icon: drawPhoneIcon },
    { label: "CHOOSE", rest: "your items", icon: drawMenuIcon },
    { label: "ENJOY", rest: "your meal", icon: drawClocheIcon },
  ];
  const colW = 260;
  const startX = (W - colW * 3) / 2 + colW / 2;
  steps.forEach((step, i) => {
    const sx = startX + i * colW;
    const iconCx = sx - 74;
    const iconR = 22;
    const iconSize = 26;

    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(iconCx, stepY, iconR, 0, Math.PI * 2);
    ctx.stroke();
    step.icon(ctx, iconCx - iconSize / 2, stepY - iconSize / 2, iconSize, INK);

    const numX = sx - 38;
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(numX, stepY - 8, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 12px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillText(String(i + 1), numX, stepY - 7);

    ctx.textAlign = "left";
    ctx.font = "800 15px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillStyle = INK;
    ctx.fillText(step.label, sx - 22, stepY - 8);
    ctx.font = "500 13px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillStyle = "#444444";
    ctx.fillText(step.rest, sx - 22, stepY + 12);
    ctx.textAlign = "center";

    if (i < 2) {
      ctx.strokeStyle = "rgba(22,19,16,0.14)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx + colW / 2, stepY - 26);
      ctx.lineTo(sx + colW / 2, stepY + 26);
      ctx.stroke();
    }
  });

  const footTop = H - 278;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W, H);
  ctx.lineTo(W, footTop + 62);
  ctx.quadraticCurveTo(W * 0.74, footTop - 18, W * 0.5, footTop + 22);
  ctx.quadraticCurveTo(W * 0.22, footTop + 68, 0, footTop + 12);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, footTop + 12);
  ctx.quadraticCurveTo(W * 0.22, footTop + 68, W * 0.5, footTop + 22);
  ctx.quadraticCurveTo(W * 0.74, footTop - 18, W, footTop + 62);
  ctx.stroke();

  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(W / 2, footTop + 86, 15, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 20, footTop + 86);
  ctx.lineTo(W / 2 + 20, footTop + 86);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 700 34px Georgia, 'Times New Roman', serif";
  ctx.fillText("Good Food", W / 2, footTop + 128);
  ctx.fillStyle = ORANGE;
  ctx.font = "800 30px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText("Great Experience!", W / 2, footTop + 166);

  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.moveTo(W / 2, footTop + 188);
  ctx.bezierCurveTo(W / 2 - 10, footTop + 178, W / 2 - 16, footTop + 190, W / 2, footTop + 200);
  ctx.bezierCurveTo(W / 2 + 16, footTop + 190, W / 2 + 10, footTop + 178, W / 2, footTop + 188);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText("Safe   ·   Contactless   ·   Fast", 210, H - 46);
  ctx.fillStyle = ORANGE;
  ctx.font = "700 13px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText("Powered by ZenTaap", W - 168, H - 46);

  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  roundRect(ctx, 14, 14, W - 28, H - 28, 38);
  ctx.stroke();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
      "image/png"
    );
  });
}

export function qrFileName(tableNum) {
  return `Table-${padTable(tableNum)}.png`;
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Zip all table QR PNGs. `items` = [{ tableNum, svgEl }, ...]
 */
export async function downloadAllQrsZip(items, { slug, restaurantName } = {}) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder(slug ? `${slug}-table-qrs` : "table-qrs");

  for (const { tableNum, svgEl } of items) {
    if (!svgEl) continue;
    const png = await buildLabeledQrPng(svgEl, tableNum, { restaurantName });
    folder.file(qrFileName(tableNum), png);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const name = slug ? `zentaap-${slug}-all-table-qrs.zip` : "zentaap-all-table-qrs.zip";
  triggerBlobDownload(zipBlob, name);
  return items.length;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read QR image"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Print all labeled QR cards in a real-sized print frame.
 * (0×0 iframes print blank in Chrome; parent @media print used to hide everything.)
 */
export async function printAllLabeledQrs(items, { restaurantName } = {}) {
  const cards = [];
  for (const { tableNum, svgEl } of items) {
    if (!svgEl) continue;
    const png = await buildLabeledQrPng(svgEl, tableNum, { restaurantName });
    const dataUrl = await blobToDataUrl(png);
    cards.push(
      `<div class="qrcard"><img src="${dataUrl}" alt="Table ${tableNum}" width="420" height="690" /></div>`
    );
  }
  if (cards.length === 0) throw new Error("No QR codes ready");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ZenTaap Table QR Codes</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; }
    h1 { font-size: 18px; margin: 0 0 14px; color: #e87d2f; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 20px; justify-items: center; }
    .qrcard { break-inside: avoid; page-break-inside: avoid; page-break-after: always; text-align: center; }
    .qrcard:last-child { page-break-after: auto; }
    .qrcard img { width: 100%; max-width: 420px; height: auto; display: block; margin: 0 auto; }
    @media print {
      body { padding: 0; }
      .qrcard { page-break-after: always; }
      .no-print-ui { display: none !important; }
    }
    @page { margin: 8mm; size: auto; }
  </style>
</head>
<body>
  <h1 class="no-print-ui">ZenTaap — ${cards.length} table QR codes</h1>
  <div class="grid">${cards.join("")}</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup blocked");
  }

  await new Promise((resolve) => {
    w.onload = () => resolve();
    const t0 = Date.now();
    const tick = () => {
      try {
        if (w.document && w.document.readyState === "complete") return resolve();
      } catch {
        /* ignore */
      }
      if (Date.now() - t0 > 8000) return resolve();
      setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  });

  try {
    const imgs = Array.from(w.document.images || []);
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      )
    );
  } catch {
    /* ignore */
  }

  await new Promise((r) => setTimeout(r, 200));

  try {
    w.focus();
    w.print();
  } finally {
    setTimeout(() => {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  return cards.length;
}
