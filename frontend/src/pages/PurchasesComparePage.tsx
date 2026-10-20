import { useMemo, useState } from 'react';
import { Plus, X, Scale, RotateCcw, TrendingDown, Equal, Printer } from 'lucide-react';
import { fmt, fmt0, prettyDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useSettings } from '@/store/settings';
import { PageHead } from '@/components/PageHead';
import { Button } from '@/components/ui/Button';
import { Input, MoneyInput } from '@/components/ui/Field';
import type { AppSettings } from '@/types';

/**
 * Side-by-side quote comparison for two suppliers.
 *
 * Buying a lot of phones from China means two suppliers quote in yuan for the
 * same list of models. What matters is not which line is cheaper but which
 * supplier's whole lot lands cheaper once the rate and the quantities are in,
 * so every model is one row carrying both quotes and the gap between them.
 *
 * Nothing is saved: this is a desk calculator used before a purchase is placed,
 * and the GRN is what records the purchase that follows.
 */

interface Row {
  id: number;
  /**
   * A phone quoted in yuan, or an extra billed straight in rupees — freight,
   * cables, cases. Both add to the lot, but only a model goes through the rate.
   */
  kind: 'model' | 'part';
  model: string;
  /** Per-supplier quote: price each (yuan for a model, LKR for a part) and qty. */
  a: Quote;
  b: Quote;
}

interface Quote { price: string; qty: string }

type Side = 'a' | 'b';

let nextId = 1;
const blankRow = (kind: Row['kind'] = 'model', model = ''): Row => ({
  id: nextId++,
  kind,
  model,
  a: { price: '', qty: '' },
  b: { price: '', qty: '' },
});

const num = (v: string) => Number(v) || 0;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One supplier's own order, ready to be printed and sent to them. */
interface Order {
  supplier: string;
  models: { name: string; yuan: number; qty: number; lkr: number; cost: number }[];
  parts: { name: string; each: number; qty: number; cost: number }[];
  yuanTotal: number;
  partsTotal: number;
  total: number;
}

/**
 * The order sheet for one supplier, as a printable page.
 *
 * Deliberately carries **only the supplier it is addressed to** — their own
 * quote, never the rival's. The whole point of the page is that the two
 * suppliers do not see each other's numbers.
 */
function orderPage(o: Order, rate: number, settings: AppSettings): string {
  const modelRows = o.models.map((m, i) => `<tr>
      <td class="c">${i + 1}</td><td><b>${esc(m.name || '—')}</b></td>
      <td class="r mono">${fmt(m.yuan)}</td><td class="r">${fmt0(m.qty)}</td>
      <td class="r mono">${fmt(m.yuan * m.qty)}</td><td class="r"><b>${fmt(m.cost)}</b></td>
    </tr>`).join('');

  const partsBlock = o.parts.length === 0 ? '' : `
    <div class="sec">Additional items</div>
    <table class="tb">
      <thead><tr><th style="width:34px">#</th><th>Item</th><th class="r">Rate (LKR)</th><th class="r">Qty</th><th class="r">Amount (LKR)</th></tr></thead>
      <tbody>${o.parts.map((p, i) => `<tr>
        <td class="c">${i + 1}</td><td><b>${esc(p.name || '—')}</b></td>
        <td class="r">${fmt(p.each)}</td><td class="r">${fmt0(p.qty)}</td>
        <td class="r"><b>${fmt(p.cost)}</b></td>
      </tr>`).join('')}</tbody>
    </table>`;

  return `
    <div class="bar"></div>
    <div class="page">
      <div class="head">
        <div style="display:flex;gap:14px;align-items:flex-start">
          <span class="logo">${esc(settings.logo || 'XX')}</span>
          <div>
            <div class="co">${esc(settings.company || 'Distributor')}</div>
            <div class="muted">
              ${settings.address ? esc(settings.address) + '<br>' : ''}
              ${[settings.phone, settings.email].filter(Boolean).map((v) => esc(String(v))).join(' · ')}
            </div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="doc">Purchase Order</div>
          <div class="muted" style="margin-top:4px">${prettyDate(new Date().toISOString().slice(0, 10))}</div>
        </div>
      </div>

      <div class="cols">
        <div class="card">
          <div class="lbl">To (supplier)</div>
          <div class="sup">${esc(o.supplier)}</div>
        </div>
        <div class="card">
          <div class="lbl">Exchange rate applied</div>
          <div class="sup mono">1 ¥ = ${fmt(rate)} LKR</div>
        </div>
      </div>

      <div class="sec">Handsets ordered</div>
      <table class="tb">
        <thead><tr>
          <th style="width:34px">#</th><th>Model</th>
          <th class="r">¥ each</th><th class="r">Qty</th><th class="r">¥ amount</th><th class="r">LKR amount</th>
        </tr></thead>
        <tbody>${modelRows || '<tr><td colspan="6" class="c">No models on this order</td></tr>'}</tbody>
      </table>

      ${partsBlock}

      <div class="totwrap"><div class="tot">
        <div class="row"><span>Handsets (¥)</span><b class="mono">¥ ${fmt(o.yuanTotal)}</b></div>
        <div class="row"><span>Handsets (LKR)</span><span>${fmt(o.total - o.partsTotal)}</span></div>
        ${o.parts.length ? `<div class="row"><span>Additional items (LKR)</span><span>${fmt(o.partsTotal)}</span></div>` : ''}
        <div class="row grand"><span>Order total</span><span>${fmt(o.total)}</span></div>
      </div></div>

      <div class="sign"><div>Prepared by</div><div>Supplier confirmation</div></div>
      <div class="foot"><span>${esc(settings.company || '')}</span><span>Quantities and rates to be confirmed before dispatch.</span></div>
    </div>`;
}

