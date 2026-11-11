import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import StockManager from '@/components/admin/StockManager';

// Dados de demonstração: 16 itens — 2 críticos (Bisturi nº 10, Propofol 200mg) e 3 baixos.
const TOTAL = 16;

function renderizar() {
  return { ...render(<StockManager />), user: userEvent.setup() };
}

/** Cada item aparece em um cartão (mobile) e em uma linha (desktop); a linha é a única dentro de um `.grid`. */
function linhaDoItem(nome: string): HTMLElement {
  const linha = screen.getAllByText(nome).map((elemento) => elemento.closest<HTMLElement>('div.grid')).find(Boolean);
  if (!linha) throw new Error(`Linha do item "${nome}" não encontrada.`);
  return linha;
}

async function confirmarExclusao(user: ReturnType<typeof userEvent.setup>) {
  const dialogo = screen.getByText('Excluir item?').closest<HTMLElement>('.rounded-2xl');
  if (!dialogo) throw new Error('Diálogo de exclusão não encontrado.');
  await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
}

function resumo(texto: string | RegExp) {
  return screen.getByText(texto);
}

async function preencherModal(
  user: ReturnType<typeof userEvent.setup>,
  { nome, disponivel, minimo }: { nome?: string; disponivel?: number; minimo?: number },
) {
  if (nome !== undefined) await user.type(screen.getByPlaceholderText('Ex: Luvas Estéreis 7.5'), nome);
  const [campoDisponivel, campoMinimo] = screen.getAllByRole('spinbutton');
  if (disponivel !== undefined) {
    await user.clear(campoDisponivel);
    await user.type(campoDisponivel, String(disponivel));
  }
  if (minimo !== undefined) {
    await user.clear(campoMinimo);
    await user.type(campoMinimo, String(minimo));
  }
}

