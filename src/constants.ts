import { UserProfile } from './types';

export const STORAGE_KEY = 'cronoplano.v28';
export const THEME_KEY = 'cronoplano.theme';
export const FRIDAY_REMINDER_KEY = 'cronoplano.fridayReminder';
export const ALL_MEMBERS = '__all__';
export const PHOTO_SIZE = 120;
export const HORA_OPERACIONAL_MIN = 120;

export const USER_COLORS = [
  '#2563eb', '#737373', '#1e40af', '#525252',
  '#1d4ed8', '#404040', '#1e3a8a', '#666666'
];

export const DEFAULT_CARTEIRAS = [
  'GM', 'GM Jud', 'GM Fleet', 'Creditas', 'FIAP', 'BMW', 'Honda',
  'Stellantis Locadora', 'Stellantis Financiamento', 'Finamax', 'C6 Bank',
  'Quinto Andar', 'Banco Pan', 'Recovery', 'ADM', 'Ativos SA',
  'Ativos Imobiliário', 'Safra'
];

export const PREDEFINED_USERS: Omit<UserProfile, 'passwordHash' | 'lastActivityAt' | 'photo'>[] = [
  { id: 'lucas-viotti', name: 'Lucas Viotti', role: 'member', color: '#2563eb', cargo: '', email: '', carteiras: [] },
  { id: 'illichs-soto', name: 'Illichs Soto', role: 'leader', color: '#1e40af', cargo: '', email: '', carteiras: [] },
  { id: 'thaina-santos', name: 'Thainá Santos', role: 'member', color: '#60a5fa', cargo: '', email: '', carteiras: [] },
  { id: 'karla-isabela', name: 'Karla Isabela', role: 'member', color: '#3730a3', cargo: '', email: '', carteiras: [] },
  { id: 'fabiane-cardoso', name: 'Fabiane Cardoso', role: 'member', color: '#1d4ed8', cargo: '', email: '', carteiras: [] },
  { id: 'dennis-paiva', name: 'Dennis Paiva', role: 'member', color: '#3b82f6', cargo: '', email: '', carteiras: [] },
  { id: 'maria-gaik', name: 'Maria Gaik', role: 'member', color: '#1e3a8a', cargo: '', email: '', carteiras: [] },
  { id: 'joao-miguel', name: 'João Miguel', role: 'member', color: '#737373', cargo: '', email: '', carteiras: [] }
];

export const CATEGORIES: Record<string, { label: string; color: string }> = {
  'capacitacao-inicial': { label: 'Capacitação Inicial', color: '#10b981' },
  'aperfeicoamento': { label: 'Aperfeiçoamento', color: '#8b5cf6' },
  'acompanhamento': { label: 'Acompanhamento', color: '#ec4899' },
  'hora-operacional': { label: 'Hora Operacional', color: '#f97316' },
  'criacao-conteudo': { label: 'Criação de Conteúdo', color: '#06b6d4' },
  'reuniao': { label: 'Reunião', color: '#f59e0b' },
  'tempo-administrativo': { label: 'Tempo Administrativo', color: '#a855f7' },
  'campanha-acao': { label: 'Campanha/Ação', color: '#84cc16' }
};

export const LEGACY_CAT_MAP: Record<string, string> = {
  'formacao-inicial': 'capacitacao-inicial',
  'formacao-continuada': 'aperfeicoamento',
  'acompanhamento-operacional': 'acompanhamento',
  'hora-operacional': 'hora-operacional',
  'criacao-conteudo': 'criacao-conteudo'
};

export const PRIO: Record<string, { label: string }> = {
  alta: { label: 'Alta' },
  media: { label: 'Média' },
  baixa: { label: 'Baixa' }
};

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const _holidaysCache: Record<number, Record<string, string>> = {};

export function getBrazilianHolidays(year: number): Record<string, string> {
  if (_holidaysCache[year]) return _holidaysCache[year];
  const h: Record<string, string> = {};
  const pad = (n: number) => String(n).padStart(2, '0');
  const set = (m: number, d: number, name: string) => { h[`${year}-${pad(m)}-${pad(d)}`] = name; };
  set(1, 1, 'Confraternização Universal');
  set(4, 21, 'Tiradentes');
  set(5, 1, 'Dia do Trabalho');
  set(9, 7, 'Independência do Brasil');
  set(10, 12, 'Nossa Senhora Aparecida');
  set(11, 2, 'Finados');
  set(11, 15, 'Proclamação da República');
  set(11, 20, 'Consciência Negra');
  set(12, 25, 'Natal');

  const easter = easterSunday(year);
  const shift = (n: number) => { const dt = new Date(easter); dt.setDate(easter.getDate() + n); return dt; };
  const setDateObj = (dt: Date, name: string) => {
    const k = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    h[k] = name;
  };
  setDateObj(shift(-48), 'Carnaval (Segunda)');
  setDateObj(shift(-47), 'Carnaval (Terça)');
  setDateObj(shift(-46), 'Quarta-feira de Cinzas');
  setDateObj(shift(-2), 'Sexta-feira Santa');
  setDateObj(shift(60), 'Corpus Christi');
  _holidaysCache[year] = h;
  return h;
}

export function holidayNameOf(iso: string): string {
  if (!iso || iso.length < 4) return '';
  const y = Number(iso.slice(0, 4));
  if (isNaN(y)) return '';
  return getBrazilianHolidays(y)[iso] || '';
}
