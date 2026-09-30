import { UserProfile, TaskItem } from './types';
import { CATEGORIES } from './constants';

export const $ = (s: string, r: Document | HTMLElement = document) => r.querySelector(s) as HTMLElement;
export const $$ = (s: string, r: Document | HTMLElement = document) => Array.from(r.querySelectorAll(s)) as HTMLElement[];

export function uid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export function initialOf(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

export function firstNameOf(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function normalizeName(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
}

export function hashPassword(pwd: string): string {
  const s = 'cronoplano:' + String(pwd || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function isoOf(dt: Date): string {
  return dt.toLocaleDateString('sv-SE');
}

export function fmtDateFull(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function fmtDateLong(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export function fmtDateTimeShort(isoTs: string): string {
  if (!isoTs) return '';
  const dt = new Date(isoTs);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

export function timeToMin(t: string): number | null {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function durationMin(item: { start?: string; end?: string }): number {
  const a = timeToMin(item.start || '');
  const b = timeToMin(item.end || '');
  if (a === null || b === null) return 0;
  let d = b - a;
  if (d < 0) d += 1440;
  return d;
}

export function fmtDuration(min: number): string {
  if (!min) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function fmtDurationShort(min: number): string {
  if (!min) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export function catOf(key: string) {
  return CATEGORIES[key] || { label: 'Sem categoria', color: '#7a7a7a' };
}

export function taskStatus(task: TaskItem, dateIso: string): 'done' | 'late' | 'pending' {
  if (task.done) return 'done';
  if (dateIso < todayISO()) return 'late';
  return 'pending';
}

export function avatarHTML(user: UserProfile | null | undefined, cls = ''): string {
  const u = user || ({} as any);
  const color = u.color || '#666';
  if (u.photo) {
    return `<span class="avatar ${cls}" style="background-color:${color};background-image:url('${u.photo}');background-size:cover;background-position:center;"></span>`;
  }
  return `<span class="avatar ${cls}" style="background:${color}">${initialOf(u.name)}</span>`;
}

export function applyAvatar(el: HTMLElement | null, user: UserProfile | null | undefined) {
  if (!el) return;
  const u = user || ({} as any);
  const color = u.color || '#666';
  if (u.photo) {
    el.textContent = '';
    el.style.background = '';
    el.style.backgroundColor = color;
    el.style.backgroundImage = `url('${u.photo}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  } else {
    el.textContent = initialOf(u.name);
    el.style.background = color;
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundPosition = '';
  }
}

export function resizeImageFile(file: File, maxSize = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao processar canvas'));
          return;
        }
        ctx.fillStyle = '#151515';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export function mondayOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + offset);
  return dt;
}

export function showDialog(opts: {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  icon?: string;
  iconVariant?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise(resolve => {
    const backdrop = $('#appDialog');
    const titleEl = $('#appDialogTitle');
    const msgEl = $('#appDialogMessage');
    const iconEl = $('#appDialogIcon');
    const okBtn = $('#appDialogOk');
    const cancelBtn = $('#appDialogCancel');
    const closeBtn = $('#appDialogClose');

    titleEl.textContent = opts.title || 'Aviso';
    msgEl.innerHTML = opts.message || '';
    okBtn.textContent = opts.confirmText || 'OK';
    cancelBtn.textContent = opts.cancelText || 'Cancelar';
    cancelBtn.hidden = !opts.showCancel;

    if (opts.icon) {
      iconEl.hidden = false;
      iconEl.textContent = opts.icon;
      iconEl.className = 'dialog-icon ' + (opts.iconVariant || '');
    } else {
      iconEl.hidden = true;
    }

    okBtn.className = 'btn ' + (opts.danger ? 'primary danger-btn' : 'primary');
    backdrop.hidden = false;

    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      backdrop.hidden = true;
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e: MouseEvent) => { if (e.target === backdrop) { cleanup(); resolve(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { cleanup(); resolve(false); } };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    setTimeout(() => okBtn.focus(), 60);
  });
}

export function showAlert(message: string, title?: string, opts?: { icon?: string; iconVariant?: string; danger?: boolean; confirmText?: string }) {
  return showDialog({
    title: title || 'Aviso',
    message,
    confirmText: opts?.confirmText || 'OK',
    showCancel: false,
    icon: opts?.icon || 'ℹ️',
    iconVariant: opts?.iconVariant || '',
    danger: !!opts?.danger
  });
}

export function showConfirm(message: string, title?: string, opts?: { icon?: string; iconVariant?: string; danger?: boolean; confirmText?: string; cancelText?: string }) {
  return showDialog({
    title: title || 'Confirmação',
    message,
    confirmText: opts?.confirmText || 'Confirmar',
    cancelText: opts?.cancelText || 'Cancelar',
    showCancel: true,
    icon: opts?.icon || '❓',
    iconVariant: opts?.iconVariant || '',
    danger: !!opts?.danger
  });
}