describe('StockManager — gerenciar estoque (admin)', () => {
  describe('listagem e filtros', () => {
    it('resume a quantidade de itens, críticos e baixos', () => {
      renderizar();
      expect(resumo(`${TOTAL} itens · 2 críticos · 3 baixos`)).toBeInTheDocument();
      expect(screen.getByText(`${TOTAL} de ${TOTAL} itens`)).toBeInTheDocument();
    });

    it('a busca por nome ignora maiúsculas e minúsculas', async () => {
      const { user } = renderizar();

      await user.type(screen.getByPlaceholderText('Buscar item...'), 'LUVAS');

      expect(screen.getByText(`3 de ${TOTAL} itens`)).toBeInTheDocument();
      expect(screen.queryByText('Bisturi nº 15')).not.toBeInTheDocument();
    });

    it('mostra mensagem quando nenhum item corresponde à busca', async () => {
      const { user } = renderizar();

      await user.type(screen.getByPlaceholderText('Buscar item...'), 'inexistente');

      expect(screen.getByText('Nenhum item encontrado.')).toBeInTheDocument();
      expect(screen.getByText(`0 de ${TOTAL} itens`)).toBeInTheDocument();
    });

    it('filtra por status', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Crítico' }));

      expect(screen.getByText(`2 de ${TOTAL} itens`)).toBeInTheDocument();
      expect(screen.getAllByText('Propofol 200mg').length).toBeGreaterThan(0);
      expect(screen.queryByText('Luvas Estéreis 7.5')).not.toBeInTheDocument();
    });

    it('filtra por categoria', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Anestesia' }));

      expect(screen.getByText(`3 de ${TOTAL} itens`)).toBeInTheDocument();
    });

    it('combina busca, status e categoria', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Baixo' }));
      await user.click(screen.getByRole('button', { name: 'EPI' }));

      expect(screen.getByText(`1 de ${TOTAL} itens`)).toBeInTheDocument();
      expect(screen.getAllByText('Luvas Estéreis 7.0').length).toBeGreaterThan(0);

      await user.type(screen.getByPlaceholderText('Buscar item...'), 'xyz');
      expect(screen.getByText('Nenhum item encontrado.')).toBeInTheDocument();
    });
  });

  describe('adicionar item', () => {
    it('abre e fecha o modal sem alterar a lista', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
      expect(screen.getByRole('heading', { name: 'Adicionar Item ao Estoque' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('heading', { name: 'Adicionar Item ao Estoque' })).not.toBeInTheDocument();
      expect(resumo(`${TOTAL} itens · 2 críticos · 3 baixos`)).toBeInTheDocument();
    });

    it('cadastra o item no topo da lista com valores padrão de categoria e unidade', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));

      await preencherModal(user, { nome: 'Gaze Estéril', disponivel: 50, minimo: 20 });
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(screen.queryByRole('heading', { name: 'Adicionar Item ao Estoque' })).not.toBeInTheDocument();
      const linha = linhaDoItem('Gaze Estéril');
      expect(within(linha).getByText(/EPI · Atualizado por Carlos Mendes/)).toBeInTheDocument();
      expect(within(linha).getByText('OK')).toBeInTheDocument();
      expect(resumo(`${TOTAL + 1} itens · 2 críticos · 3 baixos`)).toBeInTheDocument();
    });

    it('não cadastra item sem nome', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));

      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(screen.getByRole('heading', { name: 'Adicionar Item ao Estoque' })).toBeInTheDocument();
      expect(resumo(`${TOTAL} itens · 2 críticos · 3 baixos`)).toBeInTheDocument();
    });

    it('avisa no formulário somente quando a quantidade está abaixo do mínimo', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));

      await preencherModal(user, { disponivel: 20, minimo: 10 });
      expect(screen.queryByText(/abaixo do mínimo recomendado/)).not.toBeInTheDocument();

      await preencherModal(user, { disponivel: 2 });
      expect(screen.getByText(/abaixo do mínimo recomendado/)).toBeInTheDocument();
    });

    // Regra: crítico se disponível < 50% do mínimo; baixo se disponível < mínimo; senão ok.
    it.each([
      { disponivel: 10, minimo: 10, esperado: 'OK', descricao: 'igual ao mínimo' },
      { disponivel: 9, minimo: 10, esperado: 'BAIXO', descricao: 'logo abaixo do mínimo' },
      { disponivel: 5, minimo: 10, esperado: 'BAIXO', descricao: 'exatamente 50% do mínimo (limite)' },
      { disponivel: 4, minimo: 10, esperado: 'CRÍTICO', descricao: 'abaixo de 50% do mínimo' },
      { disponivel: 0, minimo: 10, esperado: 'CRÍTICO', descricao: 'zerado' },
    ])('calcula o status "$esperado" quando a quantidade está $descricao', async ({ disponivel, minimo, esperado }) => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));

      await preencherModal(user, { nome: 'Item de teste', disponivel, minimo });
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(within(linhaDoItem('Item de teste')).getByText(esperado)).toBeInTheDocument();
    });
  });

  describe('editar item', () => {
    it('abre o formulário preenchido e salva as alterações recalculando o status', async () => {
      const { user } = renderizar();
      await user.click(within(linhaDoItem('Luvas Estéreis 7.5')).getByTitle('Editar'));
      expect(screen.getByRole('heading', { name: 'Editar Item' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('Luvas Estéreis 7.5')).toBeInTheDocument();

      await preencherModal(user, { disponivel: 3, minimo: 20 });
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      const linha = linhaDoItem('Luvas Estéreis 7.5');
      expect(within(linha).getByText('CRÍTICO')).toBeInTheDocument();
      expect(resumo(`${TOTAL} itens · 3 críticos · 3 baixos`)).toBeInTheDocument();
    });

    it('edição não duplica o item', async () => {
      const { user } = renderizar();
      await user.click(within(linhaDoItem('Fio PDS 0')).getByTitle('Editar'));

      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(screen.getByText(`${TOTAL} de ${TOTAL} itens`)).toBeInTheDocument();
    });
  });

  describe('ajustar quantidade', () => {
    it('"+5" e "−5" alteram a quantidade disponível', async () => {
      const { user } = renderizar();
      const linha = () => linhaDoItem('Luvas Estéreis 7.5');
      expect(within(linha()).getByText('48')).toBeInTheDocument();

      await user.click(within(linha()).getByTitle('−5'));
      expect(within(linha()).getByText('43')).toBeInTheDocument();

      await user.click(within(linha()).getByTitle('+5'));
      await user.click(within(linha()).getByTitle('+5'));
      expect(within(linha()).getByText('53')).toBeInTheDocument();
    });

    it('a quantidade nunca fica negativa', async () => {
      const { user } = renderizar();

      await user.click(within(linhaDoItem('Tela de Polipropileno')).getByTitle('−5')); // 3 → 0

      expect(within(linhaDoItem('Tela de Polipropileno')).getByText('0')).toBeInTheDocument();
      expect(within(linhaDoItem('Tela de Polipropileno')).getByText('CRÍTICO')).toBeInTheDocument();
    });

    it('repor o estoque recalcula o status e o resumo', async () => {
      const { user } = renderizar();
      // Propofol 200mg: 6 disponíveis, mínimo 10 (crítico nos dados de demonstração)

      await user.click(within(linhaDoItem('Propofol 200mg')).getByTitle('+5')); // 11 ≥ 10

      expect(within(linhaDoItem('Propofol 200mg')).getByText('OK')).toBeInTheDocument();
      expect(resumo(`${TOTAL} itens · 1 críticos · 3 baixos`)).toBeInTheDocument();
    });
  });

  describe('excluir item', () => {
    it('pede confirmação e mantém o item quando cancelado', async () => {
      const { user } = renderizar();

      await user.click(within(linhaDoItem('Fio PDS 0')).getByTitle('Excluir'));
      expect(screen.getByText('Excluir item?')).toBeInTheDocument();
      expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByText('Excluir item?')).not.toBeInTheDocument();
      expect(screen.getByText(`${TOTAL} de ${TOTAL} itens`)).toBeInTheDocument();
    });

    it('remove o item ao confirmar', async () => {
      const { user } = renderizar();

      await user.click(within(linhaDoItem('Fio PDS 0')).getByTitle('Excluir'));
      await confirmarExclusao(user);

      expect(screen.queryByText('Fio PDS 0')).not.toBeInTheDocument();
      expect(screen.getByText(`${TOTAL - 1} de ${TOTAL - 1} itens`)).toBeInTheDocument();
    });

    it('excluir um item crítico atualiza a contagem de críticos', async () => {
      const { user } = renderizar();

      await user.click(within(linhaDoItem('Bisturi nº 10')).getByTitle('Excluir'));
      await confirmarExclusao(user);

      expect(resumo(`${TOTAL - 1} itens · 1 críticos · 3 baixos`)).toBeInTheDocument();
    });
  });
});
