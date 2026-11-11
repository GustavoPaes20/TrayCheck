import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { CONTAS_DEMONSTRACAO } from '@/data/mockData';
import { ReconhecimentoDeVozFalso, instalarVozFalsa } from '../helpers/voz';

const conta = (papel: 'nurse' | 'technician' | 'admin') => CONTAS_DEMONSTRACAO.find((c) => c.role === papel)!;

function renderizar() {
  return { ...render(<App />), user: userEvent.setup() };
}

async function fazerLogin(user: ReturnType<typeof userEvent.setup>, papel: 'nurse' | 'technician' | 'admin') {
  const { email, password } = conta(papel);
  await user.type(screen.getByPlaceholderText('nome@hospitalcentral.br'), email);
  await user.type(screen.getByPlaceholderText('••••••••'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

/** A navegação lateral (desktop) existe uma única vez no DOM; a barra inferior móvel repete alguns rótulos. */
function menuLateral() {
  return within(screen.getByRole('complementary'));
}

/** Título da barra superior (as próprias telas também têm um <h1>, por isso o escopo no cabeçalho). */
function tituloDaTela() {
  return within(screen.getByRole('banner')).getByRole('heading', { level: 1 });
}

/** O botão de "Conferência por Voz" tem o selo "PRINCIPAL" no nome acessível. */
const nomeDoMenu = (rotulo: string) => new RegExp(`^${rotulo}`);

describe('App (modo demonstração) — fluxos completos', () => {
  beforeEach(() => {
    instalarVozFalsa();
  });

  describe('autenticação e sessão (RF01)', () => {
    it('inicia na tela de login e não expõe o sistema sem autenticação', () => {
      renderizar();

      expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('mantém o usuário na tela de login quando as credenciais são inválidas', async () => {
      const { user } = renderizar();

      await user.type(screen.getByPlaceholderText('nome@hospitalcentral.br'), 'ana.silva@hospitalcentral.br');
      await user.type(screen.getByPlaceholderText('••••••••'), 'errada');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument();
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('após o login, abre o dashboard saudando o usuário pelo primeiro nome', async () => {
      const { user } = renderizar();

      await fazerLogin(user, 'nurse');

      expect(tituloDaTela()).toHaveTextContent('Dashboard');
      expect(screen.getByRole('heading', { name: /^(Bom dia|Boa tarde|Boa noite), Ana\.$/ })).toBeInTheDocument();
    });

    it('"Sair" encerra a sessão e volta ao login; um novo login começa no dashboard', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');
      await user.click(menuLateral().getByRole('button', { name: 'Estoque' }));
      expect(tituloDaTela()).toHaveTextContent('Estoque');

      await user.click(menuLateral().getByRole('button', { name: 'Sair' }));

      expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
      await fazerLogin(user, 'technician');
      expect(tituloDaTela()).toHaveTextContent('Dashboard');
    });
  });

  describe('controle de acesso por perfil (RN02, RN05)', () => {
    it.each(['nurse', 'technician'] as const)('o perfil %s não vê as opções de administração', async (papel) => {
      const { user } = renderizar();

      await fazerLogin(user, papel);

      expect(menuLateral().queryByText('Administração')).not.toBeInTheDocument();
      expect(menuLateral().queryByRole('button', { name: 'Gerenciar Estoque' })).not.toBeInTheDocument();
      expect(menuLateral().queryByRole('button', { name: 'Gerenciar Usuários' })).not.toBeInTheDocument();
      // mas mantém as funções operacionais
      for (const rotulo of ['Dashboard', 'Kits Cirúrgicos', 'Conferência por Voz', 'Estoque', 'Relatórios']) {
        expect(menuLateral().getByRole('button', { name: nomeDoMenu(rotulo) })).toBeInTheDocument();
      }
    });

    it('o administrador vê e acessa as telas de administração', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'admin');

      expect(menuLateral().getByText('Administração')).toBeInTheDocument();

      await user.click(menuLateral().getByRole('button', { name: 'Gerenciar Estoque' }));
      expect(tituloDaTela()).toHaveTextContent('Gerenciar Estoque');

      await user.click(menuLateral().getByRole('button', { name: 'Gerenciar Usuários' }));
      expect(tituloDaTela()).toHaveTextContent('Gerenciar Usuários');
      expect(screen.getByText('7 usuários · 6 ativos')).toBeInTheDocument();
    });

    it('exibe o nome e o rótulo do perfil do usuário no menu', async () => {
      const { user } = renderizar();

      await fazerLogin(user, 'technician');

      expect(menuLateral().getByText('Rafael Lima')).toBeInTheDocument();
      expect(menuLateral().getByText('Circulante')).toBeInTheDocument();
    });
  });

  describe('navegação', () => {
    it.each([
      { rotulo: 'Kits Cirúrgicos', titulo: 'Kits Cirúrgicos' },
      { rotulo: 'Conferência por Voz', titulo: 'Conferência por Voz' },
      { rotulo: 'Estoque', titulo: 'Estoque' },
      { rotulo: 'Relatórios', titulo: 'Relatórios de Conferência' },
    ])('abre "$rotulo" pelo menu lateral', async ({ rotulo, titulo }) => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');

      await user.click(menuLateral().getByRole('button', { name: nomeDoMenu(rotulo) }));

      expect(tituloDaTela()).toHaveTextContent(titulo);
    });

    it('abre o perfil pelo cartão do usuário', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');

      await user.click(menuLateral().getByText('Ana Silva'));

      expect(tituloDaTela()).toHaveTextContent('Meu Perfil');
    });

    it('o sino de alertas leva ao estoque e sinaliza itens críticos', async () => {
      const { user, container } = renderizar();
      await fazerLogin(user, 'nurse');
      expect(container.querySelector('.animate-blink')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ver alertas de estoque' }));

      expect(tituloDaTela()).toHaveTextContent('Estoque');
    });

    it('a barra inferior (mobile) navega entre as telas principais', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');
      const barraInferior = within(screen.getAllByRole('navigation').at(-1)!);

      await user.click(barraInferior.getByRole('button', { name: /Relatórios/ }));

      expect(tituloDaTela()).toHaveTextContent('Relatórios de Conferência');
    });
  });

  describe('jornada da checagem: do dashboard ao relatório (RF05–RF07)', () => {
    it('"Conferir" na programação do dia abre a conferência da cirurgia escolhida', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');

      const linhaDaApendicectomia = screen.getByText('Apendicectomia').closest<HTMLElement>('.group')!;
      await user.click(within(linhaDaApendicectomia).getByRole('button', { name: 'Conferir' }));

      expect(tituloDaTela()).toHaveTextContent('Conferência por Voz');
      expect(screen.getByRole('combobox')).toHaveValue('apendicite');
      expect(screen.getByText('Grasper Laparoscópico')).toBeInTheDocument();
    });

    it('"Conferir por Voz" na tela de kits abre a conferência do kit selecionado', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');
      await user.click(menuLateral().getByRole('button', { name: 'Kits Cirúrgicos' }));

      await user.click(screen.getAllByRole('button', { name: /Conferir por Voz/ })[0]);

      expect(tituloDaTela()).toHaveTextContent('Conferência por Voz');
      expect(screen.getByRole('combobox')).toHaveValue('joelho');
    });

    it('conduz a checagem por voz até o fim e retorna ao dashboard', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');
      const linhaDaApendicectomia = screen.getByText('Apendicectomia').closest<HTMLElement>('.group')!;
      await user.click(within(linhaDaApendicectomia).getByRole('button', { name: 'Conferir' }));

      await user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));
      const reconhecimento = ReconhecimentoDeVozFalso.ultima();
      reconhecimento.falar('luvas estéreis');
      reconhecimento.falar('bisturi');
      reconhecimento.falar('grasper');
      reconhecimento.falar('endoloop');
      reconhecimento.falar('trocarte');
      await user.click(screen.getAllByTitle('Faltando')[0]); // CO2 Medicinal não localizado: divergência

      expect(await screen.findByRole('heading', { name: 'Itens Faltando!' })).toBeInTheDocument();
      expect(screen.getByText('CO2 Medicinal')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Voltar ao Dashboard' }));

      expect(tituloDaTela()).toHaveTextContent('Dashboard');
    });

    it('trocar de tela no meio da conferência e voltar recomeça a checagem sem itens fantasma', async () => {
      const { user } = renderizar();
      await fazerLogin(user, 'nurse');
      await user.click(menuLateral().getByRole('button', { name: nomeDoMenu('Conferência por Voz') }));
      await user.click(screen.getAllByTitle('Confirmar')[0]);

      await user.click(menuLateral().getByRole('button', { name: 'Estoque' }));
      await user.click(menuLateral().getByRole('button', { name: nomeDoMenu('Conferência por Voz') }));

      expect(screen.getByRole('button', { name: /^Confirmados\s*0$/ })).toBeInTheDocument();
    });
  });

  describe('administração integrada', () => {
    it('no modo demonstração, um item cadastrado não persiste ao trocar de tela', async () => {
      // README: "as alterações ficam apenas em memória" — cada tela mantém seu próprio estado local.
      const { user } = renderizar();
      await fazerLogin(user, 'admin');
      await user.click(menuLateral().getByRole('button', { name: 'Gerenciar Estoque' }));
      await user.click(screen.getByRole('button', { name: /Adicionar item/ }));
      await user.type(screen.getByPlaceholderText('Ex: Luvas Estéreis 7.5'), 'Gaze Estéril');
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));
      expect(screen.getAllByText('Gaze Estéril').length).toBeGreaterThan(0);

      await user.click(menuLateral().getByRole('button', { name: 'Estoque' }));

      // Documenta o comportamento de demonstração: não há persistência entre telas.
      expect(screen.queryByText('Gaze Estéril')).not.toBeInTheDocument();
    });
  });
});
