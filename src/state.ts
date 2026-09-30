import { AppData, UIState, UserProfile, TaskItem, NotificationItem } from './types';
import { STORAGE_KEY, ALL_MEMBERS, PREDEFINED_USERS, DEFAULT_CARTEIRAS, LEGACY_CAT_MAP, CATEGORIES } from './constants';
import { todayISO, uid } from './utils';
import { queueDebouncedSave, saveToFirestoreSafe } from './firebase';

export const data: AppData = {
  users: {},
  daily: {},
  deletedUserIds: [],
  deletedTaskIds: {},
  notifications: [],
  carteiras: [...DEFAULT_CARTEIRAS]
};

export const ui: UIState = {
  tab: 'daily',
  date: todayISO(),
  calMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
  currentUserId: null,
  viewUserId: null,
  teamFilter: 'all',
  teamUserFilter: '',
  teamCategoriaFilter: '',
  carteiraFilter: '',
  categoriaFilter: '',
  teamPage: 1,
  teamPageSize: 10
};

export let hasUnsavedChanges = false;
let onSaveStateChangeCb: ((unsaved: boolean) => void) | null = null;
let renderAppCb: (() => void) | null = null;

export function setRenderCallback(cb: () => void) {
  renderAppCb = cb;
}

export function setOnSaveStateChange(cb: (unsaved: boolean) => void) {
  onSaveStateChangeCb = cb;
}

export function markUnsaved(isUnsaved = true) {
  hasUnsavedChanges = isUnsaved;
  if (onSaveStateChangeCb) onSaveStateChangeCb(isUnsaved);
}

export function usersList(): UserProfile[] {
  return Object.values(data.users);
}

export function currentUser(): UserProfile | null {
  return ui.currentUserId ? data.users[ui.currentUserId] || null : null;
}

export function viewedUser(): UserProfile | null {
  if (ui.viewUserId === ALL_MEMBERS) return null;
  return ui.viewUserId ? data.users[ui.viewUserId] || null : null;
}

export function isLeader(): boolean {
  const u = currentUser();
  return u?.role === 'leader';
}

export function viewingAll(): boolean {
  return ui.viewUserId === ALL_MEMBERS;
}

export function userById(id: string): UserProfile {
  return data.users[id] || {
    id,
    name: '(removido)',
    color: '#666',
    role: 'member',
    carteiras: [],
    cargo: '',
    email: '',
    photo: '',
    passwordHash: '',
    lastActivityAt: ''
  };
}

export function carteirasOf(user?: UserProfile | null): string[] {
  if (!user || !Array.isArray(user.carteiras)) return [];
  return user.carteiras;
}

export function getAllCarteiras(): string[] {
  ensureCarteirasInitialized();
  return data.carteiras.slice().sort((a, b) => a.localeCompare(b));
}

export function ensureCarteirasInitialized() {
  if (!Array.isArray(data.carteiras) || !data.carteiras.length) {
    const set = new Set(DEFAULT_CARTEIRAS);
    Object.values(data.users || {}).forEach(u => {
      if (Array.isArray(u.carteiras)) u.carteiras.forEach(c => { if (c) set.add(c); });
    });
    Object.values(data.daily || {}).forEach(arr => arr.forEach(t => { if (t.carteira) set.add(t.carteira); }));
    data.carteiras = Array.from(set).sort();
  }
}

export function tasksOfDate(dateIso: string, ownerId?: string | null, carteiraFilter?: string, categoriaFilter?: string): TaskItem[] {
  let arr = data.daily[dateIso] || [];
  if (ownerId && ownerId !== ALL_MEMBERS) {
    arr = arr.filter(t => t.ownerId === ownerId);
  }
  const cf = carteiraFilter !== undefined ? carteiraFilter : ui.carteiraFilter;
  if (cf) arr = arr.filter(t => t.carteira === cf);
  const catf = categoriaFilter !== undefined ? categoriaFilter : ui.categoriaFilter;
  if (catf) arr = arr.filter(t => t.cat === catf);
  return arr.slice();
}

export function canEditCurrentView(): boolean {
  if (!currentUser()) return false;
  if (isLeader()) return true;
  return ui.viewUserId === ui.currentUserId;
}

export function touchUser(userId?: string) {
  if (!userId) return;
  const u = data.users[userId];
  if (u) {
    u.lastActivityAt = new Date().toISOString();
    u.updatedAt = Date.now();
  }
}

export function pushNotification(recipientId: string, action: 'created' | 'updated', task: { title: string; date: string }) {
  if (!recipientId || recipientId === ui.currentUserId) return;
  if (!data.notifications) data.notifications = [];
  data.notifications.push({
    id: uid(),
    userId: recipientId,
    action,
    taskTitle: task.title,
    taskDate: task.date,
    byUserId: ui.currentUserId || '',
    at: new Date().toISOString(),
    seen: false
  });
}

