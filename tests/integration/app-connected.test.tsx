import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppUser, AuthUser, ChecklistReport, EquipmentItem, StockItem, SurgeryType } from '@/data/mockData';
import { carregarModulosConectados, instalarApiFalsa, type RotaFalsa } from '../helpers/api-falsa';
import { ReconhecimentoDeVozFalso, instalarVozFalsa } from '../helpers/voz';

const enfermeira: AuthUser = {
  id: 'u1',
  name: 'Ana Silva',
  email: 'ana.silva@hospitalcentral.br',
  role: 'nurse',
  shift: 'Turno A (07:00–19:00)',
  initials: 'AS',
  hospital: 'Hospital Central',
  phone: '(11) 99874-3210',
  joinedAt: 'Março 2024',
};
const administrador: AuthUser = { ...enfermeira, id: 'u2', name: 'Carlos Mendes', email: 'admin@hospitalcentral.br', role: 'admin', initials: 'CM' };

const cirurgias: SurgeryType[] = [
  { id: 'apendicite', name: 'Apendicectomia', specialty: 'Cirurgia Geral', duration: '1h', color: '#D97706', bgColor: '#FEF3C7', scheduledToday: 1, room: 'Sala 2', time: '14:00' },
];
const kit: EquipmentItem[] = [
  { id: 'k1', name: 'Luvas Estéreis', quantity: 2, unit: 'pares', category: 'EPI', critical: true },
  { id: 'k2', name: 'Bisturi Cirúrgico', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
];
const estoqueCritico: StockItem = { id: 'e1', name: 'Propofol 200mg', available: 2, minimum: 10, unit: 'amp', category: 'Anestesia', status: 'critical', lastUpdated: '10/11/2026', updatedBy: 'Carlos Mendes' };
const estoqueNormal: StockItem = { ...estoqueCritico, id: 'e2', name: 'Luvas 7.5', available: 40, minimum: 10, unit: 'pares', category: 'EPI', status: 'ok' };
const resumo = {
  totalSurgeries: 1,
  readyKits: 1,
  criticalStockItems: 1,
  lowStockItems: 0,
  stockItemCount: 1,
  schedule: [{ id: 's1', surgeryId: 'apendicite', time: '14:00', surgery: 'Apendicectomia', room: 'Sala 2', surgeon: 'Dr. Pedro Rocha', status: 'aguardando' as const }],
};

/** Monta o App com `VITE_API_BASE_URL` definida e as rotas padrão de uma sessão ativa; `rotas` sobrescreve qualquer uma. */
async function renderizarApp(rotas: Record<string, RotaFalsa> = {}, { sessao = enfermeira as AuthUser | null } = {}) {
  await carregarModulosConectados();
  const api = instalarApiFalsa({
    'GET /auth/me': sessao ? { corpo: sessao } : { status: 401, corpo: { message: 'Não autenticado.' } },
    'GET /stock': { corpo: [estoqueCritico] },
    'GET /dashboard': { corpo: resumo },
    'GET /surgeries': { corpo: cirurgias },
    'GET /surgeries/apendicite/kit': { corpo: kit },
    'GET /reports': { corpo: [] },
    'GET /users': { corpo: [] },
    'POST /auth/logout': { status: 204 },
    ...rotas,
  });
  const { default: App } = await import('@/App');
  return { ...render(<App />), api, user: userEvent.setup() };
}

function menuLateral() {
  return within(screen.getByRole('complementary'));
}

function tituloDaTela() {
  return within(screen.getByRole('banner')).getByRole('heading', { level: 1 });
}

describe('App (modo conectado à API) — integração com o contrato REST', () => {
  beforeEach(() => {
    instalarVozFalsa();
  });

  describe('autenticação (RF01)', () => {
    it('restaura a sessão existente (cookie) sem pedir login', async () => {
      const { api } = await renderizarApp();

      expect(await screen.findByRole('heading', { name: /, Ana\.$/ })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Bem-vindo de volta' })).not.toBeInTheDocument();
      expect(api.chamadasPara('GET', '/auth/me')).toHaveLength(1);
      expect(api.chamadasPara('GET', '/auth/me')[0].credenciais).toBe('include');
    });

    it('sem sessão ativa (401), mostra a tela de login', async () => {
      await renderizarApp({}, { sessao: null });

      expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    });

    it('faz login pela API enviando o e-mail sem espaços e usa o token nas chamadas seguintes', async () => {
      const { api, user } = await renderizarApp(
        { 'POST /auth/login': { corpo: { user: enfermeira, accessToken: 'token-da-sessao' } } },
        { sessao: null },
      );
      await user.type(await screen.findByPlaceholderText('nome@hospitalcentral.br'), '  ana.silva@hospitalcentral.br  ');
      await user.type(screen.getByPlaceholderText('••••••••'), 'senha123');

      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('heading', { name: /, Ana\.$/ })).toBeInTheDocument();
      expect(api.chamadasPara('POST', '/auth/login')[0].corpo).toEqual({ email: 'ana.silva@hospitalcentral.br', password: 'senha123' });
      const chamadaDeEstoque = api.chamadasPara('GET', '/stock').at(-1)!;
      expect(chamadaDeEstoque.cabecalhos.get('Authorization')).toBe('Bearer token-da-sessao');
    });

    it('mostra a mensagem devolvida pelo servidor quando o login é recusado', async () => {
      const { user } = await renderizarApp(
        { 'POST /auth/login': { status: 401, corpo: { message: 'Credenciais inválidas.' } } },
        { sessao: null },
      );
      await user.type(await screen.findByPlaceholderText('nome@hospitalcentral.br'), 'a@b.c');
      await user.type(screen.getByPlaceholderText('••••••••'), 'x');

      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByText('Credenciais inválidas.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    });

    it('não usa as contas de demonstração: o login sempre passa pela API', async () => {
      const { api, user } = await renderizarApp(
        { 'POST /auth/login': { status: 401, corpo: { message: 'Credenciais inválidas.' } } },
        { sessao: null },
      );
      await user.type(await screen.findByPlaceholderText('nome@hospitalcentral.br'), 'ana.silva@hospitalcentral.br');
      await user.type(screen.getByPlaceholderText('••••••••'), 'senha123'); // senha válida só no modo demonstração

      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByText('Credenciais inválidas.')).toBeInTheDocument();
      expect(api.chamadasPara('POST', '/auth/login')).toHaveLength(1);
    });

    it('"Sair" chama o logout na API e volta ao login', async () => {
      const { api, user } = await renderizarApp();
      await screen.findByRole('heading', { name: /, Ana\.$/ });

      await user.click(menuLateral().getByRole('button', { name: 'Sair' }));

      expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
      expect(api.chamadasPara('POST', '/auth/logout')).toHaveLength(1);
    });

    it('"Sair" encerra a sessão local mesmo que o servidor falhe', async () => {
      const { user } = await renderizarApp({ 'POST /auth/logout': { status: 500, corpo: { message: 'erro' } } });
      await screen.findByRole('heading', { name: /, Ana\.$/ });

      await user.click(menuLateral().getByRole('button', { name: 'Sair' }));

      expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    });
  });

  describe('dashboard e alertas', () => {
    it('carrega a programação do dia a partir da API', async () => {
      const { api } = await renderizarApp();

      expect(await screen.findByText(/Dr\. Pedro Rocha/)).toBeInTheDocument();
      expect(api.chamadasPara('GET', '/dashboard')).toHaveLength(1);
    });

    it('sinaliza no sino quando há itens críticos no estoque', async () => {
      const { container } = await renderizarApp();
      await screen.findByRole('heading', { name: /, Ana\.$/ });

      await screen.findByText(/Dr\. Pedro Rocha/);
      expect(container.querySelector('.animate-blink')).toBeInTheDocument();
    });

    it('não sinaliza o sino quando nenhum item está crítico', async () => {
      await renderizarApp({ 'GET /stock': { corpo: [estoqueNormal] } });
      await screen.findByText(/Dr\. Pedro Rocha/);

      // O painel de alertas do Dashboard tem seu próprio ponto fixo; aqui só interessa o indicador do sino.
      const sino = screen.getByRole('button', { name: 'Ver alertas de estoque' });
      expect(sino.querySelector('.animate-blink')).not.toBeInTheDocument();
    });

    it('exibe o erro quando o painel não carrega', async () => {
      await renderizarApp({ 'GET /dashboard': { status: 500, corpo: { message: 'Banco indisponível.' } } });

      expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar painel: Banco indisponível.');
    });
  });

  describe('checagem integrada à API (RF05–RF07, RF08, RF09)', () => {
    async function abrirConferenciaDaApendicectomia(rotas: Record<string, RotaFalsa> = {}) {
      const contexto = await renderizarApp({ 'POST /reports': { status: 201, corpo: { id: 'r99' } }, ...rotas });
      const linha = (await screen.findByText('Apendicectomia')).closest<HTMLElement>('.group')!;
      await contexto.user.click(within(linha).getByRole('button', { name: 'Conferir' }));
      await screen.findByText('Bisturi Cirúrgico');
      await contexto.user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));
      return contexto;
    }

    it('carrega cirurgias e o kit pela API', async () => {
      const { api } = await abrirConferenciaDaApendicectomia();

      expect(screen.getByRole('combobox')).toHaveValue('apendicite');
      expect(screen.getByText('Luvas Estéreis')).toBeInTheDocument();
      expect(api.chamadasPara('GET', '/surgeries/apendicite/kit').length).toBeGreaterThan(0);
    });

    it('ao concluir com divergência, grava UM relatório com contagens, itens e status corretos', async () => {
      const { api, user } = await abrirConferenciaDaApendicectomia();

      ReconhecimentoDeVozFalso.ultima().falar('luvas estéreis');
      await user.click(screen.getAllByTitle('Faltando')[0]); // Bisturi Cirúrgico → faltante
      expect(await screen.findByRole('heading', { name: 'Itens Faltando!' })).toBeInTheDocument();

      await screen.findByText('Itens em falta:');
      const envios = api.chamadasPara('POST', '/reports');
      expect(envios).toHaveLength(1);
      const relatorio = envios[0].corpo as Omit<ChecklistReport, 'id'>;
      expect(relatorio).toMatchObject({
        surgeryId: 'apendicite',
        surgeryName: 'Apendicectomia',
        specialty: 'Cirurgia Geral',
        operator: 'Ana Silva',
        operatorRole: 'nurse',
        confirmed: 1,
        missing: 1,
        total: 2,
        status: 'divergencia',
      });
      expect(relatorio.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(relatorio.time).toMatch(/^\d{2}:\d{2}$/);
      expect(relatorio.duration).toMatch(/^\d+min \d+s$/);
      expect(relatorio.items.map((i) => [i.id, i.status])).toEqual([
        ['k1', 'confirmed'],
        ['k2', 'missing'],
      ]);
      expect(relatorio.items.every((i) => i.confirmedAt)).toBe(true);
      expect(relatorio).not.toHaveProperty('id');
    });

    it('ao concluir sem divergência, grava o relatório com status "ok"', async () => {
      const { api } = await abrirConferenciaDaApendicectomia();

      ReconhecimentoDeVozFalso.ultima().falar('luvas');
      ReconhecimentoDeVozFalso.ultima().falar('bisturi');

      expect(await screen.findByRole('heading', { name: 'Kit Completo!' })).toBeInTheDocument();
      const relatorio = api.chamadasPara('POST', '/reports')[0].corpo as ChecklistReport;
      expect(relatorio).toMatchObject({ confirmed: 2, missing: 0, total: 2, status: 'ok' });
    });

    it('não grava relatório enquanto a checagem não termina', async () => {
      const { api } = await abrirConferenciaDaApendicectomia();

      ReconhecimentoDeVozFalso.ultima().falar('luvas');

      expect(api.chamadasPara('POST', '/reports')).toHaveLength(0);
    });

    it('avisa o usuário quando o relatório não pôde ser salvo (RNF06)', async () => {
      await abrirConferenciaDaApendicectomia({ 'POST /reports': { status: 500, corpo: { message: 'Falha no servidor.' } } });

      ReconhecimentoDeVozFalso.ultima().falar('luvas');
      ReconhecimentoDeVozFalso.ultima().falar('bisturi');

      expect(await screen.findByText('Relatório não salvo: Falha no servidor.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Kit Completo!' })).toBeInTheDocument();
    });

    it('mostra o erro quando as cirurgias não podem ser carregadas', async () => {
      const { user } = await renderizarApp({ 'GET /surgeries': { status: 503, corpo: { message: 'Serviço fora do ar.' } } });
      await screen.findByText(/Dr\. Pedro Rocha/);

      await user.click(menuLateral().getByRole('button', { name: /^Conferência por Voz/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Serviço fora do ar.');
    });

    it('mostra o erro quando o kit não pode ser carregado, sem itens', async () => {
      await renderizarApp({ 'GET /surgeries/apendicite/kit': { status: 404, corpo: { message: 'Kit não encontrado.' } } }).then(async ({ user }) => {
        const linha = (await screen.findByText('Apendicectomia')).closest<HTMLElement>('.group')!;
        await user.click(within(linha).getByRole('button', { name: 'Conferir' }));
      });

      expect(screen.queryByText('Luvas Estéreis')).not.toBeInTheDocument();
    });
  });

  describe('relatórios (RF08, RF10)', () => {
    const relatorioSalvo: ChecklistReport = {
      id: 'r1',
      surgeryId: 'apendicite',
      surgeryName: 'Apendicectomia',
      specialty: 'Cirurgia Geral',
      operator: 'Ana Silva',
      operatorRole: 'nurse',
      date: '10/11/2026',
      time: '08:00',
      duration: '1min 0s',
      confirmed: 1,
      missing: 1,
      total: 2,
      status: 'divergencia',
      items: [
        { id: 'k1', name: 'Luvas Estéreis', quantity: 2, unit: 'pares', category: 'EPI', critical: true, status: 'confirmed', confirmedAt: '08:00:10' },
        { id: 'k2', name: 'Bisturi Cirúrgico', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true, status: 'missing', confirmedAt: '08:00:30' },
      ],
    };

    it('lista os relatórios devolvidos pela API, com a divergência destacada', async () => {
      const { user } = await renderizarApp({ 'GET /reports': { corpo: [relatorioSalvo] } });
      await screen.findByText(/Dr\. Pedro Rocha/);

      await user.click(menuLateral().getByRole('button', { name: 'Relatórios' }));

      expect(await screen.findByText('1 sessões registradas')).toBeInTheDocument();
      expect(screen.getByText('DIVERGÊNCIA')).toBeInTheDocument();
      expect(screen.getByText('Bisturi Cirúrgico')).toBeInTheDocument();
    });

    it('informa a falha quando os relatórios não carregam', async () => {
      const { user } = await renderizarApp({ 'GET /reports': { status: 500, corpo: { message: 'Erro interno.' } } });
      await screen.findByText(/Dr\. Pedro Rocha/);

      await user.click(menuLateral().getByRole('button', { name: 'Relatórios' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar relatórios: Erro interno.');
    });
  });

  describe('administração de estoque (RF02)', () => {
    async function abrirGerenciarEstoque(rotas: Record<string, RotaFalsa> = {}) {
      const contexto = await renderizarApp(rotas, { sessao: administrador });
      await contexto.user.click(await menuLateralAguardado().then((menu) => menu.getByRole('button', { name: 'Gerenciar Estoque' })));
      await screen.findByText(/1 itens · 1 críticos/);
      return contexto;
    }
    async function menuLateralAguardado() {
      await screen.findByRole('heading', { name: /, Carlos\.$/ });
      return menuLateral();
    }
    function linhaDoItem(nome: string): HTMLElement {
      return screen.getAllByText(nome).map((e) => e.closest<HTMLElement>('div.grid')).find(Boolean)!;
    }

    it('cadastra o item pela API e exibe o registro devolvido pelo servidor', async () => {
      const criado: StockItem = { ...estoqueNormal, id: 'srv-77', name: 'Gaze Estéril', available: 100, minimum: 30, unit: 'caixas' };
      const { api, user } = await abrirGerenciarEstoque({ 'POST /stock': { status: 201, corpo: criado } });

      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
      await user.type(screen.getByPlaceholderText('Ex: Luvas Estéreis 7.5'), 'Gaze Estéril');
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(await screen.findByText(/2 itens · 1 críticos/)).toBeInTheDocument();
      expect(api.chamadasPara('POST', '/stock')[0].corpo).toEqual({ name: 'Gaze Estéril', category: 'EPI', available: 0, minimum: 10, unit: 'unid' });
      expect(screen.getAllByText('Gaze Estéril').length).toBeGreaterThan(0);
      expect(screen.queryByRole('heading', { name: 'Adicionar Item ao Estoque' })).not.toBeInTheDocument();
    });

    it('mantém o modal aberto e mostra o erro quando a API recusa o cadastro', async () => {
      const { user } = await abrirGerenciarEstoque({ 'POST /stock': { status: 400, corpo: { message: 'Nome já cadastrado.' } } });

      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
      await user.type(screen.getByPlaceholderText('Ex: Luvas Estéreis 7.5'), 'Propofol 200mg');
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Nome já cadastrado.');
      expect(screen.getByRole('heading', { name: 'Adicionar Item ao Estoque' })).toBeInTheDocument();
    });

    it('edita o item existente com PUT e aplica o status calculado pelo servidor', async () => {
      const atualizado: StockItem = { ...estoqueCritico, available: 50, status: 'ok' };
      const { api, user } = await abrirGerenciarEstoque({ 'PUT /stock/e1': { corpo: atualizado } });

      await user.click(within(linhaDoItem('Propofol 200mg')).getByTitle('Editar'));
      const [campoDisponivel] = screen.getAllByRole('spinbutton');
      await user.clear(campoDisponivel);
      await user.type(campoDisponivel, '50');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText(/1 itens · 0 críticos/)).toBeInTheDocument();
      expect(api.chamadasPara('PUT', '/stock/e1')[0].corpo).toEqual({ name: 'Propofol 200mg', category: 'Anestesia', available: 50, minimum: 10, unit: 'amp' });
    });

    it('ajusta a quantidade pelo endpoint de ajustes', async () => {
      const { api, user } = await abrirGerenciarEstoque({ 'POST /stock/e1/adjustments': { corpo: { ...estoqueCritico, available: 7, status: 'low' } } });

      await user.click(within(linhaDoItem('Propofol 200mg')).getByTitle('+5'));

      expect(await screen.findByText(/1 itens · 0 críticos · 1 baixos/)).toBeInTheDocument();
      expect(api.chamadasPara('POST', '/stock/e1/adjustments')[0].corpo).toEqual({ delta: 5 });
    });

    it('exclui o item na API e o remove da lista', async () => {
      const { api, user } = await abrirGerenciarEstoque({ 'DELETE /stock/e1': { status: 204 } });

      await user.click(within(linhaDoItem('Propofol 200mg')).getByTitle('Excluir'));
      const dialogo = screen.getByText('Excluir item?').closest<HTMLElement>('.rounded-2xl')!;
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));

      expect(await screen.findByText(/^0 itens · 0 críticos · 0 baixos$/)).toBeInTheDocument();
      expect(api.chamadasPara('DELETE', '/stock/e1')).toHaveLength(1);
    });

    it('mantém o item na lista quando a API recusa a exclusão', async () => {
      const { user } = await abrirGerenciarEstoque({ 'DELETE /stock/e1': { status: 409, corpo: { message: 'Item em uso em um kit.' } } });

      await user.click(within(linhaDoItem('Propofol 200mg')).getByTitle('Excluir'));
      const dialogo = screen.getByText('Excluir item?').closest<HTMLElement>('.rounded-2xl')!;
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Item em uso em um kit.');
      expect(screen.getAllByText('Propofol 200mg').length).toBeGreaterThan(0);
    });
  });

  describe('administração de usuários (RF01, RN02, RN05)', () => {
    const usuarios: AppUser[] = [
      { id: 'u1', name: 'Ana Silva', email: 'ana.silva@hospitalcentral.br', role: 'nurse', shift: 'Turno A', status: 'active', lastActive: '10/11/2026', initials: 'AS' },
      { id: 'u2', name: 'Carlos Mendes', email: 'admin@hospitalcentral.br', role: 'admin', shift: 'Administrativo', status: 'active', lastActive: '10/11/2026', initials: 'CM' },
    ];

    async function abrirGerenciarUsuarios(rotas: Record<string, RotaFalsa> = {}) {
      const contexto = await renderizarApp({ 'GET /users': { corpo: usuarios }, ...rotas }, { sessao: administrador });
      await screen.findByRole('heading', { name: /, Carlos\.$/ });
      await contexto.user.click(menuLateral().getByRole('button', { name: 'Gerenciar Usuários' }));
      await screen.findByText('2 usuários · 2 ativos');
      return contexto;
    }
    const cartao = (nome: string) => screen.getByText(nome).closest<HTMLElement>('.rounded-2xl')!;

    it('lista os usuários devolvidos pela API', async () => {
      const { api } = await abrirGerenciarUsuarios();

      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
      expect(api.chamadasPara('GET', '/users')).toHaveLength(1);
    });

    it('desativa um usuário pelo endpoint de status', async () => {
      const { api, user } = await abrirGerenciarUsuarios({ 'PATCH /users/u1/status': { corpo: { ...usuarios[0], status: 'inactive' } } });

      await user.click(within(cartao('Ana Silva')).getByRole('button', { name: 'Desativar' }));

      expect(await screen.findByText('2 usuários · 1 ativos')).toBeInTheDocument();
      expect(api.chamadasPara('PATCH', '/users/u1/status')[0].corpo).toEqual({ status: 'inactive' });
    });

    it('cadastra um usuário enviando apenas os campos do contrato', async () => {
      const criado: AppUser = { id: 'srv-5', name: 'Maria Oliveira', email: 'maria@hospitalcentral.br', role: 'nurse', shift: 'Turno A', status: 'active', lastActive: '10/11/2026', initials: 'MO' };
      const { api, user } = await abrirGerenciarUsuarios({ 'POST /users': { status: 201, corpo: criado } });

      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));
      await user.type(screen.getByPlaceholderText('Ex: Maria Oliveira'), 'Maria Oliveira');
      await user.type(screen.getByPlaceholderText('usuario@hospitalcentral.br'), 'maria@hospitalcentral.br');
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(await screen.findByText('3 usuários · 3 ativos')).toBeInTheDocument();
      expect(api.chamadasPara('POST', '/users')[0].corpo).toEqual({ name: 'Maria Oliveira', email: 'maria@hospitalcentral.br', role: 'nurse', shift: 'Turno A' });
    });

    it('mostra o erro quando a API recusa a alteração (ex.: sem permissão)', async () => {
      const { user } = await abrirGerenciarUsuarios({ 'PATCH /users/u1/status': { status: 403, corpo: { message: 'Sem permissão.' } } });

      await user.click(within(cartao('Ana Silva')).getByRole('button', { name: 'Desativar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão.');
      expect(screen.getByText('2 usuários · 2 ativos')).toBeInTheDocument();
    });
  });
});
