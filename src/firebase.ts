import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { AppData, TaskItem, UserProfile } from './types';
import { DEFAULT_CARTEIRAS } from './constants';

const firebaseConfig = {
  apiKey: "AIzaSyDx3FgH2_rSTyQ561q4bjE8TZUJ_FGhJl8",
  authDomain: "cronoplano.firebaseapp.com",
  projectId: "cronoplano",
  storageBucket: "cronoplano.firebasestorage.app",
  messagingSenderId: "162271814959",
  appId: "1:162271814959:web:eaea9db17a2c216fb0adda",
  measurementId: "G-34H054MQEH"
};

export type SyncStatus = 'ok' | 'syncing' | 'offline' | 'error';
let currentSyncStatus: SyncStatus = 'offline';
let syncStatusListener: ((status: SyncStatus) => void) | null = null;

let app: any = null;
let db: any = null;
let dataDocRef: any = null;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  db = getFirestore(app);
  dataDocRef = doc(db, 'cronoplano', 'data');
} catch (e) {
  console.warn('[Firebase] Falha na inicialização do Firebase SDK:', e);
}

/**
 * Recursively removes all `undefined` values from an object or array.
 * Firestore strictly forbids `undefined` in documents and throws an unhandled error if present.
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item)).filter(item => item !== undefined) as any;
  }
  if (typeof obj === 'object') {
    // If it's a Firestore Sentinel (e.g. serverTimestamp), preserve it intact
    if (obj.constructor && obj.constructor.name !== 'Object') {
      return obj;
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned;
  }
  return obj;
}

export function onSyncStatusChange(cb: (status: SyncStatus) => void) {
  syncStatusListener = cb;
  cb(currentSyncStatus);
}

function updateSyncStatus(status: SyncStatus) {
  currentSyncStatus = status;
  if (syncStatusListener) syncStatusListener(status);
}

export function mergeAppData(local: AppData, remote: Partial<AppData>): AppData {
  if (!remote) return local;

  const deletedUsers = new Set([
    ...(local.deletedUserIds || []),
    ...(remote.deletedUserIds || [])
  ]);

  const deletedTasks: Record<string, number> = {
    ...(remote.deletedTaskIds || {}),
    ...(local.deletedTaskIds || {})
  };

  // Clean old tombstones (> 30 days)
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  for (const tid in deletedTasks) {
    if (deletedTasks[tid] < thirtyDaysAgo) {
      delete deletedTasks[tid];
    }
  }

  // Merge carteiras
  const carteirasSet = new Set<string>([
    ...DEFAULT_CARTEIRAS,
    ...(Array.isArray(local.carteiras) ? local.carteiras : []),
    ...(Array.isArray(remote.carteiras) ? remote.carteiras : [])
  ]);
  const carteiras = Array.from(carteirasSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

  // Merge users
  const mergedUsers: Record<string, UserProfile> = {};
  const allUserIds = new Set([
    ...Object.keys(local.users || {}),
    ...Object.keys(remote.users || {})
  ]);

  for (const uid of allUserIds) {
    if (deletedUsers.has(uid)) continue;
    const lUser = local.users?.[uid];
    const rUser = remote.users?.[uid];

    if (!rUser && lUser) {
      mergedUsers[uid] = { ...lUser };
    } else if (!lUser && rUser) {
      mergedUsers[uid] = { ...rUser };
    } else if (lUser && rUser) {
      // Pick the user profile with the latest modification
      const lTime = lUser.updatedAt || 0;
      const rTime = rUser.updatedAt || 0;
      const base = lTime >= rTime ? lUser : rUser;
      const other = lTime >= rTime ? rUser : lUser;

      mergedUsers[uid] = {
        ...base,
        passwordHash: base.passwordHash || other.passwordHash || '',
        photo: base.photo || other.photo || '',
        cargo: base.cargo || other.cargo || '',
        email: base.email || other.email || '',
        carteiras: Array.from(new Set([...(base.carteiras || []), ...(other.carteiras || [])]))
      };
    }
  }

  // Merge daily tasks by date and task ID
  const mergedDaily: Record<string, TaskItem[]> = {};
  const allDates = new Set([
    ...Object.keys(local.daily || {}),
    ...Object.keys(remote.daily || {})
  ]);

  for (const date of allDates) {
    const lTasks = local.daily?.[date] || [];
    const rTasks = remote.daily?.[date] || [];
    const taskMap = new Map<string, TaskItem>();

    // Add remote tasks that are not deleted
    for (const t of rTasks) {
      if (!t || !t.id || deletedTasks[t.id]) continue;
      taskMap.set(t.id, { ...t });
    }

    // Merge or insert local tasks
    for (const t of lTasks) {
      if (!t || !t.id || deletedTasks[t.id]) continue;
      const existing = taskMap.get(t.id);
      if (!existing) {
        taskMap.set(t.id, { ...t });
      } else {
        const lTime = t.updatedAt || 0;
        const rTime = existing.updatedAt || 0;
        taskMap.set(t.id, lTime >= rTime ? { ...t } : existing);
      }
    }

    if (taskMap.size > 0) {
      mergedDaily[date] = Array.from(taskMap.values());
    }
  }

  // Merge notifications
  const notifMap = new Map<string, any>();
  for (const n of (remote.notifications || [])) {
    if (n && n.id) notifMap.set(n.id, n);
  }
  for (const n of (local.notifications || [])) {
    if (n && n.id) notifMap.set(n.id, n);
  }
  const notifications = Array.from(notifMap.values())
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 50);

  // Merge planned tasks
  const plannedMap = new Map<string, any>();
  for (const pt of (remote.plannedTasks || [])) {
    if (pt && pt.id && !deletedTasks[pt.id]) plannedMap.set(pt.id, pt);
  }
  for (const pt of (local.plannedTasks || [])) {
    if (pt && pt.id && !deletedTasks[pt.id]) {
      const existing = plannedMap.get(pt.id);
      if (!existing || (pt.updatedAt || 0) >= (existing.updatedAt || 0)) {
        plannedMap.set(pt.id, pt);
      }
    }
  }
  const plannedTasks = Array.from(plannedMap.values());

  return {
    users: mergedUsers,
    daily: mergedDaily,
    deletedUserIds: Array.from(deletedUsers),
    deletedTaskIds: deletedTasks,
    notifications,
    carteiras,
    plannedTasks
  };
}

export function subscribeToRemoteChanges(
  onData: (remoteMerged: AppData) => void,
  getLocalData: () => AppData
) {
  if (snapshotUnsub) snapshotUnsub();
  if (!dataDocRef) {
    updateSyncStatus('offline');
    return () => {};
  }

  snapshotUnsub = onSnapshot(
    dataDocRef,
    (snap: any) => {
      if (snap.exists()) {
        const remote = snap.data() as AppData;
        latestRemoteSnapshot = remote;
        const local = getLocalData();
        const merged = mergeAppData(local, remote);
        updateSyncStatus('ok');
        onData(merged);
      } else {
        updateSyncStatus('ok');
      }
    },
    (err: any) => {
      console.warn('[Firestore] snapshot listener:', err);
      updateSyncStatus('error');
    }
  );

  return () => {
    if (snapshotUnsub) {
      snapshotUnsub();
      snapshotUnsub = null;
    }
  };
}

let snapshotUnsub: Unsubscribe | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestRemoteSnapshot: AppData | null = null;
let isSaving = false;
let pendingSaveQueued = false;

export async function fetchInitialRemote(local: AppData): Promise<AppData> {
  if (!dataDocRef) {
    updateSyncStatus('offline');
    return local;
  }
  try {
    updateSyncStatus('syncing');
    const snap = await getDoc(dataDocRef);
    if (snap.exists()) {
      const remote = snap.data() as AppData;
      latestRemoteSnapshot = remote;
      const merged = mergeAppData(local, remote);
      updateSyncStatus('ok');
      return merged;
    } else {
      // First time initialization in firestore with sanitized data
      const sanitized = cleanFirestoreData({ ...local });
      await setDoc(dataDocRef, { ...sanitized, updatedAt: serverTimestamp() }, { merge: true });
      updateSyncStatus('ok');
      return local;
    }
  } catch (err) {
    console.warn('[Firestore] initial fetch:', err);
    updateSyncStatus('offline');
    return local;
  }
}

export async function saveToFirestoreSafe(
  localData: AppData,
  onMergedSuccess?: (merged: AppData) => void
): Promise<boolean> {
  if (!dataDocRef) {
    updateSyncStatus('offline');
    return false;
  }

  if (isSaving) {
    pendingSaveQueued = true;
    return true;
  }

  isSaving = true;
  updateSyncStatus('syncing');

  try {
    // 1. Fetch current remote to guarantee we never overwrite concurrent edits
    let remoteToMerge = latestRemoteSnapshot;
    try {
      const snap = await getDoc(dataDocRef);
      if (snap.exists()) {
        remoteToMerge = snap.data() as AppData;
        latestRemoteSnapshot = remoteToMerge;
      }
    } catch (fetchErr) {
      console.warn('[Firestore] pre-save fetch fallback:', fetchErr);
    }

    // 2. Perform safe merge
    const merged = remoteToMerge ? mergeAppData(localData, remoteToMerge) : localData;

    // 3. Clean any undefined values before writing to Firestore
    const sanitized = cleanFirestoreData({
      ...merged
    });

    // 4. Save merged state
    await setDoc(dataDocRef, {
      ...sanitized,
      updatedAt: serverTimestamp()
    }, { merge: true });

    latestRemoteSnapshot = merged;
    updateSyncStatus('ok');

    if (onMergedSuccess) onMergedSuccess(merged);

    isSaving = false;
    if (pendingSaveQueued) {
      pendingSaveQueued = false;
      setTimeout(() => saveToFirestoreSafe(localData, onMergedSuccess), 300);
    }

    return true;
  } catch (err) {
    console.error('[Firestore] save error:', err);
    updateSyncStatus('error');
    isSaving = false;
    pendingSaveQueued = false;
    return false;
  }
}

export function queueDebouncedSave(
  getLocalData: () => AppData,
  onMergedSuccess?: (merged: AppData) => void,
  delayMs = 1200
) {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  updateSyncStatus('syncing');

  saveDebounceTimer = setTimeout(async () => {
    saveDebounceTimer = null;
    await saveToFirestoreSafe(getLocalData(), onMergedSuccess);
  }, delayMs);
}
