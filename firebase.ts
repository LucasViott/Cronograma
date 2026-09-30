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
  databaseURL: "https://cronoplano-default-rtdb.firebaseio.com",
  projectId: "cronoplano",
  storageBucket: "cronoplano.firebasestorage.app",
  messagingSenderId: "162271814959",
  appId: "1:162271814959:web:d2505e4f6c3aabdbb0adda",
  measurementId: "G-5SQEVC9LEV"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const dataDocRef = doc(db, 'cronoplano', 'data');

let snapshotUnsub: Unsubscribe | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestRemoteSnapshot: AppData | null = null;
let isSaving = false;
let pendingSaveQueued = false;

export type SyncStatus = 'ok' | 'syncing' | 'offline' | 'error';
let currentSyncStatus: SyncStatus = 'offline';
let syncStatusListener: ((status: SyncStatus) => void) | null = null;

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

  return {
    users: mergedUsers,
    daily: mergedDaily,
    deletedUserIds: Array.from(deletedUsers),
    deletedTaskIds: deletedTasks,
    notifications,
    carteiras
  };
}

export function subscribeToRemoteChanges(
  onData: (remoteMerged: AppData) => void,
  getLocalData: () => AppData
) {
  if (snapshotUnsub) snapshotUnsub();

  snapshotUnsub = onSnapshot(
    dataDocRef,
    (snap) => {
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
    (err) => {
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

export async function fetchInitialRemote(local: AppData): Promise<AppData> {
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
      // First time initialization in firestore
      await setDoc(dataDocRef, { ...local, updatedAt: serverTimestamp() }, { merge: true });
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

    // 3. Save merged state
    await setDoc(dataDocRef, {
      ...merged,
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
