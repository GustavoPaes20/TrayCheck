export type View =
  | 'dashboard'
  | 'surgeries'
  | 'voice-checklist'
  | 'stock'
  | 'reports'
  | 'profile'
  | 'admin-dashboard'
  | 'admin-stock'
  | 'admin-kits'
  | 'admin-users';

export type UserRole = 'admin' | 'nurse' | 'technician';

export type ReportItemStatus = 'confirmed' | 'missing' | 'pending';

export type ReportItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  critical: boolean;
  status: ReportItemStatus;
  confirmedAt?: string;
};

export type ChecklistReport = {
  id: string;
  surgeryId: string;
  surgeryName: string;
  specialty: string;
  operator: string;
  operatorRole: UserRole;
  date: string;
  time: string;
  duration: string;
  confirmed: number;
  missing: number;
  total: number;
  status: 'ok' | 'divergencia';
  items: ReportItem[];
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  shift: string;
  initials: string;
  hospital: string;
  phone: string;
  crm?: string;
  joinedAt: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  shift: string;
  status: 'active' | 'inactive';
  lastActive: string;
  initials: string;
};

export type SurgeryType = {
  id: string;
  name: string;
  specialty: string;
  duration: string;
  color: string;
  bgColor: string;
  scheduledToday: number;
  room: string;
  time: string;
};

export type EquipmentItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: 'EPI' | 'Instrumental' | 'Descartável' | 'Anestesia' | 'Implante';
  critical: boolean;
};

export type StockItem = {
  id: string;
  name: string;
  available: number;
  minimum: number;
  unit: string;
  category: string;
  status: 'ok' | 'low' | 'critical';
  lastUpdated: string;
  updatedBy: string;
};

export const CONTAS_DEMONSTRACAO: { email: string; password: string; role: UserRole; label: string }[] = [
  { email: 'ana.silva@hospitalcentral.br', password: 'senha123', role: 'nurse', label: 'Enf. Instrumentadora' },
  { email: 'rafael.lima@hospitalcentral.br', password: 'circ123', role: 'technician', label: 'Circulante' },
  { email: 'admin@hospitalcentral.br', password: 'admin123', role: 'admin', label: 'Administrador' },
];

export const USUARIOS_DEMONSTRACAO: Record<string, AuthUser> = {
  'ana.silva@hospitalcentral.br': {
    id: 'u1',
    name: 'Ana Silva',
    email: 'ana.silva@hospitalcentral.br',
    role: 'nurse',
    shift: 'Turno A (07:00–19:00)',
    initials: 'AS',
    hospital: 'Hospital Central',
    phone: '(11) 99874-3210',
    crm: 'COREN-SP 123456',
    joinedAt: 'Março 2024',
  },
  'rafael.lima@hospitalcentral.br': {
    id: 'u4',
    name: 'Rafael Lima',
    email: 'rafael.lima@hospitalcentral.br',
    role: 'technician',
    shift: 'Turno A (07:00–19:00)',
    initials: 'RL',
    hospital: 'Hospital Central',
    phone: '(11) 98765-4321',
    joinedAt: 'Junho 2025',
  },
  'admin@hospitalcentral.br': {
    id: 'u2',
    name: 'Carlos Mendes',
    email: 'admin@hospitalcentral.br',
    role: 'admin',
    shift: 'Administrativo',
    initials: 'CM',
    hospital: 'Hospital Central',
    phone: '(11) 97654-8800',
    joinedAt: 'Janeiro 2023',
  },
};

