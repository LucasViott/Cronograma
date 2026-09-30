export interface TaskItem {
  id: string;
  ownerId: string;
  title: string;
  start: string;
  end: string;
  cat: string;
  carteira: string;
  prio: 'alta' | 'media' | 'baixa';
  notes: string;
  done: boolean;
  updatedAt?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  role: 'member' | 'leader';
  color: string;
  cargo: string;
  email: string;
  carteiras: string[];
  photo: string;
  passwordHash: string;
  lastActivityAt: string;
  updatedAt?: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  action: 'created' | 'updated';
  taskTitle: string;
  taskDate: string;
  byUserId: string;
  at: string;
  seen: boolean;
}

export interface AppData {
  users: Record<string, UserProfile>;
  daily: Record<string, TaskItem[]>;
  deletedUserIds: string[];
  deletedTaskIds: Record<string, number>;
  notifications: NotificationItem[];
  carteiras: string[];
  updatedAt?: any;
}

export interface UIState {
  tab: 'daily' | 'weekly' | 'month' | 'dashboard' | 'team';
  date: string;
  calMonth: { year: number; month: number };
  currentUserId: string | null;
  viewUserId: string | null;
  teamFilter: 'all' | 'pending' | 'done' | 'late';
  teamUserFilter: string;
  teamCategoriaFilter: string;
  carteiraFilter: string;
  categoriaFilter: string;
  teamPage: number;
  teamPageSize: number;
}