export function seedPredefinedUsers() {
  const deleted = new Set(data.deletedUserIds || []);
  PREDEFINED_USERS.forEach(p => {
    if (deleted.has(p.id)) {
      if (data.users[p.id]) delete data.users[p.id];
      return;
    }
    if (!data.users[p.id]) {
      data.users[p.id] = {
        ...p,
        passwordHash: '',
        carteiras: [],
        cargo: '',
        email: '',
        photo: '',
        lastActivityAt: '',
        updatedAt: Date.now()
      };
    } else {
      // Keep existing properties; only ensure required fields exist
      const u = data.users[p.id];
      if (!Array.isArray(u.carteiras)) u.carteiras = [];
      if (typeof u.passwordHash !== 'string') u.passwordHash = '';
      if (typeof u.email !== 'string') u.email = '';
      if (typeof u.cargo !== 'string') u.cargo = '';
      if (typeof u.photo !== 'string') u.photo = '';
      if (typeof u.lastActivityAt !== 'string') u.lastActivityAt = '';
    }
  });
}

export function migrateLegacyData() {
  Object.values(data.daily).forEach(arr => {
    arr.forEach(t => {
      if (t.cat && LEGACY_CAT_MAP[t.cat]) t.cat = LEGACY_CAT_MAP[t.cat];
      if (t.cat && !CATEGORIES[t.cat]) t.cat = 'capacitacao-inicial';
      if (typeof t.carteira !== 'string') t.carteira = '';
      if (!t.updatedAt) t.updatedAt = Date.now();
    });
  });
  ensureCarteirasInitialized();
}

export function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      users: data.users,
      daily: data.daily,
      deletedUserIds: data.deletedUserIds,
      deletedTaskIds: data.deletedTaskIds,
      notifications: data.notifications,
      carteiras: data.carteiras,
      ui: {
        tab: ui.tab,
        date: ui.date,
        calMonth: ui.calMonth,
        currentUserId: ui.currentUserId,
        viewUserId: ui.viewUserId,
        teamFilter: ui.teamFilter,
        teamUserFilter: ui.teamUserFilter,
        teamCategoriaFilter: ui.teamCategoriaFilter,
        carteiraFilter: ui.carteiraFilter,
        categoriaFilter: ui.categoriaFilter,
        teamPage: ui.teamPage,
        teamPageSize: ui.teamPageSize
      }
    }));
  } catch (err) {
    console.warn('Falha ao salvar localStorage:', err);
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.users) data.users = parsed.users;
      if (parsed.daily) data.daily = parsed.daily;
      if (parsed.deletedUserIds) data.deletedUserIds = parsed.deletedUserIds;
      if (parsed.deletedTaskIds) data.deletedTaskIds = parsed.deletedTaskIds;
      if (parsed.notifications) data.notifications = parsed.notifications;
      if (parsed.carteiras) data.carteiras = parsed.carteiras;
      if (parsed.ui) {
        ui.tab = parsed.ui.tab || ui.tab;
        ui.date = parsed.ui.date || ui.date;
        if (parsed.ui.calMonth) ui.calMonth = parsed.ui.calMonth;
        ui.currentUserId = parsed.ui.currentUserId || null;
        ui.viewUserId = parsed.ui.viewUserId || null;
        ui.teamFilter = parsed.ui.teamFilter || 'all';
        ui.teamUserFilter = parsed.ui.teamUserFilter || '';
        ui.teamCategoriaFilter = parsed.ui.teamCategoriaFilter || '';
        ui.carteiraFilter = parsed.ui.carteiraFilter || '';
        ui.categoriaFilter = parsed.ui.categoriaFilter || '';
        ui.teamPage = parsed.ui.teamPage || 1;
        ui.teamPageSize = parsed.ui.teamPageSize || 10;
      }
    }
  } catch (err) {
    console.warn('Falha ao ler localStorage:', err);
  }
}

export function applyMergedRemote(merged: AppData) {
  data.users = merged.users;
  data.daily = merged.daily;
  data.deletedUserIds = merged.deletedUserIds;
  data.deletedTaskIds = merged.deletedTaskIds;
  data.notifications = merged.notifications;
  data.carteiras = merged.carteiras;
  saveLocal();

  if (ui.currentUserId && !data.users[ui.currentUserId]) {
    ui.currentUserId = null;
    ui.viewUserId = null;
  }
  if (renderAppCb) renderAppCb();
}

export function saveState(andSync = true) {
  saveLocal();
  if (andSync) {
    markUnsaved(true);
    queueDebouncedSave(() => data, (merged) => {
      applyMergedRemote(merged);
      markUnsaved(false);
    });
  }
}

export async function forceSaveNow(): Promise<boolean> {
  const success = await saveToFirestoreSafe(data, (merged) => {
    applyMergedRemote(merged);
    markUnsaved(false);
  });
  if (success) {
    markUnsaved(false);
    saveLocal();
  }
  return success;
}