export const usuariosAplicacao: AppUser[] = [
  { id: 'u1', name: 'Ana Silva', email: 'ana.silva@hospitalcentral.br', role: 'nurse', shift: 'Turno A', status: 'active', lastActive: '01/09/2026', initials: 'AS' },
  { id: 'u2', name: 'Carlos Mendes', email: 'admin@hospitalcentral.br', role: 'admin', shift: 'Administrativo', status: 'active', lastActive: '01/09/2026', initials: 'CM' },
  { id: 'u3', name: 'Fernanda Costa', email: 'fernanda.costa@hospitalcentral.br', role: 'nurse', shift: 'Turno B', status: 'active', lastActive: '31/08/2026', initials: 'FC' },
  { id: 'u4', name: 'Rafael Lima', email: 'rafael.lima@hospitalcentral.br', role: 'technician', shift: 'Turno A', status: 'active', lastActive: '01/09/2026', initials: 'RL' },
  { id: 'u5', name: 'Juliana Rocha', email: 'juliana.rocha@hospitalcentral.br', role: 'nurse', shift: 'Turno C', status: 'active', lastActive: '30/08/2026', initials: 'JR' },
  { id: 'u6', name: 'Pedro Nunes', email: 'pedro.nunes@hospitalcentral.br', role: 'technician', shift: 'Turno B', status: 'inactive', lastActive: '15/08/2026', initials: 'PN' },
  { id: 'u7', name: 'Mariana Torres', email: 'mariana.torres@hospitalcentral.br', role: 'nurse', shift: 'Turno A', status: 'active', lastActive: '01/09/2026', initials: 'MT' },
];

export const cirurgiasCadastradas: SurgeryType[] = [
  { id: 'joelho', name: 'Artroscopia de Joelho', specialty: 'Ortopedia', duration: '2–3h', color: '#2563EB', bgColor: '#DBEAFE', scheduledToday: 3, room: 'Sala 2', time: '08:00' },
  { id: 'cardio', name: 'Revascularização Cardíaca', specialty: 'Cardiologia', duration: '4–6h', color: '#DC2626', bgColor: '#FEE2E2', scheduledToday: 1, room: 'Sala 1', time: '07:00' },
  { id: 'coluna', name: 'Artrodese de Coluna', specialty: 'Neurocirurgia', duration: '3–5h', color: '#7C3AED', bgColor: '#EDE9FE', scheduledToday: 2, room: 'Sala 3', time: '10:00' },
  { id: 'hernia', name: 'Herniorrafia Laparoscópica', specialty: 'Cirurgia Geral', duration: '1–2h', color: '#059669', bgColor: '#D1FAE5', scheduledToday: 4, room: 'Sala 4', time: '09:30' },
  { id: 'apendicite', name: 'Apendicectomia', specialty: 'Cirurgia Geral', duration: '1h', color: '#D97706', bgColor: '#FEF3C7', scheduledToday: 1, room: 'Sala 2', time: '14:00' },
  { id: 'cesarea', name: 'Cesariana', specialty: 'Obstetrícia', duration: '1–2h', color: '#DB2777', bgColor: '#FCE7F3', scheduledToday: 2, room: 'Sala 5', time: '11:00' },
];

