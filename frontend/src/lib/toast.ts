import type Swal2 from 'sweetalert2';

type SwalT = typeof Swal2;

// SweetAlert (~21 kB gzip) is only needed for toasts / confirms, which are all
// user-triggered — so it's loaded on demand instead of on first paint.
let swalPromise: Promise<SwalT> | null = null;
let toastMixin: ReturnType<SwalT['mixin']> | null = null;
const getSwal = (): Promise<SwalT> => (swalPromise ??= import('sweetalert2').then((m) => m.default));

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export async function toast(msg: string, kind: 'ok' | 'err' = 'ok'): Promise<void> {
  const Swal = await getSwal();
  // Corner toast used for every create / update / delete / error feedback.
  toastMixin ??= Swal.mixin({
    toast: true,
    position: 'bottom-end',
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    didOpen: (el) => {
      el.addEventListener('mouseenter', Swal.stopTimer);
      el.addEventListener('mouseleave', Swal.resumeTimer);
    },
  });
  void toastMixin.fire({ icon: kind === 'ok' ? 'success' : 'error', title: msg });
}

// Centered SweetAlert modal used for blocking errors (e.g. failed sign in).
export async function alertError(title: string, text?: string): Promise<void> {
  const Swal = await getSwal();
  await Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'OK',
    confirmButtonColor: cssVar('--accent', '#C8102E'),
  });
}

/**
 * SweetAlert question for a choice that is not a delete — "this lot is short,
 * split the line?" and the like. Separate from `confirmDelete` so the wording
 * and the red "Yes, delete" button stay where they belong.
 */
export async function confirmAction(opts: {
  title: string; html?: string; confirmText?: string; cancelText?: string;
  icon?: 'warning' | 'question' | 'info';
}): Promise<boolean> {
  const Swal = await getSwal();
  const r = await Swal.fire({
    title: opts.title,
    html: opts.html,
    icon: opts.icon ?? 'warning',
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'OK',
    cancelButtonText: opts.cancelText ?? 'Cancel',
    confirmButtonColor: cssVar('--accent', '#C8102E'),
    cancelButtonColor: '#9aa1ab',
    reverseButtons: true,
  });
  return r.isConfirmed;
}

// SweetAlert confirmation used for destructive actions (delete).
export async function confirmDelete(opts: { title?: string; html?: string; confirmText?: string } = {}): Promise<boolean> {
  const Swal = await getSwal();
  const r = await Swal.fire({
    title: opts.title ?? 'Are you sure?',
    html: opts.html,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: cssVar('--accent', '#C8102E'),
    cancelButtonColor: '#9aa1ab',
    reverseButtons: true,
    focusCancel: true,
  });
  return r.isConfirmed;
}