/** Open the ticked suppliers' orders in a print window — one page each. */
function printOrders(orders: Order[], rate: number, settings: AppSettings): void {
  const w = window.open('', '_blank', 'width=860,height=980');
  if (!w) { toast('Allow pop-ups for this site to print the order.', 'err'); return; }
  const accent = settings.accent || '#C8102E';
  const title = orders.length === 1 ? `Purchase Order — ${orders[0].supplier}` : 'Purchase Orders';

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      *{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-sizing:border-box}
      body{margin:0;color:#1c1f26;font-size:13px}
      .bar{height:6px;background:${accent}}
      .page{padding:34px 42px}
      .sheet + .sheet{page-break-before:always}
      .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px}
      .logo{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:11px;background:${accent};color:#fff;font-weight:800;font-size:17px}
      .co{font-size:20px;font-weight:800;letter-spacing:-.02em}
      .muted{color:#69707c;font-size:11.5px;line-height:1.55}
      .doc{font-size:11px;font-weight:700;letter-spacing:.18em;color:${accent};text-transform:uppercase}
      .cols{display:flex;gap:18px;margin-bottom:22px}
      .card{flex:1;border:1px solid #e6e9ef;border-radius:12px;padding:14px 16px}
      .lbl{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#98a1b0;margin-bottom:6px}
      .sup{font-size:15px;font-weight:800}
      .sec{font-size:12px;font-weight:700;margin:18px 0 8px;color:#3c4350}
      table.tb{width:100%;border-collapse:collapse}
      .tb th{background:${accent}10;color:#3c4350;font-size:10px;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:8px;border-bottom:2px solid ${accent}44}
      .tb td{padding:8px;border-bottom:1px solid #eef0f2}
      .r{text-align:right} .c{text-align:center;color:#98a1b0} .mono{font-family:Consolas,monospace}
      .totwrap{display:flex;justify-content:flex-end;margin-top:14px}
      .tot{width:300px} .tot .row{display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px}
      .tot .grand{border-top:2px solid #1c1f26;margin-top:6px;padding-top:8px;font-size:16px;font-weight:800}
      .sign{display:flex;gap:34px;margin-top:52px}
      .sign div{flex:1;border-top:1.5px dotted #9aa3b2;padding-top:6px;font-size:11px;color:#69707c;text-align:center}
      .foot{margin-top:30px;font-size:10.5px;color:#98a1b0;display:flex;justify-content:space-between}
      @media print{.page{padding:24px 30px}}
    </style></head><body>
    ${orders.map((o) => `<div class="sheet">${orderPage(o, rate, settings)}</div>`).join('')}
    </body></html>`);
  w.document.close();
  w.focus();
  // Let the layout settle before the dialog freezes the page.
  setTimeout(() => w.print(), 250);
}

export default function PurchasesComparePage() {
  const { settings } = useSettings();
  const [rate, setRate] = useState('');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  // Which supplier(s) an order sheet is being raised for.
  const [pick, setPick] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [newModel, setNewModel] = useState('');
  const [newPart, setNewPart] = useState('');

  const rateNum = num(rate);

  const addModel = () => {
    const model = newModel.trim();
    if (!model) return;
    setRows((rs) => [...rs, blankRow('model', model)]);
    setNewModel('');
  };
  const addPart = () => {
    setRows((rs) => [...rs, blankRow('part', newPart.trim())]);
    setNewPart('');
  };

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setSide = (id: number, side: Side, patch: Partial<Quote>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [side]: { ...r[side], ...patch } } : r)));
  const delRow = (id: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [blankRow()]));

  const reset = () => {
    setRate(''); setNameA(''); setNameB(''); setNewModel(''); setNewPart('');
    setPick({ a: false, b: false });
    setRows([blankRow()]);
  };

  // Line cost = price each × qty, where a model's price goes through the rate
  // first and a part is already in rupees. Held per side so the totals and the
  // gap between them all read off the same numbers.
  const calc = useMemo(() => {
    const line = (s: Quote, kind: Row['kind']) => {
      const lkr = kind === 'part' ? num(s.price) : num(s.price) * rateNum;
      return { lkr, qty: num(s.qty), cost: lkr * num(s.qty) };
    };
    const per = rows.map((r) => {
      const a = line(r.a, r.kind);
      const b = line(r.b, r.kind);
      // Only a row where both sides are actually quoted can be compared.
      const both = a.cost > 0 && b.cost > 0;
      return { row: r, a, b, both, diff: a.cost - b.cost, qtyMismatch: both && a.qty !== b.qty };
    });
    const totalA = per.reduce((s, p) => s + p.a.cost, 0);
    const totalB = per.reduce((s, p) => s + p.b.cost, 0);
    // Only handsets are counted as units — a reel of cable is not a phone.
    const models = per.filter((p) => p.row.kind === 'model');
    const qtyA = models.reduce((s, p) => s + p.a.qty, 0);
    const qtyB = models.reduce((s, p) => s + p.b.qty, 0);
    return {
      per,
      models,
      parts: per.filter((p) => p.row.kind === 'part'),
      totalA, totalB, qtyA, qtyB,
      diff: totalA - totalB,
      ready: totalA > 0 && totalB > 0,
    };
  }, [rows, rateNum]);

  const aWins = calc.ready && calc.diff < 0;
  const bWins = calc.ready && calc.diff > 0;
  const tied = calc.ready && calc.diff === 0;
  const labelA = nameA.trim() || 'First supplier';
  const labelB = nameB.trim() || 'Second supplier';

  // Winning side gets a green wash, the dearer one red, so the answer is legible
  // without reading the numbers.
  const sideTint = (win: boolean, lose: boolean) =>
    win ? 'var(--green-soft)' : lose ? 'var(--red-soft)' : 'transparent';

  /** Pull one side's quote out of the table as an order sheet. */
  const orderFor = (side: Side, supplier: string): Order => {
    const models = calc.models
      .filter((p) => p[side].cost > 0)
      .map((p) => ({
        name: p.row.model,
        yuan: num(p.row[side].price),
        qty: p[side].qty,
        lkr: p[side].lkr,
        cost: p[side].cost,
      }));
    const parts = calc.parts
      .filter((p) => p[side].cost > 0)
      .map((p) => ({ name: p.row.model, each: p[side].lkr, qty: p[side].qty, cost: p[side].cost }));

    const partsTotal = parts.reduce((s, p) => s + p.cost, 0);
    return {
      supplier,
      models,
      parts,
      yuanTotal: models.reduce((s, m) => s + m.yuan * m.qty, 0),
      partsTotal,
      total: models.reduce((s, m) => s + m.cost, 0) + partsTotal,
    };
  };

  const picked = [
    pick.a ? orderFor('a', labelA) : null,
    pick.b ? orderFor('b', labelB) : null,
  ].filter((o): o is Order => o !== null);

  const canPrint = picked.length > 0 && picked.every((o) => o.total > 0);

  const printPicked = () => {
    if (!canPrint) {
      toast(picked.length === 0 ? 'Tick the supplier you want the order for.' : 'That supplier has no priced lines yet.', 'err');
      return;
    }
    printOrders(picked, rateNum, settings);
  };

  const renderRow = ({ row: r, a, b, both, diff, qtyMismatch }: (typeof calc)['per'][number]) => (
    <tr key={r.id} className="border-t border-border">
      <td className="p-1.5">
        <Input value={r.model} onChange={(e) => setRow(r.id, { model: e.target.value })}
          placeholder={r.kind === 'part' ? 'Part / charge' : 'Phone model'} style={{ height: 36 }} />
      </td>

      <SideCells side="a" row={r} calc={a} tint={sideTint(aWins, bWins)} onChange={setSide} />

      <td className="p-1.5 text-center">
        {both ? (
          <span className="text-[12px] font-bold mono"
            style={{ color: diff === 0 ? 'var(--text-faint)' : diff < 0 ? 'var(--green)' : 'var(--red)' }}>
            {diff === 0 ? 'same' : `${diff < 0 ? '−' : '+'}${fmt(Math.abs(diff))}`}
          </span>
        ) : <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>—</span>}
        {qtyMismatch && (
          <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--amber)' }}>
            qty {fmt0(a.qty)} vs {fmt0(b.qty)}
          </div>
        )}
      </td>

      <SideCells side="b" row={r} calc={b} tint={sideTint(bWins, aWins)} onChange={setSide} />

      <td className="p-1.5 text-right">
        <button type="button" aria-label={`Remove ${r.model || 'row'}`} onClick={() => delRow(r.id)}
          className="grid place-items-center w-7 h-7 rounded-md hover:bg-surface-2"><X size={15} /></button>
      </td>
    </tr>
  );

  return (
    <>
      <PageHead
        title="Purchases Compare"
        sub="Price the same list of models against two suppliers and see which lot lands cheaper."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" icon={<Printer size={15} />} disabled={!canPrint} onClick={printPicked}>
              {picked.length === 1 ? `Order for ${picked[0].supplier}` : 'Supplier order (PDF)'}
            </Button>
            <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={reset}>Clear</Button>
          </div>
        }
      />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-4">
        <label className="min-w-[170px]">
          <span className="block field-label mb-1.5">Yuan rate (LKR per ¥)</span>
          <MoneyInput className="text-right mono" value={rate} onChange={setRate} placeholder="0.00" />
        </label>
        <div className="flex-1 min-w-[170px]">
          <label className="flex items-center gap-2 mb-1.5 cursor-pointer w-fit" title="Tick to include this supplier in the order sheet">
            <input type="checkbox" checked={pick.a} onChange={(e) => setPick((p) => ({ ...p, a: e.target.checked }))} />
            <span className="field-label">First supplier</span>
          </label>
          <Input value={nameA} onChange={(e) => setNameA(e.target.value)} placeholder="First supplier" />
        </div>
        <div className="flex-1 min-w-[170px]">
          <label className="flex items-center gap-2 mb-1.5 cursor-pointer w-fit" title="Tick to include this supplier in the order sheet">
            <input type="checkbox" checked={pick.b} onChange={(e) => setPick((p) => ({ ...p, b: e.target.checked }))} />
            <span className="field-label">Second supplier</span>
          </label>
          <Input value={nameB} onChange={(e) => setNameB(e.target.value)} placeholder="Second supplier" />
        </div>
        {/* Parts are already in rupees, so the rate only matters once a model is quoted. */}
        {rateNum <= 0 && rows.some((r) => r.kind === 'model' && (num(r.a.price) > 0 || num(r.b.price) > 0)) && (
          <div className="text-[12.5px] w-full" style={{ color: 'var(--amber)' }}>
            Enter the yuan rate to convert the quotes.
          </div>
        )}
      </div>

      <div className="card p-2.5 mb-4 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th className="p-2" style={{ width: '18%' }}></th>
              <th className="text-center text-[11.5px] uppercase tracking-wider font-bold p-2" colSpan={4}
                style={{ color: 'var(--text-muted)', background: sideTint(aWins, bWins), borderRadius: '8px 8px 0 0' }}>
                {labelA}
              </th>
              <th className="text-center text-[11px] uppercase tracking-wider font-bold p-2" style={{ color: 'var(--text-faint)', width: 130 }}>
                Difference
              </th>
              <th className="text-center text-[11.5px] uppercase tracking-wider font-bold p-2" colSpan={4}
                style={{ color: 'var(--text-muted)', background: sideTint(bWins, aWins), borderRadius: '8px 8px 0 0' }}>
                {labelB}
              </th>
              <th style={{ width: 36 }}></th>
            </tr>
            <tr>
              <th className="text-left text-[11px] uppercase font-bold p-2" style={{ color: 'var(--text-faint)' }}>Model</th>
              <Header tint={sideTint(aWins, bWins)} />
              <th></th>
              <Header tint={sideTint(bWins, aWins)} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calc.models.map(renderRow)}
            {calc.parts.length > 0 && (
              <tr>
                <td colSpan={11} className="px-2 pt-3.5 pb-1 text-[11px] uppercase tracking-wider font-bold"
                  style={{ color: 'var(--text-faint)' }}>
                  Extra parts
                  <span className="normal-case font-medium tracking-normal"> · priced in rupees, no yuan conversion</span>
                </td>
              </tr>
            )}
            {calc.parts.map(renderRow)}
          </tbody>

          <tfoot>
            <tr className="border-t-2" style={{ borderColor: 'var(--border)' }}>
              <td className="p-2 text-[12.5px] font-bold" style={{ color: 'var(--text-muted)' }}>Lot total</td>
              <TotalCells qty={calc.qtyA} total={calc.totalA} tint={sideTint(aWins, bWins)} />
              <td className="p-2 text-center">
                {calc.ready && (
                  <span className="text-[12.5px] font-extrabold mono"
                    style={{ color: calc.diff === 0 ? 'var(--text-faint)' : calc.diff < 0 ? 'var(--green)' : 'var(--red)' }}>
                    {calc.diff === 0 ? 'same' : `${calc.diff < 0 ? '−' : '+'}${fmt(Math.abs(calc.diff))}`}
                  </span>
                )}
              </td>
              <TotalCells qty={calc.qtyB} total={calc.totalB} tint={sideTint(bWins, aWins)} />
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div className="flex flex-wrap items-center gap-2 p-2 pt-3">
          <Input
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addModel(); } }}
            placeholder="New model name…"
            style={{ height: 34, maxWidth: 220 }}
          />
          <Button variant="subtle" size="sm" icon={<Plus size={14} />} disabled={!newModel.trim()} onClick={addModel}>
            Add model
          </Button>

          <span className="mx-1" style={{ width: 1, height: 22, background: 'var(--border)' }} />

          <Input
            value={newPart}
            onChange={(e) => setNewPart(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPart(); } }}
            placeholder="Freight, cases, cables…"
            style={{ height: 34, maxWidth: 220 }}
          />
          <Button variant="subtle" size="sm" icon={<Plus size={14} />} onClick={addPart}
            title="An extra billed straight in rupees — it skips the yuan rate but still counts in the lot total">
            Add part
          </Button>
        </div>
      </div>

      {calc.ready ? (
        <div className="card p-4 flex items-center gap-3.5"
          style={{ background: tied ? 'var(--surface-2)' : 'var(--green-soft)' }}>
          <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0"
            style={{ background: 'var(--surface)', color: tied ? 'var(--text-muted)' : 'var(--green)' }}>
            {tied ? <Equal size={19} /> : <TrendingDown size={19} />}
          </span>
          <div>
            {tied ? (
              <>
                <div className="font-extrabold text-[15px]">Both lots cost the same</div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  Rs {fmt(calc.totalA)} either way — decide on terms or delivery instead.
                </div>
              </>
            ) : (
              <>
                <div className="font-extrabold text-[15px]">
                  Buy from {aWins ? labelA : labelB} — cheaper by Rs {fmt(Math.abs(calc.diff))}
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  Rs {fmt(Math.min(calc.totalA, calc.totalB))} against Rs {fmt(Math.max(calc.totalA, calc.totalB))}
                  {calc.qtyA !== calc.qtyB && ' — note the two lots are not the same size'}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-4 flex items-center gap-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          <Scale size={17} />
          Enter the rate and both suppliers&apos; quotes to see which lot is cheaper.
        </div>
      )}
    </>
  );
}

/** The four column headings one supplier owns. */
function Header({ tint }: { tint: string }) {
  const th = 'text-right text-[11px] uppercase font-bold p-2';
  const style = { color: 'var(--text-faint)', background: tint };
  return (
    <>
      <th className={th} style={{ ...style, width: 100 }}>¥ each</th>
      <th className={th} style={{ ...style, width: 110 }}>LKR each</th>
      <th className={th} style={{ ...style, width: 70 }}>Qty</th>
      <th className={th} style={{ ...style, width: 120 }}>Cost</th>
    </>
  );
}

/**
 * One supplier's four cells on a row.
 *
 * A model is quoted in yuan and its rupee price is worked out; a part is quoted
 * in rupees directly, so the same two columns swap which one takes the input.
 */
function SideCells({
  side, row, calc, tint, onChange,
}: {
  side: Side;
  row: Row;
  calc: { lkr: number; qty: number; cost: number };
  tint: string;
  onChange: (id: number, side: Side, patch: Partial<Quote>) => void;
}) {
  const cell = { background: tint };
  const isPart = row.kind === 'part';
  const priceInput = (
    <MoneyInput className="text-right mono" value={row[side].price}
      onChange={(v) => onChange(row.id, side, { price: v })} placeholder="0.00" style={{ height: 36 }} />
  );

  return (
    <>
      <td className="p-1.5 text-right" style={cell}>
        {isPart
          ? <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>—</span>
          : priceInput}
      </td>
      <td className={`p-1.5 text-right${isPart ? '' : ' money'}`} style={{ ...cell, color: isPart ? undefined : 'var(--text-muted)' }}>
        {isPart ? priceInput : (calc.lkr > 0 ? fmt(calc.lkr) : '—')}
      </td>
      <td className="p-1.5" style={cell}>
        <Input className="mono text-right" inputMode="numeric" value={row[side].qty}
          onChange={(e) => onChange(row.id, side, { qty: e.target.value.replace(/\D/g, '') })}
          placeholder="0" style={{ height: 36 }} />
      </td>
      <td className="p-1.5 text-right money font-semibold" style={cell}>
        {calc.cost > 0 ? fmt(calc.cost) : '—'}
      </td>
    </>
  );
}

/** A supplier's qty + cost totals in the footer. */
function TotalCells({ qty, total, tint }: { qty: number; total: number; tint: string }) {
  return (
    <>
      <td style={{ background: tint }}></td>
      <td style={{ background: tint }}></td>
      <td className="p-2 text-right mono text-[12.5px] font-bold" style={{ background: tint, color: 'var(--text-muted)' }}>
        {qty > 0 ? fmt0(qty) : ''}
      </td>
      <td className="p-2 text-right money font-extrabold text-[13.5px]" style={{ background: tint }}>
        {total > 0 ? fmt(total) : '—'}
      </td>
    </>
  );
}
