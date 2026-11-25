import { expect, test } from '@playwright/test';
import { CONTAS, abrirConferencia, contador, entrar, eventosDeVoz, falar, falasDoApp, instalarVozFalsa, irPara, menuLateral, microfoneAberto, segurarFala, sobreposicoesDeVoz, terminarFala, tituloDaTela } from './apoio';

/** Fluxos de ponta a ponta no modo de demonstração (sem backend). Mapeados ao plano de QA e aos RF/RN do documento de requisitos. */

test.describe('Autenticação e perfis (RF02, RN05)', () => {
  test('mostra o login e recusa credenciais inválidas', async ({ page }) => {
    await entrar(page, { email: CONTAS.enfermeira.email, senha: 'senha-errada' });

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(menuLateral(page)).toHaveCount(0);
  });

  test('a enfermeira entra, vê o dashboard e consegue sair', async ({ page }) => {
    await entrar(page, CONTAS.enfermeira);

    await expect(tituloDaTela(page)).toHaveText('Dashboard');
    await expect(page.getByRole('heading', { name: /^(Bom dia|Boa tarde|Boa noite), Ana\.$/ })).toBeVisible();

    await menuLateral(page).getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  });

  test('só o administrador vê o menu de administração', async ({ page }) => {
    await entrar(page, CONTAS.enfermeira);
    await expect(tituloDaTela(page)).toHaveText('Dashboard');
    await expect(menuLateral(page).getByRole('button', { name: 'Gerenciar Estoque' })).toHaveCount(0);
    await expect(menuLateral(page).getByRole('button', { name: 'Gerenciar Usuários' })).toHaveCount(0);
    await menuLateral(page).getByRole('button', { name: 'Sair' }).click();

    await entrar(page, CONTAS.administrador);
    await expect(menuLateral(page).getByRole('button', { name: 'Gerenciar Estoque' })).toBeVisible();
    await expect(menuLateral(page).getByRole('button', { name: 'Gerenciar Usuários' })).toBeVisible();
  });
});

test.describe('Conferência por voz de um kit (RF06, RF07, RF09, RNF07)', () => {
  test.beforeEach(async ({ page }) => {
    await instalarVozFalsa(page);
    await entrar(page, CONTAS.enfermeira);
  });

  test('iniciar → confirmar por voz → confirmar por toque → pular um → finalizar com divergência', async ({ page }) => {
    await abrirConferencia(page, 'Apendicectomia');
    await expect(contador(page, 'Pend.')).toHaveText('6');

    // Inicia a escuta (o microfone real é substituído pelo mock de voz).
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();
    await expect(page.getByRole('button', { name: 'Pausar Microfone' })).toBeVisible();

    // O assistente pergunta; o operador responde por voz.
    await falar(page, 'sim, temos');
    await expect(contador(page, 'OK')).toHaveText('1');
    await expect(contador(page, 'Pend.')).toHaveText('5');
    expect(await falasDoApp(page)).toContainEqual('Conferido.'); // retorno sonoro (RNF07)

    // Confirma o próximo por toque (fallback manual, RNF02).
    await page.getByTitle('Confirmar').first().click();
    await expect(contador(page, 'OK')).toHaveText('2');

    // Pula um item: ele passa a "faltante" (RF07).
    await page.getByRole('button', { name: 'Pular' }).click();
    await expect(contador(page, 'Falta')).toHaveText('1');
    await expect(contador(page, 'Pend.')).toHaveText('3');

    // Trata os itens restantes por toque: a conferência conclui sozinha com divergência (RF09, RN04).
    for (let restante = 3; restante > 0; restante--) {
      await page.getByTitle('Confirmar').first().click();
    }
    await expect(page.getByRole('heading', { name: 'Itens Faltando!' })).toBeVisible();
    await expect(page.getByText('5 itens OK')).toBeVisible();
  });

  test('responder "sim" a cada pergunta conclui com "Kit Completo!"', async ({ page }) => {
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    for (const resposta of ['sim', 'tem', 'temos', 'confirmado', 'checado', 'certo']) {
      await falar(page, resposta);
    }

    await expect(page.getByRole('heading', { name: 'Kit Completo!' })).toBeVisible();
    await expect(page.getByText('Todos os 6 itens foram confirmados.')).toBeVisible();
    expect(await sobreposicoesDeVoz(page)).toBe(0);
  });

  test('"Não temos" registra o item como faltante e a conferência segue para o próximo', async ({ page }) => {
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    await falar(page, 'Não temos');

    await expect(contador(page, 'Falta')).toHaveText('1');
    await expect(contador(page, 'OK')).toHaveText('0');
    await expect.poll(() => falasDoApp(page)).toContainEqual('Bisturi número 22, 1 unidade. Está disponível?');
  });

  test('uma resposta inconclusiva ("acho que sim") não registra nada e pede confirmação clara', async ({ page }) => {
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    await falar(page, 'acho que sim');

    await expect.poll(() => falasDoApp(page)).toContainEqual('Não consegui confirmar. Luvas Estéreis 7,0 está disponível?');
    await expect(contador(page, 'OK')).toHaveText('0');
    await expect(contador(page, 'Pend.')).toHaveText('6');

    await falar(page, 'sim');
    await expect(contador(page, 'OK')).toHaveText('1');
  });

  test('uma frase fora do assunto não altera a conferência', async ({ page }) => {
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    await falar(page, 'pizza de calabresa');

    await expect(contador(page, 'OK')).toHaveText('0');
    await expect(contador(page, 'Pend.')).toHaveText('6');
  });

  test('o microfone só abre depois que o assistente termina de falar (sem captar a própria voz)', async ({ page }) => {
    await segurarFala(page);
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByRole('button', { name: 'Ativar Microfone' }).click();

    await expect.poll(() => falasDoApp(page)).toContainEqual(expect.stringContaining('Está disponível?'));
    await page.waitForTimeout(800); // bem mais que a pausa de segurança: ainda falando, o microfone segue fechado
    expect(await microfoneAberto(page)).toBe(false);
    expect(await eventosDeVoz(page)).not.toContain('mic:abre');

    await terminarFala(page);
    await expect.poll(() => microfoneAberto(page)).toBe(true);
    const eventos = await eventosDeVoz(page);
    expect(eventos.indexOf('fala:fim')).toBeLessThan(eventos.indexOf('mic:abre'));
    expect(await sobreposicoesDeVoz(page)).toBe(0);
  });

  test('"Reiniciar" devolve todos os itens a pendente', async ({ page }) => {
    await abrirConferencia(page, 'Apendicectomia');
    await page.getByTitle('Confirmar').first().click();
    await expect(contador(page, 'OK')).toHaveText('1');

    await page.getByTitle('Reiniciar').click();

    await expect(contador(page, 'OK')).toHaveText('0');
    await expect(contador(page, 'Pend.')).toHaveText('6');
  });
});

