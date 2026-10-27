import type {
  AppUser,
  AuthUser,
  ChecklistReport,
  EquipmentItem,
  StockItem,
  SurgeryType,
} from '../data/mockData';

const URL_BASE_DA_API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export const apiEstaConfigurada = Boolean(import.meta.env.VITE_API_BASE_URL);
let tokenDeAcesso: string | undefined;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fazerRequisicao<T>(caminho: string, configuracao: RequestInit = {}): Promise<T> {
  const cabecalhos = new Headers(configuracao.headers);
  if (configuracao.body && !cabecalhos.has('Content-Type')) {
    cabecalhos.set('Content-Type', 'application/json');
  }
  if (tokenDeAcesso) cabecalhos.set('Authorization', `Bearer ${tokenDeAcesso}`);

  const resposta = await fetch(`${URL_BASE_DA_API}${caminho}`, {
    ...configuracao,
    headers: cabecalhos,
    credentials: 'include',
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(corpo?.message || `Falha na requisição (${resposta.status}).`, resposta.status);
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

function serializarParaJson(valor: unknown): string {
  return JSON.stringify(valor);
}

export type LoginCredentials = { email: string; password: string };
export type LoginResponse = { user: AuthUser; accessToken?: string };
export type DashboardSummary = {
  totalSurgeries: number;
  readyKits: number;
  criticalStockItems: number;
  lowStockItems: number;
  stockItemCount: number;
  surgeryTrend?: { text: string; positive: boolean };
  schedule: Array<{
    id: string;
    surgeryId: string;
    time: string;
    surgery: string;
    room: string;
    surgeon: string;
    status: 'em-andamento' | 'aguardando' | 'concluida';
  }>;
};
export type UserInput = Pick<AppUser, 'name' | 'email' | 'role' | 'shift'>;
export type StockInput = Pick<StockItem, 'name' | 'available' | 'minimum' | 'unit' | 'category'>;
export type ProfileInput = Pick<AuthUser, 'name' | 'phone'>;
export type NotificationPreferences = {
  stockAlert: boolean;
  surgeryReminder: boolean;
  voiceChecklist: boolean;
  weeklyReport: boolean;
};
export type PasswordChange = { currentPassword: string; newPassword: string };

export const clienteApi = {
  auth: {
    async login(credenciais: LoginCredentials) {
      const respostaDoLogin = await fazerRequisicao<LoginResponse>('/auth/login', { method: 'POST', body: serializarParaJson(credenciais) });
      tokenDeAcesso = respostaDoLogin.accessToken;
      return respostaDoLogin.user;
    },
    async logout() {
      try {
        await fazerRequisicao<void>('/auth/logout', { method: 'POST' });
      } finally {
        tokenDeAcesso = undefined;
      }
    },
    async currentUser() {
      return fazerRequisicao<AuthUser>('/auth/me');
    },
  },
  dashboard: {
    getSummary: () => fazerRequisicao<DashboardSummary>('/dashboard'),
  },
  surgeries: {
    list: () => fazerRequisicao<SurgeryType[]>('/surgeries'),
    getKit: (idCirurgia: string) => fazerRequisicao<EquipmentItem[]>(`/surgeries/${encodeURIComponent(idCirurgia)}/kit`),
  },
  stock: {
    list: () => fazerRequisicao<StockItem[]>('/stock'),
    create: (itemEstoque: StockInput) => fazerRequisicao<StockItem>('/stock', { method: 'POST', body: serializarParaJson(itemEstoque) }),
    update: (idItem: string, itemEstoque: StockInput) => fazerRequisicao<StockItem>(`/stock/${encodeURIComponent(idItem)}`, { method: 'PUT', body: serializarParaJson(itemEstoque) }),
    remove: (idItem: string) => fazerRequisicao<void>(`/stock/${encodeURIComponent(idItem)}`, { method: 'DELETE' }),
    adjust: (idItem: string, variacao: number) => fazerRequisicao<StockItem>(`/stock/${encodeURIComponent(idItem)}/adjustments`, { method: 'POST', body: serializarParaJson({ delta: variacao }) }),
  },
  reports: {
    list: () => fazerRequisicao<ChecklistReport[]>('/reports'),
    create: (relatorio: Omit<ChecklistReport, 'id'>) => fazerRequisicao<ChecklistReport>('/reports', { method: 'POST', body: serializarParaJson(relatorio) }),
  },
  users: {
    list: () => fazerRequisicao<AppUser[]>('/users'),
    create: (usuario: UserInput) => fazerRequisicao<AppUser>('/users', { method: 'POST', body: serializarParaJson(usuario) }),
    update: (idUsuario: string, usuario: UserInput) => fazerRequisicao<AppUser>(`/users/${encodeURIComponent(idUsuario)}`, { method: 'PUT', body: serializarParaJson(usuario) }),
    setStatus: (idUsuario: string, novoStatus: AppUser['status']) => fazerRequisicao<AppUser>(`/users/${encodeURIComponent(idUsuario)}/status`, { method: 'PATCH', body: serializarParaJson({ status: novoStatus }) }),
  },
  profile: {
    get: () => fazerRequisicao<AuthUser>('/profile'),
    update: (perfil: ProfileInput) => fazerRequisicao<AuthUser>('/profile', { method: 'PATCH', body: serializarParaJson(perfil) }),
    getNotifications: () => fazerRequisicao<NotificationPreferences>('/profile/notifications'),
    updateNotifications: (preferencias: NotificationPreferences) => fazerRequisicao<NotificationPreferences>('/profile/notifications', { method: 'PUT', body: serializarParaJson(preferencias) }),
    changePassword: (senhas: PasswordChange) => fazerRequisicao<void>('/profile/password', { method: 'PUT', body: serializarParaJson(senhas) }),
  },
};