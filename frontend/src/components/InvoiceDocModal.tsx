import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { http } from '@/lib/http';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { invoiceDocHtml } from '@/lib/invoiceDoc';
import { useSettings } from '@/store/settings';
import type { Invoice } from '@/types';

// A4 at 96dpi — the width the bill is laid out for.
const A4_PX = 794;

/**
 * Shows the finished bill exactly as it will print, and prints it.
 *
 * It renders into an iframe rather than a popup window: a popup opened after
 * the save request has already resolved is no longer tied to a user gesture, so
 * the browser blocks it and the operator sees nothing at all.
 */
export function InvoiceDocModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const settings = useSettings((s) => s.settings);
  const [data, setData] = useState<Invoice>(inv);
  const [height, setHeight] = useState(1123); // A4 height at 96dpi
  const [scale, setScale] = useState(1);

  // Re-fetch so the bill always has its lines, handsets and customer, whether it
  // was opened straight off a save response or from a list row.
  useEffect(() => {
    void http.get(`/api/invoices/${inv.id}`).then((r) => setData(r.data.data as Invoice)).catch(() => {});
  }, [inv.id]);

  const html = useMemo(() => invoiceDocHtml(data, settings), [data, settings]);

  // The sheet is a fixed 794px wide; shrink it to whatever the modal can give
  // it rather than letting the preview scroll sideways.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / A4_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Size the frame to the sheet itself. Measured again on the next frame because
  // a height read the instant the document loads can be taken before the layout
  // has settled, which is what leaves blank paper under the footer.
  const fitHeight = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    setHeight(Math.ceil(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)));
  };

  const onFrameLoad = () => {
    fitHeight();
    requestAnimationFrame(fitHeight);
  };

  // Printing the frame keeps the document's own @page size, so the job goes out
  // on A4 instead of being scaled onto whatever the page default is. The frame's
  // title is what the browser offers as the file name when it is saved as PDF.
  const print = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };

  return (
    <Modal
      title={`Invoice ${data.no}`}
      onClose={onClose}
      xl
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" icon={<Printer size={15} />} onClick={print}>Print / PDF</Button>
      </>}
    >
      <div ref={box} style={{ height: Math.ceil(height * scale) }}>
        <iframe
          ref={frame}
          title={`Invoice ${data.no}`}
          srcDoc={html}
          onLoad={onFrameLoad}
          scrolling="no"
          style={{
            width: A4_PX,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: '#fff',
            display: 'block',
          }}
        />
      </div>
    </Modal>
  );
}