test.describe('Defeitos conhecidos (documentados, não corrigidos nesta mudança)', () => {
  // `test.fail()` mantém o CI verde enquanto o defeito existe e faz o teste acusar quando for corrigido (basta trocar por `test`).
  test('RNF02: deveria permitir concluir a conferência apenas por toque, sem ativar o microfone', async ({ page }) => {
    test.fail(true, 'Hoje a conferência só "inicia" ao ativar o microfone ou o modo demo; só por toque nunca conclui.');
    await instalarVozFalsa(page);
    await entrar(page, CONTAS.enfermeira);
    await abrirConferencia(page, 'Apendicectomia');

    for (let item = 0; item < 6; item++) {
      await page.getByTitle('Confirmar').first().click();
    }

    await expect(page.getByRole('heading', { name: 'Kit Completo!' })).toBeVisible({ timeout: 2_000 });
  });
});

test.describe('Estoque e administração (RF03, RN02)', () => {
  test('o técnico consulta o estoque, mas não vê ações de edição', async ({ page }) => {
    await entrar(page, CONTAS.tecnico);

    await irPara(page, 'Estoque');

    await expect(tituloDaTela(page)).toHaveText('Estoque');
    await expect(page.getByText('Bisturi nº 10').locator('visible=true').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar item' })).toHaveCount(0);
    await expect(menuLateral(page).getByRole('button', { name: 'Gerenciar Estoque' })).toHaveCount(0);
  });

  test('o administrador cadastra um item de estoque e ele aparece na lista', async ({ page }) => {
    await entrar(page, CONTAS.administrador);
    await irPara(page, 'Gerenciar Estoque');
    await expect(tituloDaTela(page)).toHaveText('Gerenciar Estoque');

    await page.getByRole('button', { name: 'Adicionar item' }).click();
    await expect(page.getByRole('heading', { name: 'Adicionar Item ao Estoque' })).toBeVisible();
    await page.getByPlaceholder('Ex: Luvas Estéreis 7.5').fill('Gaze Estéril E2E');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();

    await expect(page.getByText('Gaze Estéril E2E').locator('visible=true').first()).toBeVisible();
  });

  test('o administrador ajusta a quantidade com os botões −5/+5', async ({ page }) => {
    await entrar(page, CONTAS.administrador);
    await irPara(page, 'Gerenciar Estoque');
    const linha = page.getByText('Luvas Estéreis 7.5').locator('visible=true').first().locator('xpath=ancestor::div[.//button[normalize-space()="+5"]][1]');
    await expect(linha.getByText('48')).toBeVisible();

    await linha.getByRole('button', { name: '+5' }).click();

    await expect(linha.getByText('53')).toBeVisible();
  });
});
