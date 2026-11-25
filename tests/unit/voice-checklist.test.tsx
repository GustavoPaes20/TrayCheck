import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceChecklist from '@/components/VoiceChecklist';
import { USUARIOS_DEMONSTRACAO, kitsPorCirurgia } from '@/data/mockData';
import { ReconhecimentoDeVozFalso, aguardarFala, aguardarMicrofoneAberto, instalarVozFalsa, responderPorVoz } from '../helpers/voz';

const enfermeira = USUARIOS_DEMONSTRACAO['ana.silva@hospitalcentral.br'];
// Apendicectomia: 6 itens — Luvas Estéreis (7.0), Bisturi nº 22, Grasper Laparoscópico,
// Endoloop Cirúrgico, Trocarte 10mm, CO2 Medicinal
const itensDaApendicectomia = kitsPorCirurgia.apendicite;

function renderizar(idCirurgia = 'apendicite') {
  const voltarAoPainel = vi.fn();
  const utilitarios = render(<VoiceChecklist usuario={enfermeira} idCirurgiaInicial={idCirurgia} voltarAoPainel={voltarAoPainel} />);
  return { ...utilitarios, voltarAoPainel, user: userEvent.setup() };
}

/** Botão de filtro do topo da lista (ex.: "Pendentes6"). Não confunde com os botões de ação dos itens. */
function filtro(rotulo: 'Todos' | 'Pendentes' | 'Confirmados' | 'Faltando') {
  return screen.getByRole('button', { name: new RegExp(`^${rotulo}\\s*\\d+$`) });
}

function esperarContagens({ pendentes, confirmados, faltando }: { pendentes: number; confirmados: number; faltando: number }) {
  expect(filtro('Pendentes')).toHaveTextContent(new RegExp(`Pendentes\\s*${pendentes}$`));
  expect(filtro('Confirmados')).toHaveTextContent(new RegExp(`Confirmados\\s*${confirmados}$`));
  expect(filtro('Faltando')).toHaveTextContent(new RegExp(`Faltando\\s*${faltando}$`));
}

async function ativarMicrofone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));
  return aguardarMicrofoneAberto(); // o microfone só abre depois que o assistente termina de perguntar
}

