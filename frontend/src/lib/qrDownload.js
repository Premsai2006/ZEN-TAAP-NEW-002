/** Build labeled QR card images and optional ZIP for table downloads. */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load QR image"));
    img.src = src;
  });
}

function padTable(n) {
  return String(n).padStart(2, "0");
}

/**
 * Draw a print-ready card: brand + QR + large TABLE N label.
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
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const qrImg = await loadImage(svgUrl);
    const W = 480;
    const H = 620;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Orange frame
    ctx.strokeStyle = "#e87d2f";
    ctx.lineWidth = 6;
    roundRect(ctx, 18, 18, W - 36, H - 36, 22);
    ctx.stroke();

    // Brand
    ctx.fillStyle = "#e87d2f";
    ctx.font = "700 34px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.fillText("ZenTaap", W / 2, 70);

    if (restaurantName) {
      ctx.fillStyle = "#666666";
      ctx.font = "500 16px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
      const name = String(restaurantName).slice(0, 36);
      ctx.fillText(name, W / 2, 96);
    }

    // QR
    const qrSize = 260;
    const qrX = (W - qrSize) / 2;
    const qrY = restaurantName ? 118 : 100;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    // Table number — large and clear
    const labelY = qrY + qrSize + 56;
    ctx.fillStyle = "#161310";
    ctx.font = "800 48px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillText(`TABLE ${tableNum}`, W / 2, labelY);

    ctx.fillStyle = "#666666";
    ctx.font = "500 18px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillText(`Scan to order · Table ${tableNum}`, W / 2, labelY + 36);

    ctx.fillStyle = "#999999";
    ctx.font = "400 13px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillText("Place this on the table", W / 2, labelY + 64);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
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
 * Print all labeled QR cards via a hidden iframe (no popup / blank page).
 * `items` = [{ tableNum, svgEl }, ...]
 */
export async function printAllLabeledQrs(items, { restaurantName } = {}) {
  const cards = [];
  for (const { tableNum, svgEl } of items) {
    if (!svgEl) continue;
    const png = await buildLabeledQrPng(svgEl, tableNum, { restaurantName });
    const dataUrl = await blobToDataUrl(png);
    cards.push(
      `<div class="qrcard"><img src="${dataUrl}" alt="Table ${tableNum}" /></div>`
    );
  }
  if (cards.length === 0) throw new Error("No QR codes ready");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Print table QRs");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Print frame unavailable");
  }

  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ZenTaap Table QR Codes</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: -apple-system, sans-serif; background: #fff; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .qrcard { break-inside: avoid; page-break-inside: avoid; text-align: center; }
    .qrcard img { width: 100%; max-width: 340px; height: auto; }
    @media print {
      body { padding: 8px; }
      .grid { gap: 12px; }
      .qrcard img { max-width: 100%; }
    }
    @page { margin: 10mm; }
  </style>
</head>
<body><div class="grid">${cards.join("")}</div></body>
</html>`);
  doc.close();

  const imgs = Array.from(doc.images || []);
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

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  try {
    win.focus();
    win.print();
  } finally {
    if (typeof win.onafterprint !== "undefined") win.onafterprint = cleanup;
    setTimeout(cleanup, 60_000);
  }

  return cards.length;
}
