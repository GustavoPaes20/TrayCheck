import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import UserManager from '@/components/admin/UserManager';

// Dados de demonstração: 7 usuários — 6 ativos (Pedro Nunes está inativo).
// Papéis: 4 enfermeiros, 2 técnicos (circulantes), 1 administrador.

function renderizar() {
  return { ...render(<UserManager />), user: userEvent.setup() };
}

function cartaoDoUsuario(nome: string): HTMLElement {
  const cartao = screen.getByText(nome).closest<HTMLElement>('.rounded-2xl');
  if (!cartao) throw new Error(`Cartão do usuário "${nome}" não encontrado.`);
  return cartao;
}

async function preencherFormulario(user: ReturnType<typeof userEvent.setup>, { nome, email }: { nome?: string; email?: string }) {
  if (nome !== undefined) await user.type(screen.getByPlaceholderText('Ex: Maria Oliveira'), nome);
  if (email !== undefined) await user.type(screen.getByPlaceholderText('usuario@hospitalcentral.br'), email);
}

describe('UserManager — gerenciar usuários (admin)', () => {
  describe('listagem e filtros', () => {
    it('resume o total de usuários e quantos estão ativos', () => {
      renderizar();
      expect(screen.getByText('7 usuários · 6 ativos')).toBeInTheDocument();
    });

    it('exibe nome, perfil, e-mail e turno de cada usuário', () => {
      renderizar();
      const cartao = cartaoDoUsuario('Rafael Lima');

      expect(within(cartao).getByText('Circulante')).toBeInTheDocument();
      expect(within(cartao).getByText('rafael.lima@hospitalcentral.br')).toBeInTheDocument();
      expect(within(cartao).getByText('Turno A')).toBeInTheDocument();
    });

    it('identifica usuários inativos', () => {
      renderizar();
      expect(within(cartaoDoUsuario('Pedro Nunes')).getByText('INATIVO')).toBeInTheDocument();
      expect(within(cartaoDoUsuario('Ana Silva')).queryByText('INATIVO')).not.toBeInTheDocument();
    });

    it.each([
      { filtro: 'Enfermeiros', esperados: ['Ana Silva', 'Fernanda Costa', 'Juliana Rocha', 'Mariana Torres'], ausente: 'Rafael Lima' },
      { filtro: 'Técnicos', esperados: ['Rafael Lima', 'Pedro Nunes'], ausente: 'Ana Silva' },
      { filtro: 'Admins', esperados: ['Carlos Mendes'], ausente: 'Ana Silva' },
    ])('o filtro "$filtro" mostra somente os usuários do perfil', async ({ filtro, esperados, ausente }) => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: filtro }));

      for (const nome of esperados) expect(screen.getByText(nome)).toBeInTheDocument();
      expect(screen.queryByText(ausente)).not.toBeInTheDocument();
    });

    it('a busca encontra por nome ou por e-mail, sem diferenciar maiúsculas', async () => {
      const { user } = renderizar();
      const busca = screen.getByPlaceholderText('Buscar usuário...');

      await user.type(busca, 'FERNANDA');
      expect(screen.getByText('Fernanda Costa')).toBeInTheDocument();
      expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument();

      await user.clear(busca);
      await user.type(busca, 'admin@');
      expect(screen.getByText('Carlos Mendes')).toBeInTheDocument();
    });

    it('mostra mensagem quando nada é encontrado', async () => {
      const { user } = renderizar();

      await user.type(screen.getByPlaceholderText('Buscar usuário...'), 'zzzz');

      expect(screen.getByText('Nenhum usuário encontrado.')).toBeInTheDocument();
    });
  });

  describe('ativar e desativar (RN05)', () => {
    it('desativa um usuário ativo e atualiza o resumo', async () => {
      const { user } = renderizar();

      await user.click(within(cartaoDoUsuario('Ana Silva')).getByRole('button', { name: 'Desativar' }));

      expect(within(cartaoDoUsuario('Ana Silva')).getByText('INATIVO')).toBeInTheDocument();
      expect(within(cartaoDoUsuario('Ana Silva')).getByRole('button', { name: 'Ativar' })).toBeInTheDocument();
      expect(screen.getByText('7 usuários · 5 ativos')).toBeInTheDocument();
    });

    it('reativa um usuário inativo', async () => {
      const { user } = renderizar();

      await user.click(within(cartaoDoUsuario('Pedro Nunes')).getByRole('button', { name: 'Ativar' }));

      expect(within(cartaoDoUsuario('Pedro Nunes')).queryByText('INATIVO')).not.toBeInTheDocument();
      expect(screen.getByText('7 usuários · 7 ativos')).toBeInTheDocument();
    });
  });

  describe('adicionar usuário', () => {
    it('cadastra um usuário ativo no topo da lista, com iniciais geradas a partir do nome', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));
      expect(screen.getByRole('heading', { name: 'Adicionar Usuário' })).toBeInTheDocument();

      await preencherFormulario(user, { nome: 'Maria Oliveira Souza', email: 'maria@hospitalcentral.br' });
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      const cartao = cartaoDoUsuario('Maria Oliveira Souza');
      expect(within(cartao).getByText('MO')).toBeInTheDocument(); // só as duas primeiras iniciais
      expect(within(cartao).getByText('Enf. Instrumentador(a)')).toBeInTheDocument(); // perfil padrão
      expect(within(cartao).getByText('Turno A')).toBeInTheDocument(); // turno padrão
      expect(screen.getByText('8 usuários · 7 ativos')).toBeInTheDocument();
    });

    it('permite escolher o perfil e o turno', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));
      const [campoPerfil, campoTurno] = screen.getAllByRole('combobox');

      await preencherFormulario(user, { nome: 'Bruno Alves', email: 'bruno@hospitalcentral.br' });
      await user.selectOptions(campoPerfil, 'admin');
      await user.selectOptions(campoTurno, 'Administrativo');
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      const cartao = cartaoDoUsuario('Bruno Alves');
      expect(within(cartao).getByText('Administrador')).toBeInTheDocument();
      expect(within(cartao).getByText('Administrativo')).toBeInTheDocument();
    });

    it('gera iniciais mesmo com espaços extras no nome', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));
      await preencherFormulario(user, { nome: '  joão   pedro  silva', email: 'joao@h.br' });
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(within(cartaoDoUsuario('joão pedro silva')).getByText('JP')).toBeInTheDocument();
    });

    it('usa uma única inicial quando o nome tem uma só palavra', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));
      await preencherFormulario(user, { nome: 'Madonna', email: 'madonna@h.br' });
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(within(cartaoDoUsuario('Madonna')).getByText('M')).toBeInTheDocument();
    });

    it('não cadastra sem nome ou com e-mail inválido', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));

      await preencherFormulario(user, { email: 'isto-nao-e-email' });
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(screen.getByRole('heading', { name: 'Adicionar Usuário' })).toBeInTheDocument();
      expect(screen.getByText('7 usuários · 6 ativos')).toBeInTheDocument();
    });

    it('"Cancelar" fecha o modal sem cadastrar', async () => {
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: /Adicionar usuário/ }));
      await preencherFormulario(user, { nome: 'Fulano', email: 'f@h.br' });

      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('heading', { name: 'Adicionar Usuário' })).not.toBeInTheDocument();
      expect(screen.queryByText('Fulano')).not.toBeInTheDocument();
    });
  });

  describe('editar usuário', () => {
    it('abre o formulário preenchido e salva as alterações sem duplicar o usuário', async () => {
      const { user } = renderizar();
      await user.click(within(cartaoDoUsuario('Fernanda Costa')).getByRole('button', { name: 'Editar' }));
      expect(screen.getByRole('heading', { name: 'Editar Usuário' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('Fernanda Costa')).toBeInTheDocument();

      await user.selectOptions(screen.getAllByRole('combobox')[1], 'Turno C');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(within(cartaoDoUsuario('Fernanda Costa')).getByText('Turno C')).toBeInTheDocument();
      expect(screen.getByText('7 usuários · 6 ativos')).toBeInTheDocument();
    });

    it('recalcula as iniciais quando o nome muda', async () => {
      const { user } = renderizar();
      await user.click(within(cartaoDoUsuario('Mariana Torres')).getByRole('button', { name: 'Editar' }));
      const campoNome = screen.getByDisplayValue('Mariana Torres');

      await user.clear(campoNome);
      await user.type(campoNome, 'Zélia Barros');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(within(cartaoDoUsuario('Zélia Barros')).getByText('ZB')).toBeInTheDocument();
    });

    it.fails('editar um usuário inativo não deveria reativá-lo (hoje o formulário grava sempre status "active")', async () => {
      const { user } = renderizar();
      expect(within(cartaoDoUsuario('Pedro Nunes')).getByText('INATIVO')).toBeInTheDocument(); // pré-condição

      await user.click(within(cartaoDoUsuario('Pedro Nunes')).getByRole('button', { name: 'Editar' }));
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      // Esperado: continua inativo, pois só o botão Ativar/Desativar deveria mudar o status.
      expect(within(cartaoDoUsuario('Pedro Nunes')).getByText('INATIVO')).toBeInTheDocument();
    });
  });
});
