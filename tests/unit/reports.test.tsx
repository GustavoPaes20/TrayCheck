import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Reports from '@/components/Reports';
import { historicoDeConferencias } from '@/data/mockData';

// Dados de demonstração: 5 relatórios — 3 completos (r1, r3, r5) e 2 com divergência (r2, r4).
function renderizar() {
  return { ...render(<Reports />), user: userEvent.setup() };
}

function cartaoDoRelatorio(nomeDaCirurgia: string): HTMLElement {
  const cartao = screen.getByText(nomeDaCirurgia, { selector: 'div' }).closest<HTMLElement>('button');
  if (!cartao) throw new Error(`Cartão do relatório de "${nomeDaCirurgia}" não encontrado.`);
  return cartao;
}

function indicador(rotulo: string) {
  return screen.getByText(rotulo).previousElementSibling as HTMLElement;
}

describe('Reports — histórico de conferências (RF08, RF10)', () => {
  it('lista todas as sessões registradas e resume os totais', () => {
    renderizar();

    expect(screen.getByText('5 sessões registradas')).toBeInTheDocument();
    expect(indicador('Total')).toHaveTextContent('5');
    expect(indicador('Sem divergências')).toHaveTextContent('3');
    expect(indicador('Com divergências')).toHaveTextContent('2');
  });

  it('destaca os itens faltantes de relatórios com divergência (RN04)', () => {
    renderizar();
    const cartao = cartaoDoRelatorio('Cesariana');

    expect(within(cartao).getByText('DIVERGÊNCIA')).toBeInTheDocument();
    expect(within(cartao).getByText('Faltando:')).toBeInTheDocument();
    expect(within(cartao).getByText('Ocitocina 10UI')).toBeInTheDocument();
    expect(within(cartao).getByText('Aspirador Cirúrgico')).toBeInTheDocument();
    expect(within(cartao).getByText('5/7')).toBeInTheDocument();
  });

  it('relatórios completos não listam itens faltantes', () => {
    renderizar();
    const cartao = cartaoDoRelatorio('Artroscopia de Joelho');

    expect(within(cartao).getByText('COMPLETO')).toBeInTheDocument();
    expect(within(cartao).queryByText('Faltando:')).not.toBeInTheDocument();
    expect(within(cartao).getByText('12/12')).toBeInTheDocument();
  });

  it.each([
    { filtro: 'Completo', visiveis: ['Artroscopia de Joelho', 'Herniorrafia Laparoscópica', 'Apendicectomia'], ocultos: ['Cesariana', 'Revascularização Cardíaca'] },
    { filtro: 'Divergência', visiveis: ['Cesariana', 'Revascularização Cardíaca'], ocultos: ['Artroscopia de Joelho', 'Apendicectomia'] },
  ])('o filtro "$filtro" mostra apenas os relatórios correspondentes', async ({ filtro, visiveis, ocultos }) => {
    const { user } = renderizar();

    await user.click(screen.getByRole('button', { name: filtro }));

    for (const nome of visiveis) expect(screen.getByText(nome, { selector: 'div' })).toBeInTheDocument();
    for (const nome of ocultos) expect(screen.queryByText(nome, { selector: 'div' })).not.toBeInTheDocument();
  });

  it('filtra por data', async () => {
    const { user } = renderizar();

    await user.selectOptions(screen.getByRole('combobox'), '30/08/2026');

    expect(screen.getByText('Apendicectomia', { selector: 'div' })).toBeInTheDocument();
    expect(screen.queryByText('Cesariana', { selector: 'div' })).not.toBeInTheDocument();
  });

  it('oferece uma opção de data para cada dia com registros, sem repetir', () => {
    renderizar();
    const datas = within(screen.getByRole('combobox')).getAllByRole('option').map((opcao) => opcao.textContent);

    const datasDosDados = [...new Set(historicoDeConferencias.map((r) => r.date))];
    expect(datas).toEqual(['Todas as datas', ...datasDosDados]);
  });

  it('combina filtro de status e de data e mostra mensagem quando nada corresponde', async () => {
    const { user } = renderizar();

    await user.click(screen.getByRole('button', { name: 'Divergência' }));
    await user.selectOptions(screen.getByRole('combobox'), '30/08/2026'); // só há um relatório completo nesse dia

    expect(screen.getByText('Nenhum relatório encontrado.')).toBeInTheDocument();
  });

  describe('detalhes do relatório', () => {
    it('abre o detalhamento item a item com operador, data e percentual', async () => {
      const { user } = renderizar();

      await user.click(cartaoDoRelatorio('Revascularização Cardíaca'));

      const detalhes = screen.getByRole('heading', { name: 'Revascularização Cardíaca' }).closest<HTMLElement>('.rounded-2xl')!;
      expect(within(detalhes).getByText(/Operador:/)).toHaveTextContent('Ana Silva');
      expect(within(detalhes).getByText(/31\/08\/2026 às 06:52 · 5min 40s/)).toBeInTheDocument();
      expect(within(detalhes).getByText('7 de 8 itens conferidos')).toBeInTheDocument();
      expect(within(detalhes).getByText('88%')).toBeInTheDocument();
      expect(within(detalhes).getByText('Heparina 5000UI')).toBeInTheDocument();
      expect(within(detalhes).getAllByText('CRÍTICO').length).toBeGreaterThan(0);
    });

    it('fecha o detalhamento', async () => {
      const { user } = renderizar();
      await user.click(cartaoDoRelatorio('Cesariana'));
      const detalhes = screen.getByRole('heading', { name: 'Cesariana' }).closest<HTMLElement>('.rounded-2xl')!;

      await user.click(within(detalhes).getAllByRole('button')[0]); // botão de fechar (primeiro do cabeçalho)

      expect(screen.queryByRole('heading', { name: 'Cesariana' })).not.toBeInTheDocument();
    });
  });
});
