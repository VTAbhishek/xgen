import { useMemo, useState } from 'react';
import { Plus, X, Smartphone, Tag } from 'lucide-react';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { code39SvgString } from '@/lib/barcode';
import { openLabelPdf } from '@/lib/labelPdf';
import { unitCaption } from '@/lib/phoneUnit';
import type { PhoneUnit } from '@/types';

const STORAGES = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'];

/**
 * Per-handset entry for serialised items.
 *
 * A phone is not interchangeable with the next one in the box — it has its own
 * IMEI, and the shop is asked for that IMEI at warranty and return time. So the
 * line quantity is not typed: each handset is added here, and the count of rows
 * *is* the quantity received.
 */
export function PhoneUnitsPanel({
  itemName, units, onChange,
}: { itemName: string; units: PhoneUnit[]; onChange: (units: PhoneUnit[]) => void }) {
  const [colour, setColour] = useState('');
  const [storage, setStorage] = useState('128GB');
  const [battery, setBattery] = useState('');
  const [imei, setImei] = useState('');

  const taken = useMemo(() => new Set(units.map((u) => u.imei)), [units]);
  const clean = imei.trim();
  const dup = clean !== '' && taken.has(clean);
  const canAdd = clean.length >= 6 && !dup;

  const add = () => {
    if (!canAdd) {
      if (dup) toast(`IMEI ${clean} is already on this line.`, 'err');
      else toast('Enter an IMEI of at least 6 digits.', 'err');
      return;
    }
    onChange([...units, {
      imei: clean,
      colour: colour.trim() || null,
      storage: storage || null,
      battery: battery === '' ? null : Number(battery),
    }]);
    // Colour, storage and battery usually repeat down a box of the same model,
    // so only the IMEI is cleared and focus can stay on the scanner.
    setImei('');
  };

  const remove = (i: number) => onChange(units.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-2.5" style={{ color: 'var(--text-muted)' }}>
        <Smartphone size={15} />
        Phone details — add one per unit
        <span className="font-medium" style={{ color: 'var(--text-faint)' }}>
          ({units.length} added{units.length > 0 ? ` · qty ${units.length}` : ''})
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[110px]">
          <span className="block text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>Colour</span>
          <Input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="blue" style={{ height: 36 }} />
        </label>
        <label className="min-w-[110px]">
          <span className="block text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>Storage</span>
          <Select value={storage} onChange={(e) => setStorage(e.target.value)} style={{ height: 36 }}>
            {STORAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </label>
        <label className="min-w-[90px]">
          <span className="block text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>Battery %</span>
          <Input
            className="mono text-right" inputMode="numeric" value={battery} placeholder="100"
            onChange={(e) => {
              const n = e.target.value.replace(/\D/g, '').slice(0, 3);
              setBattery(n === '' ? '' : String(Math.min(100, Number(n))));
            }}
            style={{ height: 36 }}
          />
        </label>
        <label className="flex-[2] min-w-[190px]">
          <span className="block text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>IMEI number</span>
          <Input
            className="mono" inputMode="numeric" value={imei} placeholder="15-digit IMEI"
            onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 20))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            style={{ height: 36, ...(dup ? { borderColor: 'var(--red)' } : {}) }}
          />
        </label>
        <Button variant="primary" icon={<Plus size={15} />} disabled={!canAdd} onClick={add} style={{ height: 36 }}>Add</Button>
      </div>

      {dup && <div className="text-[12px] mt-1.5" style={{ color: 'var(--red)' }}>IMEI {clean} is already on this line.</div>}

      {units.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {units.map((u, i) => (
            <div key={u.imei} className="flex items-center gap-3 rounded-md px-2.5 py-2"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="grid place-items-center w-5 h-5 rounded-full text-[10.5px] font-bold badge-red shrink-0">{i + 1}</span>
              <span className="mono text-[13px] font-bold">{u.imei}</span>
              <span className="text-[12px] truncate" style={{ color: 'var(--text-faint)' }}>
                {[u.colour, u.storage, u.battery == null ? null : `${u.battery}%`].filter(Boolean).join(' · ')}
              </span>
              <Button
                variant="subtle" size="sm" icon={<Tag size={13} />} className="ml-auto shrink-0"
                title="Print a barcode sticker for this handset"
                onClick={() => openLabelPdf({ code: u.imei, caption: unitCaption(itemName, u) })}
              >Sticker</Button>
              <span
                className="shrink-0"
                style={{ lineHeight: 0 }}
                // Preview of what the sticker will carry, so a mis-keyed IMEI is
                // visible before a roll of labels is printed.
                dangerouslySetInnerHTML={{ __html: code39SvgString(u.imei, 34, { module: 1.1, pad: 4 }) }}
              />
              <button type="button" aria-label={`Remove ${u.imei}`} onClick={() => remove(i)}
                className="grid place-items-center w-6 h-6 rounded-md hover:bg-surface-2 shrink-0"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
