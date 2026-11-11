import { expect, test } from '@playwright/test';
import { CONTAS, abrirConferencia, entrar, instalarVozFalsa, menuLateral, tituloDaTela } from './apoio';

/** Em telas pequenas a navegação lateral some e entra a barra inferior (modo demonstração, viewport Pixel 7). */

test('a barra inferior substitui o menu lateral e leva às telas principais', async ({ page }) => {
  await entrar(page, CONTAS.enfermeira);
  await expect(tituloDaTela(page)).toHaveText('Dashboard');
  await expect(menuLateral(page)).toBeHidden();

  const barra = page.locator('nav').filter({ has: page.getByRole('button', { name: 'Relatórios' }) }).last();
  await barra.getByRole('button', { name: 'Kits' }).click();
  await expect(tituloDaTela(page)).toHaveText('Kits Cirúrgicos');

  await barra.getByRole('button', { name: 'Relatórios' }).click();
  await expect(tituloDaTela(page)).toHaveText('Relatórios de Conferência');
});

test('é possível conferir um kit inteiro por toque no celular (RNF02, com o microfone ativado)', async ({ page }) => {
  await instalarVozFalsa(page);
  await entrar(page, CONTAS.enfermeira);
  await abrirConferencia(page, 'Apendicectomia');
  await page.getByRole('button', { name: 'Ativar Microfone' }).click();

  for (let item = 0; item < 6; item++) {
    await page.getByTitle('Confirmar').first().tap();
  }

  await expect(page.getByRole('heading', { name: 'Kit Completo!' })).toBeVisible();
});
