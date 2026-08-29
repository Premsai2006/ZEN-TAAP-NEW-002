/** Print-ready table QR cards — restaurant name, QR, powered by ZenTaap. */

export const ZENTAAP_LOGO_SRC = "/zentaap-logo.png";

const ORANGE = "#e87d2f";
const INK = "#161310";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function padTable(n) {
  return String(n).padStart(2, "0");
}

function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const words = raw.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/…$/, "").trim()}…`;
  return kept;
}

function fitNameLines(ctx, text, maxWidth) {
  const fallback = "Restaurant";
  const value = String(text || "").trim() || fallback;
  for (const size of [56, 48, 42, 36, 30]) {
    ctx.font = `700 ${size}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    const lines = wrapText(ctx, value, maxWidth, 3);
    const tooWide = lines.some((line) => ctx.measureText(line).width > maxWidth);
    if (!tooWide || size === 30) return { lines, size };
  }
  return { lines: [value], size: 30 };
}

/**
 * Draw a simple QR card: restaurant name, QR code, powered-by line.
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
  const qrImg = await loadImage(svgUrl);

  const W = 900;
  const H = 1120;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const nameMaxW = W - 120;
  const { lines, size } = fitNameLines(ctx, restaurantName, nameMaxW);
  const lineH = size + 10;
  const nameBlockH = lines.length * lineH;
  let y = 120;

  ctx.fillStyle = INK;
  ctx.font = `700 ${size}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, y + i * lineH);
  });
  y += nameBlockH + 18;

  ctx.fillStyle = "#6b6560";
  ctx.font = "600 28px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText(`Table ${padTable(tableNum)}`, W / 2, y);
  y += 56;

  const qrSize = 520;
  const qrX = (W - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, y, qrSize, qrSize);

  ctx.fillStyle = ORANGE;
  ctx.font = "600 22px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  ctx.fillText("Powered by ZenTaap", W / 2, H - 72);

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
      `<div class="qrcard"><img src="${dataUrl}" alt="Table ${tableNum}" width="420" height="522" /></div>`
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