describe('VoiceChecklist — conferência por voz', () => {
  let voz: ReturnType<typeof instalarVozFalsa>;

  beforeEach(() => {
    voz = instalarVozFalsa();
  });

  describe('estado inicial', () => {
    it('lista todos os itens do kit da cirurgia, todos pendentes', () => {
      renderizar();

      for (const item of itensDaApendicectomia) {
        expect(screen.getByText(item.name)).toBeInTheDocument();
      }
      esperarContagens({ pendentes: itensDaApendicectomia.length, confirmados: 0, faltando: 0 });
      expect(filtro('Todos')).toHaveTextContent(`${itensDaApendicectomia.length}`);
    });

    it('exibe a instrução de uso até a conferência começar', () => {
      renderizar();
      expect(screen.getByText(/Toque no/)).toBeInTheDocument();
    });

    it('mantém "Finalizar" desabilitado antes de iniciar a conferência', () => {
      renderizar();
      expect(screen.getByRole('button', { name: 'Finalizar' })).toBeDisabled();
    });

    it('troca o kit ao selecionar outra cirurgia', async () => {
      const { user } = renderizar();

      await user.selectOptions(screen.getByRole('combobox'), 'joelho');

      expect(await screen.findByText('Artroscópio 4mm')).toBeInTheDocument();
      esperarContagens({ pendentes: kitsPorCirurgia.joelho.length, confirmados: 0, faltando: 0 });
    });

    it('oferece todas as cirurgias cadastradas na lista de seleção', () => {
      renderizar();
      expect(within(screen.getByRole('combobox')).getAllByRole('option')).toHaveLength(6);
    });
  });

  describe('confirmação manual por toque (RNF02)', () => {
    it('confirmar um item atualiza as contagens e registra o horário', async () => {
      const { user } = renderizar();

      await user.click(screen.getAllByTitle('Confirmar')[0]);

      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
      expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
    });

    it('marcar como faltante sinaliza a divergência no item e no painel de itens em falta (RF08)', async () => {
      const { user } = renderizar();

      await user.click(screen.getAllByTitle('Faltando')[0]);

      esperarContagens({ pendentes: 5, confirmados: 0, faltando: 1 });
      expect(screen.getByText(/FALTANDO: Luvas Estéreis \(7\.0\)/)).toBeInTheDocument();
      expect(screen.getByText('Itens em falta')).toBeInTheDocument();
    });

    it('"Desfazer" devolve o item para pendente', async () => {
      const { user } = renderizar();
      await user.click(screen.getAllByTitle('Confirmar')[0]);

      await user.click(screen.getByRole('button', { name: 'Desfazer' }));

      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('o círculo do item alterna entre pendente e confirmado', async () => {
      const { user } = renderizar();
      const cartaoDoPrimeiroItem = screen.getByText('Luvas Estéreis (7.0)').closest('.rounded-2xl') as HTMLElement;
      const circulo = within(cartaoDoPrimeiroItem).getAllByRole('button')[0];

      await user.click(circulo);
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });

      await user.click(circulo);
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('os filtros mostram apenas os itens do status escolhido', async () => {
      const { user } = renderizar();
      await user.click(screen.getAllByTitle('Confirmar')[0]); // Luvas
      await user.click(screen.getAllByTitle('Faltando')[0]); // Bisturi

      await user.click(filtro('Confirmados'));
      expect(screen.getByText('Luvas Estéreis (7.0)')).toBeInTheDocument();
      expect(screen.queryByText('Grasper Laparoscópico')).not.toBeInTheDocument();

      await user.click(filtro('Pendentes'));
      expect(screen.queryByText('Luvas Estéreis (7.0)')).not.toBeInTheDocument();
      expect(screen.getByText('Grasper Laparoscópico')).toBeInTheDocument();
    });

    it('mostra uma mensagem quando o filtro não tem itens', async () => {
      const { user } = renderizar();

      await user.click(filtro('Confirmados'));

      expect(screen.getByText('Nenhum item nesta categoria')).toBeInTheDocument();
    });

    it('cada item exibe nome, quantidade, unidade e categoria', () => {
      renderizar();
      const cartao = screen.getByText('Grasper Laparoscópico').closest('.rounded-2xl') as HTMLElement;

      expect(within(cartao).getByText('2 unid')).toBeInTheDocument();
      expect(within(cartao).getByText('Instrumental')).toBeInTheDocument();
      expect(within(cartao).getByText('CRITICO')).toBeInTheDocument();
    });
  });

  describe('comandos Pular / Repetir (RF07)', () => {
    it('"Pular" marca o primeiro item pendente como faltante e avisa por voz', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Pular' }));

      esperarContagens({ pendentes: 5, confirmados: 0, faltando: 1 });
      expect(screen.getByText(/FALTANDO: Luvas Estéreis \(7\.0\)/)).toBeInTheDocument();
      expect(voz.falas).toContain('Item pulado: Luvas Estéreis 7,0. Marcado como faltando. Próximo: Bisturi número 22.');
    });

    it('"Pular" avança pelos itens na ordem do kit', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Pular' }));
      await user.click(screen.getByRole('button', { name: 'Pular' }));

      expect(screen.getByText(/FALTANDO: Luvas Estéreis \(7\.0\)/)).toBeInTheDocument();
      expect(screen.getByText(/FALTANDO: Bisturi nº 22/)).toBeInTheDocument();
    });

    it('"Repetir" lê o nome, a quantidade e a unidade do item pendente', async () => {
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Repetir' }));

      expect(voz.falas).toContain('Luvas Estéreis 7,0, 3 pares.');
    });

    it('"Pular" e "Repetir" continuam habilitados enquanto houver item pendente', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);
      for (let i = 0; i < itensDaApendicectomia.length - 1; i++) {
        await user.click(screen.getAllByTitle('Confirmar')[0]);
      }

      esperarContagens({ pendentes: 1, confirmados: 5, faltando: 0 });
      expect(screen.getByRole('button', { name: 'Pular' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Repetir' })).toBeEnabled();
    });

    it('"Repetir" anuncia o item pendente seguinte depois que o anterior foi confirmado', async () => {
      const { user } = renderizar();
      await user.click(screen.getAllByTitle('Confirmar')[0]); // Luvas

      await user.click(screen.getByRole('button', { name: 'Repetir' }));

      expect(voz.falas).toContain('Bisturi número 22, 1 unidade.');
    });
  });

  describe('diálogo por voz: anunciar → ouvir → registrar (RF06, RF07, RNF03, RNF07)', () => {
    it('avisa na tela e não inicia quando o navegador não suporta reconhecimento de voz', async () => {
      vi.stubGlobal('SpeechRecognition', undefined);
      vi.stubGlobal('webkitSpeechRecognition', undefined);
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/não suportado neste navegador/);
      expect(ReconhecimentoDeVozFalso.instancias).toHaveLength(0);
      expect(screen.getByText('Microfone indisponível')).toBeInTheDocument();
    });

    it('sem microfone (ou permissão negada) a conferência continua e pode ser concluída só por toque', async () => {
      vi.stubGlobal('SpeechRecognition', undefined);
      vi.stubGlobal('webkitSpeechRecognition', undefined);
      const { user } = renderizar();
      await user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));
      await screen.findByRole('alert');

      expect(screen.getByRole('button', { name: 'Finalizar' })).toBeEnabled();
      for (let i = 0; i < itensDaApendicectomia.length; i++) await user.click(screen.getAllByTitle('Confirmar')[0]);

      expect(await screen.findByRole('heading', { name: 'Kit Completo!' })).toBeInTheDocument();
    });

    it('anuncia o primeiro item com a pergunta e só então abre o microfone (pt-BR, uma resposta por vez)', async () => {
      const { user } = renderizar();

      const reconhecimento = await ativarMicrofone(user);

      expect(voz.falas[0]).toBe('Iniciando conferência de Apendicectomia. Primeiro item: Luvas Estéreis 7,0, 3 pares. Está disponível?');
      expect(reconhecimento.lang).toBe('pt-BR');
      expect(reconhecimento.continuous).toBe(false);
      expect(reconhecimento.interimResults).toBe(false);
      expect(screen.getAllByText('Ouvindo...').length).toBeGreaterThan(0);
    });

    it('o microfone NÃO abre enquanto o assistente está falando; abre quando a fala termina', async () => {
      voz.segurarFala();
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));
      await aguardarFala(voz.falas, 'Primeiro item');

      expect(screen.getByText('Assistente falando...')).toBeInTheDocument();
      expect(ReconhecimentoDeVozFalso.aberturas).toBe(0);

      voz.terminarFala();
      const reconhecimento = await aguardarMicrofoneAberto();

      expect(reconhecimento.iniciado).toBe(true);
      expect(screen.getAllByText('Ouvindo...').length).toBeGreaterThan(0);
    });

    it('"Sim, temos" confirma o item atual, o assistente confirma por voz e anuncia o próximo', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('Sim, temos');

      await aguardarFala(voz.falas, 'Bisturi número 22, 1 unidade. Está disponível?');
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
      expect(voz.falas).toContain('Conferido.');
      expect(screen.getByText('Detectado:')).toBeInTheDocument();
      expect(screen.getAllByText('→ disponível').length).toBeGreaterThan(0);
    });

    it('"Não temos" registra o item como faltante e o diálogo segue para o próximo', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('Não temos');

      await aguardarFala(voz.falas, 'Bisturi número 22, 1 unidade. Está disponível?');
      esperarContagens({ pendentes: 5, confirmados: 0, faltando: 1 });
      expect(screen.getByText(/FALTANDO: Luvas Estéreis \(7\.0\)/)).toBeInTheDocument();
      expect(voz.falas).toContain('Registrado como faltante.');
    });

    it.each(['Não tem', 'Falta', 'Está faltando', 'Indisponível', 'Negativo', 'Nada'])('"%s" registra como faltante', async (resposta) => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz(resposta);

      await aguardarFala(voz.falas, 'Registrado como faltante.');
      esperarContagens({ pendentes: 5, confirmados: 0, faltando: 1 });
    });

    it.each(['Tem', 'Temos', 'Luvas, temos', 'Checado', 'Check', 'Certo', 'Afirmativo', 'Confirmado'])('"%s" confirma o item', async (resposta) => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz(resposta);

      await aguardarFala(voz.falas, 'Conferido.');
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
    });

    it('palavra positiva dentro de frase negativa nunca confirma ("não temos, só tem a tesoura")', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('não temos, só tem a tesoura');

      await aguardarFala(voz.falas, 'Registrado como faltante.');
      esperarContagens({ pendentes: 5, confirmados: 0, faltando: 1 });
    });

    it('resposta inconclusiva ("Acho que sim") NÃO registra: o assistente pede confirmação clara', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('Acho que sim');

      await aguardarFala(voz.falas, 'Não consegui confirmar. Luvas Estéreis 7,0 está disponível?');
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
      expect(screen.getAllByText('→ não confirmado').length).toBeGreaterThan(0);

      await responderPorVoz('Sim');
      await aguardarFala(voz.falas, 'Conferido.');
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
    });

    it('falar o nome de OUTRO item não confirma o item atual', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('bisturi');

      await aguardarFala(voz.falas, 'Não consegui confirmar.');
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('conversa fora do assunto não confirma nada', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('bom dia a todos');

      await aguardarFala(voz.falas, 'Não consegui confirmar.');
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
      expect(voz.falas).not.toContain('Conferido.');
    });

    it('sem resposta (silêncio): o assistente pergunta de novo e não registra nada', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);

      reconhecimento.encerrarSemFala();

      await aguardarFala(voz.falas, 'Não ouvi a resposta. Luvas Estéreis 7,0 está disponível?');
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('resposta duplicada do reconhecedor na mesma escuta confirma UM item só', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);

      reconhecimento.falar('sim');
      reconhecimento.falar('sim');
      reconhecimento.falar('sim');

      await aguardarFala(voz.falas, 'Bisturi número 22');
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
    });

    it('o eco da própria pergunta ("…está disponível?") é ignorado e não confirma o item', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);

      reconhecimento.falar('Luvas Estéreis 7,0, 3 pares. Está disponível?'); // o microfone "ouviu" o assistente

      const novaEscuta = await vi.waitFor(() => {
        expect(ReconhecimentoDeVozFalso.ultima()).not.toBe(reconhecimento);
        return ReconhecimentoDeVozFalso.ultima();
      });
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
      expect(voz.falas.filter((fala) => fala.includes('Está disponível?'))).toHaveLength(1); // não perguntou de novo
      expect(novaEscuta.iniciado).toBe(true);
    });

    it('baixa confiança do reconhecedor numa resposta positiva não confirma', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('sim', 0.3);

      await aguardarFala(voz.falas, 'Não consegui confirmar.');
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('três respostas ruins seguidas pausam o assistente sem registrar nada e orientam o uso dos botões', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      await responderPorVoz('talvez');
      await responderPorVoz('hum');
      await responderPorVoz('não sei');

      expect(await screen.findByRole('alert')).toHaveTextContent(/Use os botões na tela/);
      expect(screen.getByText('Assistente pausado')).toBeInTheDocument();
      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('"Pausar Microfone" fecha o microfone na hora e interrompe o diálogo', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);

      await user.click(screen.getByRole('button', { name: 'Pausar Microfone' }));

      expect(reconhecimento.iniciado).toBe(false);
      expect(screen.getByText('Assistente pausado')).toBeInTheDocument();
      expect(voz.falas).toContain('Microfone pausado.');
    });

    it('resposta que chega depois de pausar é descartada', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);

      await user.click(screen.getByRole('button', { name: 'Pausar Microfone' }));
      reconhecimento.falar('sim');

      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('permissão do microfone negada: mostra mensagem clara e mantém os itens já conferidos', async () => {
      const { user } = renderizar();
      await user.click(screen.getAllByTitle('Confirmar')[0]); // item já conferido por toque
      const reconhecimento = await ativarMicrofone(user);

      reconhecimento.falharComErro('not-allowed');

      expect(await screen.findByRole('alert')).toHaveTextContent(/acesso ao microfone foi negado/);
      expect(screen.getByText('Microfone indisponível')).toBeInTheDocument();
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
    });

    it('permissão negada ANTES de começar (getUserMedia) não inicia o diálogo', async () => {
      vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) } });
      const { user } = renderizar();

      await user.click(screen.getByRole('button', { name: 'Ativar Microfone' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/acesso ao microfone foi negado/);
      expect(ReconhecimentoDeVozFalso.instancias).toHaveLength(0);
      expect(voz.falas).toHaveLength(0);
    });

    it('ação manual durante a conversa descarta o turno atual e anuncia o item pendente certo', async () => {
      const { user } = renderizar();
      const primeiraEscuta = await ativarMicrofone(user);

      await user.click(screen.getAllByTitle('Confirmar')[0]); // toque confirma "Luvas" enquanto o assistente ouvia

      await aguardarFala(voz.falas, 'Bisturi número 22, 1 unidade. Está disponível?');
      expect(primeiraEscuta.iniciado).toBe(false);
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
      primeiraEscuta.falar('sim'); // resposta do turno antigo chegando tarde
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
    });

    it('responder todos os itens por voz conclui a conferência', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      for (let i = 0; i < itensDaApendicectomia.length; i++) await responderPorVoz('sim, temos');

      expect(await screen.findByRole('heading', { name: 'Kit Completo!' })).toBeInTheDocument();
      expect(screen.getByText(/Todos os 6 itens foram confirmados/)).toBeInTheDocument();
      await aguardarFala(voz.falas, 'Conferência concluída.');
    });

    it('"Modo Demo" fica desabilitado enquanto o assistente conversa', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);

      expect(screen.getByRole('button', { name: 'Modo Demo' })).toBeDisabled();
    });
  });

  describe('conclusão e divergências (RF08, RF09, RN04)', () => {
    async function conferirTudoExcetoUmFaltante() {
      const contexto = renderizar();
      await ativarMicrofone(contexto.user);
      await contexto.user.click(screen.getAllByTitle('Faltando')[0]); // Luvas → faltante
      for (let i = 0; i < itensDaApendicectomia.length - 1; i++) {
        await contexto.user.click(screen.getAllByTitle('Confirmar')[0]);
      }
      return contexto;
    }

    it('conclui automaticamente quando todos os itens foram tratados e destaca o item faltante', async () => {
      await conferirTudoExcetoUmFaltante();

      expect(await screen.findByRole('heading', { name: 'Itens Faltando!' })).toBeInTheDocument();
      expect(screen.getByText(/5 itens OK/)).toBeInTheDocument();
      expect(screen.getByText('Itens em falta:')).toBeInTheDocument();
      expect(screen.getByText('Luvas Estéreis (7.0)')).toBeInTheDocument();
      expect(screen.getByText('CRITICO')).toBeInTheDocument(); // luvas é item crítico
    });

    it('conclui sem divergência quando todos os itens foram confirmados', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);
      for (let i = 0; i < itensDaApendicectomia.length; i++) {
        await user.click(screen.getAllByTitle('Confirmar')[0]);
      }

      expect(await screen.findByRole('heading', { name: 'Kit Completo!' })).toBeInTheDocument();
      expect(screen.queryByText('Itens em falta:')).not.toBeInTheDocument();
    });

    it('"Nova Conferencia" reinicia o checklist com todos os itens pendentes', async () => {
      const { user } = await conferirTudoExcetoUmFaltante();
      await screen.findByRole('heading', { name: 'Itens Faltando!' });

      await user.click(screen.getByRole('button', { name: 'Nova Conferencia' }));

      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
    });

    it('"Voltar ao Dashboard" reinicia e chama o retorno ao painel', async () => {
      const { user, voltarAoPainel } = await conferirTudoExcetoUmFaltante();
      await screen.findByRole('heading', { name: 'Itens Faltando!' });

      await user.click(screen.getByRole('button', { name: 'Voltar ao Dashboard' }));

      expect(voltarAoPainel).toHaveBeenCalledTimes(1);
    });

    it('"Reiniciar" (ícone do topo) limpa o progresso da conferência', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);
      await responderPorVoz('sim');

      await user.click(screen.getByTitle('Reiniciar'));

      esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });
      expect(reconhecimento.iniciado).toBe(false);
    });

    it('"Finalizar" encerra o reconhecimento, anuncia o resultado por voz e abre a tela de conclusão', async () => {
      const { user } = renderizar();
      const reconhecimento = await ativarMicrofone(user);
      await user.click(screen.getByRole('button', { name: 'Pular' })); // Luvas → faltante
      await responderPorVoz('sim'); // Bisturi → disponível

      await user.click(screen.getByRole('button', { name: 'Finalizar' }));

      expect(reconhecimento.iniciado).toBe(false);
      expect(voz.falas).toContain('Conferência finalizada com 1 item faltando.');
      expect(screen.getByRole('heading', { name: 'Itens Faltando!' })).toBeInTheDocument();
    });
  });

  describe('regras do documento de requisitos ainda não atendidas', () => {
    /*
     * Os dois testes abaixo descrevem o comportamento ESPERADO pelo documento de requisitos
     * e estão marcados com `it.fails`: hoje o app não o cumpre, então o teste "falha como esperado"
     * e o CI continua verde. Quando o defeito for corrigido, o teste passará a passar de verdade,
     * o Vitest o apontará como erro e bastará trocar `it.fails` por `it`.
     */

    it.fails('RN01: não deveria permitir finalizar com itens ainda pendentes', async () => {
      const { user } = renderizar();
      await ativarMicrofone(user);
      await user.click(screen.getAllByTitle('Confirmar')[0]);
      esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 }); // pré-condição (deve passar)

      await user.click(screen.getByRole('button', { name: 'Finalizar' }));

      // Esperado: continua na lista, pois ainda há 5 itens sem tratamento.
      expect(screen.queryByRole('heading', { name: /Kit Completo!|Itens Faltando!/ })).not.toBeInTheDocument();
    });

    it.fails('RNF02: deveria permitir concluir a checagem apenas por toque, sem ativar o microfone', async () => {
      const { user } = renderizar();
      for (let i = 0; i < itensDaApendicectomia.length; i++) {
        await user.click(screen.getAllByTitle('Confirmar')[0]);
      }
      esperarContagens({ pendentes: 0, confirmados: 6, faltando: 0 }); // pré-condição (deve passar)

      // Esperado: a conferência é concluída (o fallback manual não pode depender do microfone).
      expect(await screen.findByRole('heading', { name: 'Kit Completo!' }, { timeout: 500 })).toBeInTheDocument();
    });
  });
});

