import { describe, expect, it, vi } from 'vitest';
import { carregarModulosConectados, instalarApiFalsa, URL_BASE_DE_TESTE } from '../helpers/api-falsa';

const usuarioDeExemplo = {
  id: 'u1',
  name: 'Ana Silva',
  email: 'ana.silva@hospitalcentral.br',
  role: 'nurse',
  shift: 'Turno A',
  initials: 'AS',
  hospital: 'Hospital Central',
  phone: '(11) 99874-3210',
  joinedAt: 'Março 2024',
};

describe('cliente da API (services/api.ts)', () => {
  describe('configuração', () => {
    it('fica no modo demonstração quando VITE_API_BASE_URL não está definida', async () => {
      const { apiEstaConfigurada } = await import('@/services/api');
      expect(apiEstaConfigurada).toBe(false);
    });

    it('habilita a API quando VITE_API_BASE_URL está definida', async () => {
      const { api } = await carregarModulosConectados();
      expect(api.apiEstaConfigurada).toBe(true);
    });

    it('remove a barra final da URL base ao montar as requisições', async () => {
      vi.stubEnv('VITE_API_BASE_URL', `${URL_BASE_DE_TESTE}/`);
      vi.resetModules();
      const { clienteApi } = await import('@/services/api');
      const { chamadas } = instalarApiFalsa({ 'GET /stock': { corpo: [] } });

      await clienteApi.stock.list();

      expect(chamadas[0].url).toBe(`${URL_BASE_DE_TESTE}/stock`);
    });
  });

  describe('requisições', () => {
    it('envia cookies da sessão (credentials: include) em todas as chamadas', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({ 'GET /stock': { corpo: [] } });

      await api.clienteApi.stock.list();

      expect(chamadas[0].credenciais).toBe('include');
    });

    it('define Content-Type JSON apenas quando há corpo', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({
        'GET /stock': { corpo: [] },
        'POST /stock': { status: 201, corpo: { id: 's1' } },
      });

      await api.clienteApi.stock.list();
      await api.clienteApi.stock.create({ name: 'Luvas', available: 10, minimum: 5, unit: 'pares', category: 'EPI' });

      expect(chamadas[0].cabecalhos.has('Content-Type')).toBe(false);
      expect(chamadas[1].cabecalhos.get('Content-Type')).toBe('application/json');
    });

    it('codifica o id na URL para evitar injeção de caminho', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({});

      await api.clienteApi.surgeries.getKit('a/b ?x').catch(() => undefined);

      expect(chamadas[0].url).toContain('/surgeries/a%2Fb%20%3Fx/kit');
    });

    it('trata 204 No Content como sucesso sem corpo', async () => {
      const { api } = await carregarModulosConectados();
      instalarApiFalsa({ 'DELETE /stock/s1': { status: 204 } });

      await expect(api.clienteApi.stock.remove('s1')).resolves.toBeUndefined();
    });
  });

  describe('autenticação', () => {
    it('login envia as credenciais e devolve o usuário', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({ 'POST /auth/login': { corpo: { user: usuarioDeExemplo } } });

      const usuario = await api.clienteApi.auth.login({ email: 'ana.silva@hospitalcentral.br', password: 'senha123' });

      expect(usuario).toEqual(usuarioDeExemplo);
      expect(chamadas[0].corpo).toEqual({ email: 'ana.silva@hospitalcentral.br', password: 'senha123' });
    });

    it('envia o token bearer nas chamadas seguintes quando o login devolve accessToken', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({
        'POST /auth/login': { corpo: { user: usuarioDeExemplo, accessToken: 'token-123' } },
        'GET /stock': { corpo: [] },
      });

      await api.clienteApi.auth.login({ email: 'a@b.c', password: 'x' });
      await api.clienteApi.stock.list();

      expect(chamadas[0].cabecalhos.has('Authorization')).toBe(false);
      expect(chamadas[1].cabecalhos.get('Authorization')).toBe('Bearer token-123');
    });

    it('não envia Authorization quando o login não devolve token (sessão por cookie)', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({
        'POST /auth/login': { corpo: { user: usuarioDeExemplo } },
        'GET /stock': { corpo: [] },
      });

      await api.clienteApi.auth.login({ email: 'a@b.c', password: 'x' });
      await api.clienteApi.stock.list();

      expect(chamadas[1].cabecalhos.has('Authorization')).toBe(false);
    });

    it('logout descarta o token mesmo quando o servidor responde com erro', async () => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({
        'POST /auth/login': { corpo: { user: usuarioDeExemplo, accessToken: 'token-123' } },
        'POST /auth/logout': { status: 500, corpo: { message: 'falha' } },
        'GET /stock': { corpo: [] },
      });

      await api.clienteApi.auth.login({ email: 'a@b.c', password: 'x' });
      await expect(api.clienteApi.auth.logout()).rejects.toThrow('falha');
      await api.clienteApi.stock.list();

      expect(chamadas.at(-1)?.cabecalhos.has('Authorization')).toBe(false);
    });

    it('não persiste o token em localStorage nem sessionStorage', async () => {
      const { api } = await carregarModulosConectados();
      instalarApiFalsa({ 'POST /auth/login': { corpo: { user: usuarioDeExemplo, accessToken: 'token-secreto' } } });

      await api.clienteApi.auth.login({ email: 'a@b.c', password: 'x' });

      expect(JSON.stringify({ ...localStorage })).not.toContain('token-secreto');
      expect(JSON.stringify({ ...sessionStorage })).not.toContain('token-secreto');
    });
  });

  describe('tratamento de erros', () => {
    it('lança ApiError com a mensagem e o status devolvidos pelo servidor', async () => {
      const { api } = await carregarModulosConectados();
      instalarApiFalsa({ 'POST /auth/login': { status: 401, corpo: { message: 'E-mail ou senha incorretos.' } } });

      const erro = await api.clienteApi.auth.login({ email: 'a@b.c', password: 'errada' }).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(api.ApiError);
      expect(erro).toMatchObject({ name: 'ApiError', message: 'E-mail ou senha incorretos.', status: 401 });
    });

    it('usa uma mensagem padrão quando o corpo do erro não é JSON', async () => {
      const { api } = await carregarModulosConectados();
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })));

      const erro = await api.clienteApi.reports.list().catch((e: unknown) => e);

      expect(erro).toMatchObject({ message: 'Falha na requisição (502).', status: 502 });
    });
  });

  describe('contrato dos endpoints', () => {
    const casos: Array<{ nome: string; metodo: string; caminho: string; corpo?: unknown; chamar: (c: Awaited<ReturnType<typeof carregarModulosConectados>>['api']['clienteApi']) => Promise<unknown> }> = [
      { nome: 'auth.currentUser', metodo: 'GET', caminho: '/auth/me', chamar: (c) => c.auth.currentUser() },
      { nome: 'dashboard.getSummary', metodo: 'GET', caminho: '/dashboard', chamar: (c) => c.dashboard.getSummary() },
      { nome: 'surgeries.list', metodo: 'GET', caminho: '/surgeries', chamar: (c) => c.surgeries.list() },
      { nome: 'surgeries.getKit', metodo: 'GET', caminho: '/surgeries/joelho/kit', chamar: (c) => c.surgeries.getKit('joelho') },
      { nome: 'stock.list', metodo: 'GET', caminho: '/stock', chamar: (c) => c.stock.list() },
      {
        nome: 'stock.update',
        metodo: 'PUT',
        caminho: '/stock/s1',
        corpo: { name: 'Luvas', available: 3, minimum: 5, unit: 'pares', category: 'EPI' },
        chamar: (c) => c.stock.update('s1', { name: 'Luvas', available: 3, minimum: 5, unit: 'pares', category: 'EPI' }),
      },
      { nome: 'stock.adjust', metodo: 'POST', caminho: '/stock/s1/adjustments', corpo: { delta: -5 }, chamar: (c) => c.stock.adjust('s1', -5) },
      { nome: 'reports.list', metodo: 'GET', caminho: '/reports', chamar: (c) => c.reports.list() },
      { nome: 'users.list', metodo: 'GET', caminho: '/users', chamar: (c) => c.users.list() },
      {
        nome: 'users.create',
        metodo: 'POST',
        caminho: '/users',
        corpo: { name: 'Maria', email: 'maria@h.br', role: 'nurse', shift: 'Turno A' },
        chamar: (c) => c.users.create({ name: 'Maria', email: 'maria@h.br', role: 'nurse', shift: 'Turno A' }),
      },
      {
        nome: 'users.update',
        metodo: 'PUT',
        caminho: '/users/u9',
        corpo: { name: 'Maria', email: 'maria@h.br', role: 'admin', shift: 'Turno B' },
        chamar: (c) => c.users.update('u9', { name: 'Maria', email: 'maria@h.br', role: 'admin', shift: 'Turno B' }),
      },
      { nome: 'users.setStatus', metodo: 'PATCH', caminho: '/users/u9/status', corpo: { status: 'inactive' }, chamar: (c) => c.users.setStatus('u9', 'inactive') },
      { nome: 'profile.get', metodo: 'GET', caminho: '/profile', chamar: (c) => c.profile.get() },
      { nome: 'profile.update', metodo: 'PATCH', caminho: '/profile', corpo: { name: 'Ana', phone: '1' }, chamar: (c) => c.profile.update({ name: 'Ana', phone: '1' }) },
      { nome: 'profile.getNotifications', metodo: 'GET', caminho: '/profile/notifications', chamar: (c) => c.profile.getNotifications() },
      {
        nome: 'profile.updateNotifications',
        metodo: 'PUT',
        caminho: '/profile/notifications',
        corpo: { stockAlert: true, surgeryReminder: false, voiceChecklist: true, weeklyReport: false },
        chamar: (c) => c.profile.updateNotifications({ stockAlert: true, surgeryReminder: false, voiceChecklist: true, weeklyReport: false }),
      },
      {
        nome: 'profile.changePassword',
        metodo: 'PUT',
        caminho: '/profile/password',
        corpo: { currentPassword: 'a', newPassword: 'b' },
        chamar: (c) => c.profile.changePassword({ currentPassword: 'a', newPassword: 'b' }),
      },
    ];

    it.each(casos)('$nome → $metodo $caminho', async ({ metodo, caminho, corpo, chamar }) => {
      const { api } = await carregarModulosConectados();
      const { chamadas } = instalarApiFalsa({ [`${metodo} ${caminho}`]: { corpo: {} } });

      await chamar(api.clienteApi);

      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].metodo).toBe(metodo);
      expect(chamadas[0].caminho).toBe(caminho);
      expect(chamadas[0].corpo).toEqual(corpo);
    });

    it('stock.create e reports.create enviam o corpo recebido sem alterá-lo', async () => {
      const { api } = await carregarModulosConectados();
      const relatorio = {
        surgeryId: 'joelho',
        surgeryName: 'Artroscopia de Joelho',
        specialty: 'Ortopedia',
        operator: 'Ana Silva',
        operatorRole: 'nurse' as const,
        date: '10/11/2026',
        time: '08:00',
        duration: '1min 0s',
        confirmed: 1,
        missing: 0,
        total: 1,
        status: 'ok' as const,
        items: [],
      };
      const { chamadasPara } = instalarApiFalsa({
        'POST /stock': { status: 201, corpo: {} },
        'POST /reports': { status: 201, corpo: {} },
      });

      await api.clienteApi.stock.create({ name: 'Fio', available: 1, minimum: 2, unit: 'unid', category: 'Descartável' });
      await api.clienteApi.reports.create(relatorio);

      expect(chamadasPara('POST', '/stock')[0].corpo).toEqual({ name: 'Fio', available: 1, minimum: 2, unit: 'unid', category: 'Descartável' });
      expect(chamadasPara('POST', '/reports')[0].corpo).toEqual(relatorio);
    });
  });
});
