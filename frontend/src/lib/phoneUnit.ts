import type { PhoneUnit } from '@/types';

/**
 * The two ways a handset is described in the UI.
 *
 * Kept out of the component files so React fast refresh stays happy — a module
 * that exports both components and helpers loses its refresh boundary.
 */

/**
 * Sticker caption: model, storage, colour, battery health.
 *
 * Battery health is what a second-hand handset is priced on, so it belongs on
 * the label the customer sees next to the phone — not only in the entry screen.
 */
export function unitCaption(itemName: string, u: PhoneUnit): string {
  const battery = u.battery === null || u.battery === undefined || u.battery === '' ? null : `Batt ${u.battery}%`;
  return [itemName, u.storage, u.colour, battery].filter(Boolean).join(' · ');
}

/** Inline spec beside an IMEI: colour, storage, battery health. */
export function unitSpec(u: PhoneUnit): string {
  return [u.colour, u.storage, u.battery == null ? null : `${u.battery}%`].filter(Boolean).join(' · ');
}
