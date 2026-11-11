import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Login from '@/components/Login';
import { CONTAS_DEMONSTRACAO, USUARIOS_DEMONSTRACAO } from '@/data/mockData';

function renderizar() {
  const aoEntrar = vi.fn();
  render(<Login aoEntrar={aoEntrar} />);
  return { aoEntrar, user: userEvent.setup() };
}

async function entrar(user: ReturnType<typeof userEvent.setup>, email: string, senha: string) {
  await user.type(screen.getByPlaceholderText('nome@hospitalcentral.br'), email);
  await user.type(screen.getByPlaceholderText('••••••••'), senha);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Login (modo demonstração) — RF01', () => {
  it('exibe o formulário de acesso com e-mail e senha', () => {
    renderizar();

    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('nome@hospitalcentral.br')).toHaveAttribute('type', 'email');
    expect(screen.getByPlaceholderText('••••••••')).toHaveAttribute('type', 'password');
  });

  it.each(CONTAS_DEMONSTRACAO)('autentica a conta de demonstração "$label" ($role)', async ({ email, password, role }) => {
    const { aoEntrar, user } = renderizar();

    await entrar(user, email, password);

    expect(aoEntrar).toHaveBeenCalledTimes(1);
    expect(aoEntrar).toHaveBeenCalledWith(USUARIOS_DEMONSTRACAO[email]);
    expect(aoEntrar.mock.calls[0][0].role).toBe(role);
  });

  it('rejeita senha incorreta com mensagem de erro e sem autenticar', async () => {
    const { aoEntrar, user } = renderizar();

    await entrar(user, 'ana.silva@hospitalcentral.br', 'senha-errada');

    expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(aoEntrar).not.toHaveBeenCalled();
  });

  it('rejeita e-mail desconhecido', async () => {
    const { aoEntrar, user } = renderizar();

    await entrar(user, 'ninguem@hospitalcentral.br', 'senha123');

    expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(aoEntrar).not.toHaveBeenCalled();
  });

  it('não permite usar a senha de uma conta com o e-mail de outra', async () => {
    const { aoEntrar, user } = renderizar();

    await entrar(user, 'admin@hospitalcentral.br', 'senha123'); // senha da enfermeira

    expect(aoEntrar).not.toHaveBeenCalled();
  });

  it('limpa a mensagem de erro em uma nova tentativa bem-sucedida', async () => {
    const { aoEntrar, user } = renderizar();
    await entrar(user, 'ana.silva@hospitalcentral.br', 'errada');
    expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('••••••••'));
    await user.type(screen.getByPlaceholderText('••••••••'), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.queryByText('E-mail ou senha incorretos.')).not.toBeInTheDocument();
    expect(aoEntrar).toHaveBeenCalledTimes(1);
  });

  it('não envia o formulário com campos vazios', async () => {
    const { aoEntrar, user } = renderizar();

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(aoEntrar).not.toHaveBeenCalled();
    expect(screen.queryByText('E-mail ou senha incorretos.')).not.toBeInTheDocument();
  });

  it('alterna a visibilidade da senha', async () => {
    const { user } = renderizar();
    const campoDeSenha = screen.getByPlaceholderText('••••••••');
    const botaoDeVisibilidade = screen.getAllByRole('button').find((botao) => botao.getAttribute('type') === 'button');

    await user.click(botaoDeVisibilidade!);
    expect(campoDeSenha).toHaveAttribute('type', 'text');

    await user.click(botaoDeVisibilidade!);
    expect(campoDeSenha).toHaveAttribute('type', 'password');
  });
});
