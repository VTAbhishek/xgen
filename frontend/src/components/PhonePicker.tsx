import { useEffect, useRef, useState } from 'react';
import { Search, X, Smartphone, Loader2 } from 'lucide-react';
import { http } from '@/lib/http';
import { fmt } from '@/lib/format';
import { toast } from '@/lib/toast';
import { unitSpec } from '@/lib/phoneUnit';
import type { ID, StockedPhoneUnit } from '@/types';

/**
 * Pick the actual handsets an invoice line is selling, by IMEI.
 *
 * Two ways in, and both have to work at a counter: scanning the sticker, which
 * arrives as the full number followed by Enter, and typing the last few digits
 * off the back of the phone. So Enter commits an exact match immediately, while
 * a partial number just filters the list.
 */
export function PhonePicker({
  itemId, itemName, picked, excludeIds, onChange,
}: {
  itemId: number;
  itemName: string;
  picked: StockedPhoneUnit[];
  /** Handsets already taken by the other lines of this invoice. */
  excludeIds: ID[];
  onChange: (units: StockedPhoneUnit[]) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<StockedPhoneUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const spoken = new Set([...picked.map((u) => Number(u.id)), ...excludeIds.map(Number)]);
  const available = results.filter((u) => !spoken.has(Number(u.id)));

  // Debounced so a scanner firing a whole IMEI does not spray a request per key.
  // `live` drops a reply that lands after the query moved on, which would
  // otherwise leave the list showing results for an IMEI no longer typed.
  useEffect(() => {
    if (!itemId) return;
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      void http.get('/api/phone-units/available', { params: { item_id: itemId, q } })
        .then((r) => { if (live) setResults(r.data.data); })
        .catch(() => { if (live) setResults([]); })
        .finally(() => { if (live) setLoading(false); });
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [itemId, q]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const take = (u: StockedPhoneUnit) => {
    onChange([...picked, u]);
    setQ('');
    setOpen(false);
  };

  // Enter is what a barcode scanner sends once it has typed the whole IMEI.
  const onEnter = () => {
    const exact = available.find((u) => u.imei === q.trim());
    if (exact) { take(exact); return; }
    if (available.length === 1) { take(available[0]); return; }
    if (q.trim() && !loading) {
      const clash = picked.find((u) => u.imei === q.trim());
      toast(clash ? `IMEI ${q.trim()} is already on this bill.` : `No ${itemName} in stock with IMEI ${q.trim()}.`, 'err');
    }
  };

  const drop = (i: number) => onChange(picked.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-lg p-2.5 mt-1.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
        <Smartphone size={14} />
        Handsets on this line
        <span className="font-medium" style={{ color: 'var(--text-faint)' }}>({picked.length} selected · qty {picked.length})</span>
      </div>

      <div className="relative" ref={box}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
        <input
          className="mono w-full"
          value={q}
          onChange={(e) => { setQ(e.target.value.replace(/\D/g, '').slice(0, 20)); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
          placeholder="Scan or type IMEI…"
          inputMode="numeric"
          style={{
            height: 34, width: '100%', paddingLeft: 32, paddingRight: 30, fontSize: 13,
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
          }}
        />
        {loading && <Loader2 size={14} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />}

        {open && (
          <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg overflow-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 12px 34px rgba(15,23,42,.16)', maxHeight: 230 }}>
            {available.length === 0 && (
              <div className="px-3 py-2.5 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                {loading ? 'Searching…' : q ? `No ${itemName} in stock with that IMEI.` : `No ${itemName} left in stock.`}
              </div>
            )}
            {available.map((u) => (
              <button key={u.id} type="button" onClick={() => take(u)}
                className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2.5">
                <span className="mono text-[13px] font-bold">{u.imei}</span>
                <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{unitSpec(u)}</span>
                <span className="ml-auto text-[11.5px] mono" style={{ color: 'var(--text-faint)' }}>cost {fmt(Number(u.cost ?? 0))}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {picked.map((u, i) => (
            <div key={u.id} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="grid place-items-center w-5 h-5 rounded-full text-[10.5px] font-bold badge-red shrink-0">{i + 1}</span>
              <span className="mono text-[12.5px] font-bold">{u.imei}</span>
              <span className="text-[11.5px] truncate" style={{ color: 'var(--text-faint)' }}>{unitSpec(u)}</span>
              <button type="button" aria-label={`Remove ${u.imei}`} onClick={() => drop(i)}
                className="ml-auto grid place-items-center w-6 h-6 rounded-md hover:bg-surface-2 shrink-0"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
