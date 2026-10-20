import { code39Bars, code39Clean } from '@/lib/barcode';

/**
 * Hand-rolled PDF writer for barcode stickers.
 *
 * The page's MediaBox *is* the sticker, so the label printer gets a job the
 * exact size of the media. Driving this through the browser's print dialog
 * instead never worked: a CSS `@page size` is advisory, and the job kept coming
 * out centred on A4. Emitting the PDF ourselves also avoids pulling a PDF
 * library into a shop that has to keep working offline.
 */

const MM_TO_PT = 72 / 25.4;

/** Helvetica digits are 556/1000 em; other glyphs vary, so this is a close estimate. */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += 0.556;
    else if (ch === ' ' || ch === '.' || ch === ',') em += 0.278;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += 0.667;
    else em += 0.533;
  }
  return em * size;
}

/** Escape the three characters that are special inside a PDF literal string. */
function pdfString(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

export interface LabelOptions {
  /** Encoded in the bars and printed underneath — the IMEI. */
  code: string;
  /** Small caption above the bars, e.g. "Iphone 11 · 128GB · blue". */
  caption?: string;
  widthMm?: number;
  heightMm?: number;
  /** Repeat the same sticker across N pages, one per handset. */
  copies?: number;
}

/** Content stream for one sticker, drawn bottom-left origin like PDF wants. */
function labelContent(opts: Required<Pick<LabelOptions, 'code' | 'widthMm' | 'heightMm'>> & { caption: string }): string {
  const w = opts.widthMm * MM_TO_PT;
  const h = opts.heightMm * MM_TO_PT;
  const pad = 2 * MM_TO_PT;

  const code = code39Clean(opts.code);
  const codeSize = Math.min(9.5, h * 0.14);

  // A long model name plus storage, colour and battery health can outrun 50mm.
  // Shrink the caption until it fits rather than letting it run off the sticker
  // — it stays readable down to about 3.6pt, which is where a label printer
  // gives up anyway.
  let capSize = Math.min(6, h * 0.09);
  const capRoom = w - pad * 2;
  if (opts.caption) {
    const natural = textWidth(opts.caption, capSize);
    if (natural > capRoom) capSize = Math.max(3.6, (capSize * capRoom) / natural);
  }

  const ops: string[] = ['1 1 1 rg', `0 0 ${w.toFixed(2)} ${h.toFixed(2)} re f`, '0 0 0 rg'];

  if (opts.caption) {
    const x = Math.max(1, (w - textWidth(opts.caption, capSize)) / 2);
    ops.push(`BT /F1 ${capSize.toFixed(2)} Tf ${x.toFixed(2)} ${(h - pad - capSize * 0.8).toFixed(2)} Td (${pdfString(opts.caption)}) Tj ET`);
  }

  // Bars fill the width between the margins; the module size follows from that.
  const { bars, width } = code39Bars(code);
  const module = width > 0 ? (w - pad * 2) / width : 0;
  const barsTop = h - pad - (opts.caption ? capSize + 3 : 0);
  const barsBottom = pad + codeSize + 2;
  const barsHeight = Math.max(6, barsTop - barsBottom);

  for (const b of bars) {
    ops.push(`${(pad + b.x * module).toFixed(3)} ${barsBottom.toFixed(2)} ${(b.w * module).toFixed(3)} ${barsHeight.toFixed(2)} re`);
  }
  if (bars.length) ops.push('f');

  const codeX = Math.max(1, (w - textWidth(code, codeSize)) / 2);
  ops.push(`BT /F2 ${codeSize.toFixed(2)} Tf ${codeX.toFixed(2)} ${(pad * 0.5).toFixed(2)} Td (${pdfString(code)}) Tj ET`);

  return ops.join('\n');
}

/** Assemble the PDF file: one page per copy, all the same sticker. */
export function buildLabelPdf(opts: LabelOptions): Blob {
  const widthMm = opts.widthMm ?? 50;
  const heightMm = opts.heightMm ?? 25;
  const copies = Math.max(1, Math.min(200, Math.floor(opts.copies ?? 1)));
  const w = (widthMm * MM_TO_PT).toFixed(2);
  const h = (heightMm * MM_TO_PT).toFixed(2);

  const content = labelContent({ code: opts.code, caption: opts.caption ?? '', widthMm, heightMm });

  // Object 1 catalog, 2 pages, 3 content (shared by every page), 4+5 fonts,
  // then one page object per copy.
  const pageIds = Array.from({ length: copies }, (_, i) => 6 + i);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${copies} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ...pageIds.map(() => '<< /Type /Page /Parent 2 0 R '
      + `/MediaBox [0 0 ${w} ${h}] `
      + '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> '
      + '/Contents 3 0 R >>'),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  // Latin-1 out: the caption may carry a middot, and WinAnsi maps it at 0xB7.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;

  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Open the sticker in a new tab, where the operator hits print.
 *
 * Must be called straight off a click — a tab opened later is treated as an
 * unsolicited popup and silently blocked.
 */
export function openLabelPdf(opts: LabelOptions): void {
  const url = URL.createObjectURL(buildLabelPdf(opts));
  const tab = window.open(url, '_blank');
  if (!tab) {
    // Popup blocked — fall back to a download so the label is not just lost.
    const a = document.createElement('a');
    a.href = url;
    a.download = `${code39Clean(opts.code) || 'label'}.pdf`;
    a.click();
  }
  // Give the viewer time to fetch the blob before dropping it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
