import { expect, test, type Page } from '@playwright/test';
import { CONTAS, URL_DA_API_DE_REFERENCIA, abrirConferencia, entrar, instalarVozFalsa, irPara, menuLateral, tituloDaTela } from './apoio';

/**
 * Fluxos de ponta a ponta com o frontend conectado à API (servidor de referência do contrato, VITE_API_BASE_URL definida).
 * Verificam tanto a interface quanto o que de fato foi persistido no servidor.
 */

const API = `${URL_DA_API_DE_REFERENCIA}/api/v1`;

test.beforeEach(async ({ request }) => {
  const resposta = await request.post(`${URL_DA_API_DE_REFERENCIA}/__test__/reset`);
  expect(resposta.status()).toBe(204);
});

/** Lê da API usando a sessão (cookie) que o navegador já abriu. */
async function lerDaApi<T>(page: Page, caminho: string): Promise<T> {
  const resposta = await page.request.get(`${API}${caminho}`);
  expect(resposta.ok(), `GET ${caminho} → ${resposta.status()}`).toBe(true);
  return resposta.json() as Promise<T>;
}

test.describe('Autenticação contra a API (RF01)', () => {
  test('exibe a mensagem de erro devolvida pelo servidor para senha incorreta', async ({ page }) => {
    await entrar(page, { email: CONTAS.enfermeira.email, senha: 'errada' });

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(menuLateral(page)).toHaveCount(0);
  });

  test('bloqueia o login de usuário inativo', async ({ page }) => {
    await entrar(page, { email: 'pedro.nunes@hospitalcentral.br', senha: 'inativo123' });

    await expect(page.getByText('Usuário inativo. Procure um administrador.')).toBeVisible();
    await expect(menuLateral(page)).toHaveCount(0);
  });

  test('carrega o dashboard com os dados do servidor e restaura a sessão ao recarregar a página', async ({ page }) => {
    await entrar(page, CONTAS.enfermeira);
    await expect(tituloDaTela(page)).toHaveText('Dashboard');
    await expect(page.getByText('Apendicectomia').locator('visible=true').first()).toBeVisible();

    await page.reload();

    // O token fica só em memória; quem restaura a sessão é o cookie (GET /auth/me).
    await expect(tituloDaTela(page)).toHaveText('Dashboard');
    await expect(menuLateral(page)).toBeVisible();
  });

  test('"Sair" encerra a sessão no servidor', async ({ page }) => {
    await entrar(page, CONTAS.enfermeira);
    await expect(tituloDaTela(page)).toHaveText('Dashboard');

    await menuLateral(page).getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();

    const resposta = await page.request.get(`${API}/auth/me`);
    expect(resposta.status()).toBe(401);
  });
});

test.describe('Conferência persistida na API (RF07, RF08, RF09, RN01, RN04)', () => {
  test('uma conferência com item pulado é salva como divergência e aparece nos Relatórios', async ({ page }) => {
    await instalarVozFalsa(page);
    await entrar(page, CONTAS.enfermeira);
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    await page.getByRole('button', { name: 'Pular' }).click();
    for (let restante = 5; restante > 0; restante--) {
      await page.getByTitle('Confirmar').first().click();
    }
    await expect(page.getByRole('heading', { name: 'Itens Faltando!' })).toBeVisible();

    // Persistência no servidor: um relatório novo, com a divergência registrada.
    await expect
      .poll(async () => (await lerDaApi<Array<{ surgeryId: string }>>(page, '/reports')).filter((r) => r.surgeryId === 'apendicite').length)
      .toBe(1);
    const relatorios = await lerDaApi<Array<{ id: string; surgeryId: string; status: string; confirmed: number; missing: number; total: number; operator: string }>>(page, '/reports');
    const novo = relatorios.find((r) => r.surgeryId === 'apendicite')!;
    expect(novo).toMatchObject({ status: 'divergencia', confirmed: 5, missing: 1, total: 6, operator: 'Ana Silva' });

    // E o histórico na interface mostra a conferência feita.
    await irPara(page, 'Relatórios');
    await expect(tituloDaTela(page)).toHaveText('Relatórios de Conferência');
    await expect(page.getByText('Apendicectomia').locator('visible=true').first()).toBeVisible();
  });

  test('uma conferência totalmente confirmada é salva como "ok"', async ({ page }) => {
    await instalarVozFalsa(page);
    await entrar(page, CONTAS.enfermeira);
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    for (let restante = 6; restante > 0; restante--) {
      await page.getByTitle('Confirmar').first().click();
    }
    await expect(page.getByRole('heading', { name: 'Kit Completo!' })).toBeVisible();

    await expect
      .poll(async () => (await lerDaApi<Array<{ surgeryId: string; status: string }>>(page, '/reports')).find((r) => r.surgeryId === 'apendicite')?.status)
      .toBe('ok');
  });
});

test.describe('Administração persistida na API (RF02, RN02)', () => {
  test('o administrador cadastra um item de estoque; ele é gravado no servidor e sobrevive ao recarregamento', async ({ page }) => {
    await entrar(page, CONTAS.administrador);
    await irPara(page, 'Gerenciar Estoque');
    await page.getByRole('button', { name: 'Adicionar item' }).click();
    await page.getByPlaceholder('Ex: Luvas Estéreis 7.5').fill('Gaze Estéril E2E');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByText('Gaze Estéril E2E').locator('visible=true').first()).toBeVisible();

    const estoque = await lerDaApi<Array<{ name: string; updatedBy: string }>>(page, '/stock');
    expect(estoque.find((item) => item.name === 'Gaze Estéril E2E')).toMatchObject({ updatedBy: 'Carlos Mendes' });

    await page.reload();
    await irPara(page, 'Gerenciar Estoque');
    await expect(page.getByText('Gaze Estéril E2E').locator('visible=true').first()).toBeVisible();
  });

  test('desativar um usuário na interface impede o login dele (RF01)', async ({ page }) => {
    await entrar(page, CONTAS.administrador);
    await irPara(page, 'Gerenciar Usuários');
    const cartao = page.getByText('Rafael Lima').locator('visible=true').first().locator('xpath=ancestor::div[.//button[normalize-space()="Desativar"]][1]');

    await cartao.getByRole('button', { name: 'Desativar' }).click();
    await expect(cartao.getByText('INATIVO').first()).toBeVisible();

    const usuarios = await lerDaApi<Array<{ email: string; status: string }>>(page, '/users');
    expect(usuarios.find((u) => u.email === CONTAS.tecnico.email)?.status).toBe('inactive');

    await menuLateral(page).getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.tecnico);
    await expect(page.getByText('Usuário inativo. Procure um administrador.')).toBeVisible();
  });
});

test.describe('Permissões por perfil no servidor (RN05)', () => {
  test('a enfermeira não consegue alterar estoque nem listar usuários, mesmo chamando a API diretamente', async ({ page }) => {
    await entrar(page, CONTAS.enfermeira);
    await expect(tituloDaTela(page)).toHaveText('Dashboard');

    const criar = await page.request.post(`${API}/stock`, { data: { name: 'X', category: 'EPI', available: 1, minimum: 1, unit: 'unid' } });
    const usuarios = await page.request.get(`${API}/users`);

    expect(criar.status()).toBe(403);
    expect(usuarios.status()).toBe(403);
  });
});