export const kitsPorCirurgia: Record<string, EquipmentItem[]> = {
  joelho: [
    { id: 'luvas-est', name: 'Luvas Estéreis (7.5)', quantity: 4, unit: 'pares', category: 'EPI', critical: true },
    { id: 'bisturi-15', name: 'Bisturi nº 15', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'artroscopio', name: 'Artroscópio 4mm', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'shaver', name: 'Shaver Artroscópico', quantity: 1, unit: 'kit', category: 'Instrumental', critical: true },
    { id: 'torniquete', name: 'Torniquete Pneumático', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'soro-fisio', name: 'Soro Fisiológico 3L', quantity: 3, unit: 'bolsas', category: 'Descartável', critical: false },
    { id: 'campo-est', name: 'Campo Cirúrgico Estéril', quantity: 6, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'cateter', name: 'Cateter de Irrigação', quantity: 2, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'propofol', name: 'Propofol 200mg', quantity: 2, unit: 'amp', category: 'Anestesia', critical: true },
    { id: 'fentanil', name: 'Fentanil 250mcg', quantity: 1, unit: 'amp', category: 'Anestesia', critical: true },
    { id: 'fio-pds', name: 'Fio de Sutura PDS 0', quantity: 4, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'anchor', name: 'Âncora de Sutura Artro', quantity: 2, unit: 'unid', category: 'Implante', critical: true },
  ],
  cardio: [
    { id: 'luvas-c', name: 'Luvas Estéreis (7.5)', quantity: 6, unit: 'pares', category: 'EPI', critical: true },
    { id: 'bisturi-10', name: 'Bisturi nº 10', quantity: 3, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'bypass', name: 'Sistema de Bypass Cardiopulmonar', quantity: 1, unit: 'kit', category: 'Instrumental', critical: true },
    { id: 'desfibrilador', name: 'Desfibrilador Interno', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'prolene', name: 'Fio Prolene 4-0', quantity: 8, unit: 'unid', category: 'Descartável', critical: true },
    { id: 'heparina', name: 'Heparina 5000UI', quantity: 4, unit: 'amp', category: 'Anestesia', critical: true },
    { id: 'campo-c', name: 'Campo Cirúrgico Estéril', quantity: 8, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'dreno', name: 'Dreno de Tórax', quantity: 2, unit: 'unid', category: 'Descartável', critical: true },
  ],
  coluna: [
    { id: 'luvas-col', name: 'Luvas Estéreis (8.0)', quantity: 4, unit: 'pares', category: 'EPI', critical: true },
    { id: 'bisturi-col', name: 'Bisturi nº 15', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'implante-col', name: 'Sistema de Implante Pedicular', quantity: 1, unit: 'kit', category: 'Implante', critical: true },
    { id: 'neuromonit', name: 'Eletrodos de Neuromonitoramento', quantity: 8, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'soro-col', name: 'Soro Fisiológico 1L', quantity: 4, unit: 'bolsas', category: 'Descartável', critical: false },
    { id: 'campo-col', name: 'Campo Cirúrgico Estéril', quantity: 6, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'propofol-col', name: 'Propofol 200mg', quantity: 2, unit: 'amp', category: 'Anestesia', critical: true },
  ],
  hernia: [
    { id: 'luvas-h', name: 'Luvas Estéreis (7.0)', quantity: 3, unit: 'pares', category: 'EPI', critical: true },
    { id: 'bisturi-h', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'tela', name: 'Tela de Polipropileno 10x15', quantity: 1, unit: 'unid', category: 'Implante', critical: true },
    { id: 'grasper', name: 'Grasper Laparoscópico', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'trocar', name: 'Trocarte 10mm', quantity: 3, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'co2', name: 'CO2 Medicinal', quantity: 1, unit: 'cilindro', category: 'Anestesia', critical: true },
    { id: 'campo-h', name: 'Campo Cirúrgico Estéril', quantity: 5, unit: 'unid', category: 'Descartável', critical: false },
  ],
  apendicite: [
    { id: 'luvas-ap', name: 'Luvas Estéreis (7.0)', quantity: 3, unit: 'pares', category: 'EPI', critical: true },
    { id: 'bisturi-ap', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'grasper-ap', name: 'Grasper Laparoscópico', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'endoloop', name: 'Endoloop Cirúrgico', quantity: 2, unit: 'unid', category: 'Descartável', critical: true },
    { id: 'trocar-ap', name: 'Trocarte 10mm', quantity: 2, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'co2-ap', name: 'CO2 Medicinal', quantity: 1, unit: 'cilindro', category: 'Anestesia', critical: true },
  ],
  cesarea: [
    { id: 'luvas-ces', name: 'Luvas Estéreis (7.5)', quantity: 4, unit: 'pares', category: 'EPI', critical: true },
    { id: 'bisturi-ces', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    { id: 'campo-ces', name: 'Campo Cirúrgico Estéril', quantity: 6, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'ocitocina', name: 'Ocitocina 10UI', quantity: 2, unit: 'amp', category: 'Anestesia', critical: true },
    { id: 'raquianest', name: 'Kit Raquianestesia', quantity: 1, unit: 'kit', category: 'Anestesia', critical: true },
    { id: 'fio-vicryl', name: 'Fio Vicryl 0', quantity: 4, unit: 'unid', category: 'Descartável', critical: false },
    { id: 'aspirador', name: 'Aspirador Cirúrgico', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
  ],
};

export const itensDeEstoqueDemonstracao: StockItem[] = [
  { id: 'luvas-75', name: 'Luvas Estéreis 7.5', available: 48, minimum: 20, unit: 'pares', category: 'EPI', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Carlos Mendes' },
  { id: 'luvas-70', name: 'Luvas Estéreis 7.0', available: 12, minimum: 20, unit: 'pares', category: 'EPI', status: 'low', lastUpdated: '01/09/2026', updatedBy: 'Carlos Mendes' },
  { id: 'luvas-80', name: 'Luvas Estéreis 8.0', available: 30, minimum: 15, unit: 'pares', category: 'EPI', status: 'ok', lastUpdated: '31/08/2026', updatedBy: 'Carlos Mendes' },
  { id: 'bisturi-15s', name: 'Bisturi nº 15', available: 35, minimum: 15, unit: 'unid', category: 'Instrumental', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Carlos Mendes' },
  { id: 'bisturi-10s', name: 'Bisturi nº 10', available: 8, minimum: 10, unit: 'unid', category: 'Instrumental', status: 'critical', lastUpdated: '31/08/2026', updatedBy: 'Carlos Mendes' },
  { id: 'bisturi-22s', name: 'Bisturi nº 22', available: 20, minimum: 10, unit: 'unid', category: 'Instrumental', status: 'ok', lastUpdated: '30/08/2026', updatedBy: 'Carlos Mendes' },
  { id: 'campo-cir', name: 'Campo Cirúrgico Estéril', available: 120, minimum: 50, unit: 'unid', category: 'Descartável', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Rafael Lima' },
  { id: 'soro-3l', name: 'Soro Fisiológico 3L', available: 24, minimum: 12, unit: 'bolsas', category: 'Descartável', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Rafael Lima' },
  { id: 'propofol-s', name: 'Propofol 200mg', available: 6, minimum: 10, unit: 'amp', category: 'Anestesia', status: 'critical', lastUpdated: '01/09/2026', updatedBy: 'Carlos Mendes' },
  { id: 'fentanil-s', name: 'Fentanil 250mcg', available: 15, minimum: 8, unit: 'amp', category: 'Anestesia', status: 'ok', lastUpdated: '31/08/2026', updatedBy: 'Rafael Lima' },
  { id: 'tela-pp', name: 'Tela de Polipropileno', available: 3, minimum: 5, unit: 'unid', category: 'Implante', status: 'low', lastUpdated: '29/08/2026', updatedBy: 'Carlos Mendes' },
  { id: 'fio-pds', name: 'Fio PDS 0', available: 28, minimum: 10, unit: 'unid', category: 'Descartável', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Rafael Lima' },
  { id: 'fio-prolene', name: 'Fio Prolene 4-0', available: 20, minimum: 8, unit: 'unid', category: 'Descartável', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Rafael Lima' },
  { id: 'anchor-s', name: 'Ancora de Sutura Artro', available: 4, minimum: 6, unit: 'unid', category: 'Implante', status: 'low', lastUpdated: '30/08/2026', updatedBy: 'Carlos Mendes' },
  { id: 'heparina-s', name: 'Heparina 5000UI', available: 18, minimum: 8, unit: 'amp', category: 'Anestesia', status: 'ok', lastUpdated: '31/08/2026', updatedBy: 'Rafael Lima' },
  { id: 'trocar-s', name: 'Trocarte 10mm', available: 15, minimum: 6, unit: 'unid', category: 'Descartável', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Rafael Lima' },
];

export const coresDasCategorias: Record<string, { fundo: string; texto: string }> = {
  EPI: { fundo: '#DBEAFE', texto: '#1D4ED8' },
  Instrumental: { fundo: '#F3F4F6', texto: '#374151' },
  Descartável: { fundo: '#D1FAE5', texto: '#065F46' },
  Anestesia: { fundo: '#EDE9FE', texto: '#5B21B6' },
  Implante: { fundo: '#FEF3C7', texto: '#92400E' },
};

export const rotulosDosPapeis: Record<UserRole, string> = {
  admin: 'Administrador',
  nurse: 'Enf. Instrumentador(a)',
  technician: 'Circulante',
};

export const historicoDeConferencias: ChecklistReport[] = [
  {
    id: 'r1',
    surgeryId: 'joelho',
    surgeryName: 'Artroscopia de Joelho',
    specialty: 'Ortopedia',
    operator: 'Ana Silva',
    operatorRole: 'nurse',
    date: '01/09/2026',
    time: '07:48',
    duration: '4min 22s',
    confirmed: 12,
    missing: 0,
    total: 12,
    status: 'ok',
    items: [
      { id: 'luvas-est', name: 'Luvas Estéreis (7.5)', quantity: 4, unit: 'pares', category: 'EPI', critical: true, status: 'confirmed', confirmedAt: '07:48:12' },
      { id: 'bisturi-15', name: 'Bisturi nº 15', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '07:48:34' },
      { id: 'artroscopio', name: 'Artroscópio 4mm', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '07:48:58' },
      { id: 'shaver', name: 'Shaver Artroscópico', quantity: 1, unit: 'kit', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '07:49:15' },
      { id: 'torniquete', name: 'Torniquete Pneumático', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '07:49:40' },
      { id: 'soro-fisio', name: 'Soro Fisiológico 3L', quantity: 3, unit: 'bolsas', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '07:50:02' },
      { id: 'campo-est', name: 'Campo Cirúrgico Estéril', quantity: 6, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '07:50:22' },
      { id: 'cateter', name: 'Cateter de Irrigação', quantity: 2, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '07:50:45' },
      { id: 'propofol', name: 'Propofol 200mg', quantity: 2, unit: 'amp', category: 'Anestesia', critical: true, status: 'confirmed', confirmedAt: '07:51:05' },
      { id: 'fentanil', name: 'Fentanil 250mcg', quantity: 1, unit: 'amp', category: 'Anestesia', critical: true, status: 'confirmed', confirmedAt: '07:51:28' },
      { id: 'fio-pds', name: 'Fio de Sutura PDS 0', quantity: 4, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '07:51:50' },
      { id: 'anchor', name: 'Âncora de Sutura Artro', quantity: 2, unit: 'unid', category: 'Implante', critical: true, status: 'confirmed', confirmedAt: '07:52:10' },
    ],
  },
  {
    id: 'r2',
    surgeryId: 'cesarea',
    surgeryName: 'Cesariana',
    specialty: 'Obstetrícia',
    operator: 'Fernanda Costa',
    operatorRole: 'nurse',
    date: '01/09/2026',
    time: '10:15',
    duration: '3min 08s',
    confirmed: 5,
    missing: 2,
    total: 7,
    status: 'divergencia',
    items: [
      { id: 'luvas-ces', name: 'Luvas Estéreis (7.5)', quantity: 4, unit: 'pares', category: 'EPI', critical: true, status: 'confirmed', confirmedAt: '10:15:30' },
      { id: 'bisturi-ces', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '10:15:52' },
      { id: 'campo-ces', name: 'Campo Cirúrgico Estéril', quantity: 6, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '10:16:14' },
      { id: 'ocitocina', name: 'Ocitocina 10UI', quantity: 2, unit: 'amp', category: 'Anestesia', critical: true, status: 'missing', confirmedAt: '10:16:38' },
      { id: 'raquianest', name: 'Kit Raquianestesia', quantity: 1, unit: 'kit', category: 'Anestesia', critical: true, status: 'confirmed', confirmedAt: '10:17:00' },
      { id: 'fio-vicryl', name: 'Fio Vicryl 0', quantity: 4, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '10:17:22' },
      { id: 'aspirador', name: 'Aspirador Cirúrgico', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'missing', confirmedAt: '10:17:48' },
    ],
  },
  {
    id: 'r3',
    surgeryId: 'hernia',
    surgeryName: 'Herniorrafia Laparoscópica',
    specialty: 'Cirurgia Geral',
    operator: 'Rafael Lima',
    operatorRole: 'technician',
    date: '31/08/2026',
    time: '14:30',
    duration: '2min 55s',
    confirmed: 7,
    missing: 0,
    total: 7,
    status: 'ok',
    items: [
      { id: 'luvas-h', name: 'Luvas Estéreis (7.0)', quantity: 3, unit: 'pares', category: 'EPI', critical: true, status: 'confirmed', confirmedAt: '14:30:18' },
      { id: 'bisturi-h', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '14:30:40' },
      { id: 'tela', name: 'Tela de Polipropileno 10x15', quantity: 1, unit: 'unid', category: 'Implante', critical: true, status: 'confirmed', confirmedAt: '14:31:02' },
      { id: 'grasper', name: 'Grasper Laparoscópico', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '14:31:25' },
      { id: 'trocar', name: 'Trocarte 10mm', quantity: 3, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '14:31:48' },
      { id: 'co2', name: 'CO2 Medicinal', quantity: 1, unit: 'cilindro', category: 'Anestesia', critical: true, status: 'confirmed', confirmedAt: '14:32:10' },
      { id: 'campo-h', name: 'Campo Cirúrgico Estéril', quantity: 5, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '14:32:25' },
    ],
  },
  {
    id: 'r4',
    surgeryId: 'cardio',
    surgeryName: 'Revascularização Cardíaca',
    specialty: 'Cardiologia',
    operator: 'Ana Silva',
    operatorRole: 'nurse',
    date: '31/08/2026',
    time: '06:52',
    duration: '5min 40s',
    confirmed: 7,
    missing: 1,
    total: 8,
    status: 'divergencia',
    items: [
      { id: 'luvas-c', name: 'Luvas Estéreis (7.5)', quantity: 6, unit: 'pares', category: 'EPI', critical: true, status: 'confirmed', confirmedAt: '06:52:30' },
      { id: 'bisturi-10', name: 'Bisturi nº 10', quantity: 3, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '06:53:00' },
      { id: 'bypass', name: 'Sistema de Bypass Cardiopulmonar', quantity: 1, unit: 'kit', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '06:53:30' },
      { id: 'desfibrilador', name: 'Desfibrilador Interno', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '06:54:00' },
      { id: 'prolene', name: 'Fio Prolene 4-0', quantity: 8, unit: 'unid', category: 'Descartável', critical: true, status: 'confirmed', confirmedAt: '06:54:30' },
      { id: 'heparina', name: 'Heparina 5000UI', quantity: 4, unit: 'amp', category: 'Anestesia', critical: true, status: 'missing', confirmedAt: '06:55:00' },
      { id: 'campo-c', name: 'Campo Cirúrgico Estéril', quantity: 8, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '06:55:30' },
      { id: 'dreno', name: 'Dreno de Tórax', quantity: 2, unit: 'unid', category: 'Descartável', critical: true, status: 'confirmed', confirmedAt: '06:58:10' },
    ],
  },
  {
    id: 'r5',
    surgeryId: 'apendicite',
    surgeryName: 'Apendicectomia',
    specialty: 'Cirurgia Geral',
    operator: 'Rafael Lima',
    operatorRole: 'technician',
    date: '30/08/2026',
    time: '13:45',
    duration: '2min 10s',
    confirmed: 6,
    missing: 0,
    total: 6,
    status: 'ok',
    items: [
      { id: 'luvas-ap', name: 'Luvas Estéreis (7.0)', quantity: 3, unit: 'pares', category: 'EPI', critical: true, status: 'confirmed', confirmedAt: '13:45:20' },
      { id: 'bisturi-ap', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '13:45:40' },
      { id: 'grasper-ap', name: 'Grasper Laparoscópico', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true, status: 'confirmed', confirmedAt: '13:46:00' },
      { id: 'endoloop', name: 'Endoloop Cirúrgico', quantity: 2, unit: 'unid', category: 'Descartável', critical: true, status: 'confirmed', confirmedAt: '13:46:22' },
      { id: 'trocar-ap', name: 'Trocarte 10mm', quantity: 2, unit: 'unid', category: 'Descartável', critical: false, status: 'confirmed', confirmedAt: '13:46:45' },
      { id: 'co2-ap', name: 'CO2 Medicinal', quantity: 1, unit: 'cilindro', category: 'Anestesia', critical: true, status: 'confirmed', confirmedAt: '13:47:55' },
    ],
  },
];

export const coresDosPapeis: Record<UserRole, { fundo: string; texto: string }> = {
  admin: { fundo: '#DBEAFE', texto: '#1D4ED8' },
  nurse: { fundo: '#D1FAE5', texto: '#065F46' },
  technician: { fundo: '#EDE9FE', texto: '#5B21B6' },
};
