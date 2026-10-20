import { fmt, fmt0, prettyDate, prettyTime } from '@/lib/format';
import type { AppSettings, Invoice, InvoiceLine } from '@/types';

/**
 * The customer's bill — A4, traced from the shop's printed invoice.
 *
 * Built as a standalone HTML document so it can be dropped straight into an
 * iframe and printed, or saved as PDF, without the app's stylesheet reaching
 * it. The document title is what the browser offers as the PDF file name.
 */

// Palette off the printed bill: a blue headline, a near-black table head and
// footer band, and a green chip for battery health.
const BRAND = '#1a73e8';
const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e5e9f0';
const RED = '#dc2626';

const TERMS =
  'All sales are final. Warranty void if device is tampered. For service enquiries please '
  + 'contact us within 30 days of purchase with this invoice. This is a computer-generated '
  + 'document and is valid without a physical signature.';

/** Stands in for a column a line has nothing to put in. */
const DASH = '—';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** One printed row of the items table. */
interface Row {
  model: string;
  /** Caption under the model — how a line without IMEIs shows its quantity. */
  note: string;
  imei: string;
  colour: string;
  storage: string;
  battery: string;
  amount: number;
}

/**
 * Flatten the invoice into printed rows.
 *
 * A handset is billed one unit at a time, so each gets its own row carrying the
 * IMEI a warranty claim needs. Anything else — an accessory, a composite
 * product — keeps the same seven columns and simply has nothing to say in the
 * serial ones, so the bill reads the same whichever was sold.
 */
function rowsFor(lines: InvoiceLine[]): Row[] {
  return lines.flatMap((l) => {
    const units = l.units ?? [];
    if (units.length) {
      return units.map((u) => ({
        model: l.name,
        note: '',
        imei: u.imei || DASH,
        colour: u.colour || DASH,
        storage: u.storage || DASH,
        battery: u.battery === null || u.battery === undefined || u.battery === '' ? DASH : String(u.battery),
        amount: Number(l.price),
      }));
    }
    return [{
      model: l.name,
      note: `Qty ${fmt0(Number(l.qty))} × Rs ${fmt(Number(l.price))}`,
      imei: DASH,
      colour: DASH,
      storage: DASH,
      battery: DASH,
      amount: Number(l.total ?? Number(l.qty) * Number(l.price)),
    }];
  });
}

/** "I Tunes Lanka" prints as "I TUNES" with the last word in brand blue. */
function wordmark(company: string): string {
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return esc((words[0] ?? 'Company').toUpperCase());
  return `${esc(words.slice(0, -1).join(' ').toUpperCase())} <em>${esc(words[words.length - 1].toUpperCase())}</em>`;
}

/**
 * The document title, which is also the file name the print dialog suggests
 * when the bill is saved as PDF: the shop's name and the invoice number.
 */
export function invoiceDocTitle(d: Invoice, s: AppSettings): string {
  return `${(s.company || 'Invoice').trim()} - ${d.no}`;
}

