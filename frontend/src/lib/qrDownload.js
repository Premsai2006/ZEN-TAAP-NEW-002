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
  // Prefer data-URI — more reliable than blob URL for <img> SVG in Chrome
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
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
  } catch (err) {
    throw err;
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
      `<div class="qrcard"><img src="${dataUrl}" alt="Table ${tableNum}" width="340" height="438" /></div>`
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
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .qrcard { break-inside: avoid; page-break-inside: avoid; text-align: center; border: 1px solid #eee; border-radius: 12px; padding: 8px; }
    .qrcard img { width: 100%; max-width: 340px; height: auto; display: block; margin: 0 auto; }
    @media print {
      body { padding: 8px; }
      .grid { gap: 12px; }
      .qrcard { border: none; padding: 0; }
      .no-print-ui { display: none !important; }
    }
    @page { margin: 10mm; size: auto; }
  </style>
</head>
<body>
  <h1 class="no-print-ui">ZenTaap — ${cards.length} table QR codes</h1>
  <div class="grid">${cards.join("")}</div>
</body>
</html>`;

  // Blob URL window — visible content, independent of app print CSS
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup blocked");
  }

  await new Promise((resolve) => {
    const done = () => resolve();
    w.onload = done;
    // Some browsers fire load before we attach; also poll readyState
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

  // Wait for images inside the print window
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