describe('VoiceChecklist — Modo Demo', () => {
  beforeEach(() => {
    instalarVozFalsa();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  // `user-event` trava com o relógio falso do Vitest; aqui o foco é o temporizador, então usamos `fireEvent`.
  function renderizarComRelogioFalso() {
    const utilitarios = render(<VoiceChecklist usuario={enfermeira} idCirurgiaInicial="apendicite" />);
    const clicar = (nome: string) => fireEvent.click(screen.getByRole('button', { name: nome }));
    return { ...utilitarios, clicar };
  }

  it('confirma um item por vez, em intervalos, até concluir o kit', async () => {
    const { clicar } = renderizarComRelogioFalso();

    clicar('Modo Demo');
    esperarContagens({ pendentes: 6, confirmados: 0, faltando: 0 });

    await act(() => vi.advanceTimersByTimeAsync(800));
    esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });

    await act(() => vi.advanceTimersByTimeAsync(1800));
    esperarContagens({ pendentes: 4, confirmados: 2, faltando: 0 });

    await act(() => vi.advanceTimersByTimeAsync(1800 * 4));
    expect(screen.getByRole('heading', { name: 'Kit Completo!' })).toBeInTheDocument();
  });

  it('"Parar Demo" interrompe as confirmações automáticas', async () => {
    const { clicar } = renderizarComRelogioFalso();
    clicar('Modo Demo');
    await act(() => vi.advanceTimersByTimeAsync(800));

    clicar('Parar Demo');
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    esperarContagens({ pendentes: 5, confirmados: 1, faltando: 0 });
    expect(screen.getByRole('button', { name: 'Modo Demo' })).toBeInTheDocument();
  });

  it('o Modo Demo não sobrescreve itens já marcados como faltantes', async () => {
    const { clicar } = renderizarComRelogioFalso();
    clicar('Pular'); // Luvas → faltante

    clicar('Modo Demo');
    await act(() => vi.advanceTimersByTimeAsync(800 + 1800 * 5));

    expect(screen.getByRole('heading', { name: 'Itens Faltando!' })).toBeInTheDocument();
    expect(screen.getByText(/5 itens OK/)).toBeInTheDocument();
  });
});