/** The printable bill. */
export function invoiceDocHtml(d: Invoice, s: AppSettings): string {
  const lines = d.lines ?? [];
  const rows = rowsFor(lines);
  const company = (s.company || '').trim();

  // "6 Phones" while the bill is all handsets, "6 Items" the moment anything
  // else joins them.
  const handsets = lines.reduce((n, l) => n + (l.units?.length ?? 0), 0);
  const others = lines.filter((l) => !(l.units ?? []).length).reduce((n, l) => n + Number(l.qty), 0);
  const count = handsets + others;
  const noun = handsets > 0 && others === 0 ? 'Phone' : 'Item';

  const total = Number(d.total);
  const paid = Number(d.paid);
  const due = Math.max(0, total - paid);
  const discount = Number(d.discount_amount ?? 0);
  const returnCredit = Number(d.return_credit ?? 0);
  const tax = Number(d.tax_amount ?? 0);
  const cancelled = !!d.cancelled_at;
  const money = (n: number): string => `Rs ${fmt(n)}`;

  const itemRows = rows.length === 0
    ? '<tr><td colspan="7" class="c" style="padding:22px">No items on this invoice.</td></tr>'
    : rows.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td><b>${esc(r.model)}</b>${r.note ? `<div class="sub">${esc(r.note)}</div>` : ''}</td>
        <td class="mono">${esc(r.imei)}</td>
        <td>${esc(r.colour)}</td>
        <td>${esc(r.storage)}</td>
        <td>${r.battery === DASH ? DASH : `<span class="bat">${esc(r.battery)}</span>`}</td>
        <td class="r"><b>${fmt(r.amount)}</b></td>
      </tr>`).join('');

  // Goods handed back off this bill. The block only exists when something
  // actually came back, so an ordinary sale prints exactly as it did before.
  const returnLines = (d.returns ?? []).flatMap((r) => r.lines ?? []);
  const returnedTotal = (d.returns ?? []).reduce((t, r) => t + Number(r.total), 0);
  const returnsBlock = returnLines.length === 0 ? '' : `
    <div class="sectitle"><span>Goods Returned</span><i></i></div>
    <table class="tb">
      <thead><tr><th style="width:46px">No</th><th>Item</th><th class="r">Qty</th><th class="r">Value (Rs)</th></tr></thead>
      <tbody>${returnLines.map((l, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td><b>${esc(l.name)}</b></td>
          <td class="r">${fmt0(Number(l.qty))}</td>
          <td class="r"><b>${fmt(Number(l.total))}</b></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="retsum">Returned value <b>${money(returnedTotal)}</b></div>`;

  const line = (label: string, value: string, cls = ''): string =>
    `<div class="trow ${cls}"><span>${esc(label)}</span><span>${value}</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
  <title>${esc(invoiceDocTitle(d, s))}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; background: #fff; }
    /* The sheet always fills the page: 296mm rather than a full 297mm, so
       rounding cannot spill a blank second page out of the printer. A short
       bill therefore ends with its footer on the bottom edge, not with dead
       paper under it. */
    body { display: flex; flex-direction: column; min-height: 296mm;
           color: #1e293b; font: 12px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }

    .bar { flex: 0 0 auto; height: 6px; background: linear-gradient(90deg, ${BRAND}, #22c55e); }
    .page { flex: 1 1 auto; display: flex; flex-direction: column; padding: 26px 40px 22px; }

    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .brand { display: flex; gap: 14px; align-items: flex-start; }
    .mark { flex: 0 0 auto; width: 52px; height: 52px; border-radius: 12px; background: ${INK}; color: #fbbf24;
            display: grid; place-items: center; font-size: 19px; font-weight: 800; letter-spacing: .04em; }
    .co { font-size: 26px; font-weight: 800; line-height: 1.1; color: ${INK}; letter-spacing: -.01em; }
    .co em { font-style: normal; color: ${BRAND}; }
    .tag { margin: 4px 0 9px; font-size: 9px; font-weight: 700; letter-spacing: .34em; color: ${MUTED}; }
    .muted { color: ${MUTED}; font-size: 11.5px; line-height: 1.6; }

    .docmeta { flex: 0 0 auto; text-align: right; }
    .doctitle { font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: .12em; color: ${BRAND}; text-transform: uppercase; }
    .nopill { display: inline-block; margin-top: 11px; padding: 7px 16px; border-radius: 999px; background: #eaf2fe;
              border: 1px solid #cfe0fb; color: ${BRAND}; font: 700 13px Consolas, monospace; }
    .void { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 999px; background: #fee2e2;
            border: 1px solid #fecaca; color: ${RED}; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
    .meta { margin-top: 6px; font-size: 11.5px; color: ${MUTED}; }
    .meta b { color: ${INK}; }

    .band { display: flex; margin: 20px 0 18px; background: #f7f9fc; border-radius: 12px; }
    .bcol { flex: 1; padding: 16px 20px; border-right: 1px solid ${RULE}; }
    .bcol:last-child { border-right: 0; text-align: right; }
    .lbl { margin-bottom: 7px; font-size: 9px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #94a3b8; }
    .who { font-size: 15px; font-weight: 800; color: ${INK}; }
    .due-amt { font-size: 22px; font-weight: 800; color: ${BRAND}; }

    .sectitle { display: flex; align-items: center; gap: 12px; margin: 18px 0 9px; }
    .sectitle span { font-size: 9.5px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #94a3b8; }
    .sectitle i { flex: 1; height: 1px; background: ${RULE}; }

    table.tb { width: 100%; border-collapse: collapse; }
    .tb th { padding: 11px 10px; background: ${INK}; color: #fff; font-size: 9.5px; font-weight: 700;
             letter-spacing: .1em; text-transform: uppercase; text-align: left; }
    .tb td { padding: 7px 10px; border-bottom: 1px solid #eef2f7; }
    /* A row is never split across pages, and a bill long enough to run over
       repeats its heading on the next sheet. */
    .tb tr { break-inside: avoid; }
    .tb thead { display: table-header-group; }
    .tb tbody tr:nth-child(even) { background: #f8fafc; }
    .tb th:first-child, .tb td:first-child { padding-left: 16px; }
    .tb th:last-child, .tb td:last-child { padding-right: 16px; }
    .tb th.r, .tb td.r { text-align: right; }
    .c { text-align: center; color: #94a3b8; }
    .mono { font-family: Consolas, monospace; font-size: 11px; color: ${MUTED}; letter-spacing: .02em; }
    .sub { margin-top: 2px; font-size: 10.5px; color: ${MUTED}; }
    .bat { display: inline-block; padding: 2px 9px; border-radius: 999px; background: #dcfce7; color: #15803d;
           font-size: 11px; font-weight: 700; }
    .retsum { margin-top: 6px; text-align: right; font-size: 12px; color: ${MUTED}; }

    .close { display: flex; gap: 40px; margin-top: 18px; margin-bottom: 18px; }
    .signcol { flex: 1; align-self: flex-end; }
    .signline { width: 210px; margin-bottom: 7px; border-top: 1.5px solid #cbd5e1; }
    .signname { font-size: 13px; font-weight: 800; color: ${INK}; }
    .totcol { flex: 0 0 auto; width: 320px; }
    .trow { display: flex; justify-content: space-between; padding: 6px 16px; font-size: 12.5px; }
    .trow.due { color: ${RED}; font-weight: 700; }
    .grand { display: flex; justify-content: space-between; margin: 9px 0; padding: 13px 16px; border-radius: 8px;
             background: ${INK}; color: #fff; font-size: 14px; font-weight: 800; letter-spacing: .04em; }

    /* Whatever slack a short bill leaves collects here, above the terms, so the
       page ends on the footer instead of on empty paper. */
    .terms { margin-top: auto; padding: 10px 16px; border-left: 3px solid ${BRAND}; border-radius: 0 8px 8px 0;
             background: #f7f9fc; font-size: 11px; line-height: 1.6; color: #475569; }
    .terms b { color: ${INK}; }

    .footbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
               padding: 14px 40px; background: ${INK}; color: #cbd5e1; font-size: 10.5px; letter-spacing: .04em; }
    .footbar b { color: #fff; font-weight: 700; }
    .footbar b em { font-style: normal; color: #7cb2ff; }
    .footright { text-align: right; }
    /* Inside the footer band, so nothing sits below the last printed line. */
    .gen { margin-top: 3px; font-size: 9px; color: #8fa0b5; }
  </style></head><body>

  <div class="bar"></div>
  <div class="page">
    <div class="head">
      <div class="brand">
        <span class="mark">${esc((s.logo || 'IT').slice(0, 2).toUpperCase())}</span>
        <div>
          <div class="co">${wordmark(company || 'Invoice')}</div>
          <div class="tag">BILL SYSTEMS</div>
          <div class="muted">
            ${s.address ? esc(s.address).replace(/\n/g, '<br>') + '<br>' : ''}
            ${[s.phone ? 'Tel: ' + esc(s.phone) : '', esc(s.email ?? '')].filter(Boolean).join(' &middot; ')}
            ${s.vat_no ? '<br>VAT: ' + esc(s.vat_no) : ''}
          </div>
        </div>
      </div>
      <div class="docmeta">
        <div class="doctitle">Invoice</div>
        <div class="nopill">${esc(d.no)}</div>
        ${cancelled ? '<div class="void">CANCELLED</div>' : ''}
        <div class="meta"><b>Date:</b> ${esc(prettyDate(d.date))}</div>
        ${d.created_at ? `<div class="meta"><b>Time:</b> ${esc(prettyTime(d.created_at))}</div>` : ''}
        <div class="meta"><b>Total Items:</b> ${fmt0(count)} ${noun}${count === 1 ? '' : 's'}</div>
      </div>
    </div>

    <div class="band">
      <div class="bcol">
        <div class="lbl">Bill To</div>
        <div class="who">${esc(d.customer?.name ?? 'Walk-in customer')}</div>
        <div class="muted">
          ${d.customer?.address ? esc(d.customer.address) + '<br>' : ''}
          ${d.customer?.city ? esc(d.customer.city) + '<br>' : ''}
          ${esc(d.customer?.phone ?? '')}
        </div>
      </div>
      <div class="bcol">
        <div class="lbl">From</div>
        <div class="who">${esc(company)}</div>
        <div class="muted">${s.address ? esc(s.address).replace(/\n/g, '<br>') : ''}</div>
      </div>
      <div class="bcol">
        <div class="lbl">Amount Due</div>
        <div class="due-amt">${money(due)}</div>
        <div class="muted">${due > 0 ? 'Payment Pending' : 'Paid in Full'}</div>
      </div>
    </div>

    <div class="sectitle"><span>Purchased Items</span><i></i></div>
    <table class="tb">
      <thead>
        <tr>
          <th style="width:46px">No</th>
          <th>Phone Model</th>
          <th style="width:130px">IMEI Number</th>
          <th style="width:76px">Colour</th>
          <th style="width:76px">Storage</th>
          <th style="width:76px">Battery</th>
          <th class="r" style="width:110px">Price (Rs)</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${returnsBlock}

    <div class="close">
      <div class="signcol">
        <div class="signline"></div>
        <div class="lbl">Authorised Signature</div>
        <div class="signname">${esc(company)}</div>
      </div>
      <div class="totcol">
        ${line('Sub Total', money(Number(d.subtotal)))}
        ${discount > 0 ? line('Discount', '- ' + money(discount)) : ''}
        ${returnCredit > 0 ? line('Return Credit', '- ' + money(returnCredit)) : ''}
        ${tax > 0 ? line(`Tax (${fmt(Number(d.tax_rate))}%)`, money(tax)) : ''}
        <div class="grand"><span>GRAND TOTAL</span><span>${money(total)}</span></div>
        ${line(d.type === 'cash' ? 'Cash Received' : 'Paid', money(paid))}
        ${line('Amount Due', money(due), due > 0 ? 'due' : '')}
      </div>
    </div>

    <div class="terms"><b>Terms &amp; Conditions:</b> ${esc(TERMS)}</div>
  </div>

  <div class="footbar">
    <b>${wordmark(company || 'Invoice')} &middot; BILL SYSTEMS</b>
    <div class="footright">
      <div>Thank you for your purchase! We appreciate your business.</div>
      <div class="gen">Generated: ${esc(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
    </div>
  </div>
  </body></html>`;
}
