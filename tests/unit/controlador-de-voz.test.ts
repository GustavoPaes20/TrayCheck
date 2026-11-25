import { describe, expect, it, vi } from 'vitest';
import {
  ControladorDaConferenciaPorVoz, FRASES, pareceEco,
  ajustesDeTempo, type EstadoDaVoz, type ItemParaConferir,
} from '@/voice/controlador';
import type { Falante } from '@/voice/falante';
import type { Reconhecedor, ResultadoDaEscuta } from '@/voice/reconhecedor';

// ── Dublês que DENUNCIAM sobreposição entre fala e microfone ─────────────────
class Cenario {
  constructor() { ajustesDeTempo.reaberturasSilenciosas = 0; } // cada teste liga a reabertura onde precisa
  eventos: string[] = [];
  violacoes: string[] = [];
  falando = false;
  microfoneAberto = false;
  falas: string[] = [];
  roteiro: Array<ResultadoDaEscuta | Promise<ResultadoDaEscuta>> = [];
  estados: Array<[EstadoDaVoz, string | undefined]> = [];
  registros: Array<[string, string]> = [];
  private resolverFala: (() => void) | null = null;
  private resolverEscuta: ((r: ResultadoDaEscuta) => void) | null = null;
  /** Se verdadeiro, a fala só termina quando o teste chamar `terminarFala()`. */
  segurarFala = false;

  itens: Array<ItemParaConferir & { status: 'pending' | 'confirmed' | 'missing' }> = [
    { id: 'a', nome: 'Pinça Kelly', nomeFalado: 'Pinça Kelly', anuncio: 'Pinça Kelly, 2 unidades', quantidade: 2, outrosNomes: ['Bisturi'], status: 'pending' },
    { id: 'b', nome: 'Bisturi', nomeFalado: 'Bisturi', anuncio: 'Bisturi, 1 unidade', quantidade: 1, outrosNomes: [], status: 'pending' },
  ];

  falante: Falante = {
    motor: null,
    falar: (texto) => {
      if (this.microfoneAberto) this.violacoes.push(`falou "${texto}" com o microfone aberto`);
      this.falando = true;
      this.falas.push(texto);
      this.eventos.push(`fala:${texto}`);
      if (!this.segurarFala) return Promise.resolve().then(() => { this.falando = false; });
      return new Promise<void>((resolver) => { this.resolverFala = () => { this.falando = false; resolver(); }; });
    },
    cancelar: () => { this.falando = false; this.resolverFala?.(); this.resolverFala = null; },
  };

  reconhecedor: Reconhecedor = {
    suportado: true,
    ouvir: (aoAbrir) => {
      if (this.falando) this.violacoes.push('abriu o microfone durante a fala do assistente');
      if (this.microfoneAberto) this.violacoes.push('abriu o microfone duas vezes');
      this.microfoneAberto = true;
      this.eventos.push('mic:abre');
      queueMicrotask(() => aoAbrir?.()); // o navegador começou a captar áudio
      const proximo = this.roteiro.shift();
      if (proximo) return Promise.resolve(proximo).then((r) => { this.microfoneAberto = false; return r; });
      return new Promise<ResultadoDaEscuta>((resolver) => { this.resolverEscuta = (r) => { this.microfoneAberto = false; resolver(r); }; });
    },
    cancelar: () => {
      if (this.microfoneAberto) this.eventos.push('mic:fecha');
      this.microfoneAberto = false;
      this.resolverEscuta?.({ tipo: 'cancelado' });
      this.resolverEscuta = null;
    },
  };

  controlador = new ControladorDaConferenciaPorVoz({
    falante: this.falante,
    reconhecedor: this.reconhecedor,
    obterItemAtual: () => this.itens.find((i) => i.status === 'pending') ?? null,
    registrar: (id, status) => {
      this.registros.push([id, status]);
      const item = this.itens.find((i) => i.id === id);
      if (item?.status === 'pending') item.status = status;
    },
    aoMudarEstado: (estado, detalhe) => this.estados.push([estado, detalhe]),
    esperar: async () => {},
  });

  terminarFala() { this.falando = false; this.resolverFala?.(); this.resolverFala = null; }
  ouvirDe(...respostas: string[]) { this.roteiro.push(...respostas.map((t) => ({ tipo: 'fala' as const, alternativas: [{ transcript: t, confidence: 0.9 }] }))); }
  get estadoFinal() { return this.estados.at(-1)?.[0]; }
  status() { return this.itens.map((i) => i.status); }
}

const concluir = (c: Cenario, estado: EstadoDaVoz) => vi.waitFor(() => expect(c.estadoFinal).toBe(estado));

describe('fluxo normal: anunciar → áudio termina → microfone → registrar → próximo', () => {
  it('registra "tem" como disponível e "não temos" como faltante, na ordem, sem sobreposição', async () => {
    const c = new Cenario();
    c.ouvirDe('Pinça, temos', 'Não temos');
    c.controlador.iniciar('Iniciando conferência. Primeiro item:');
    await concluir(c, 'parado');

    expect(c.registros).toEqual([['a', 'confirmed'], ['b', 'missing']]);
    expect(c.falas).toEqual([
      'Iniciando conferência. Primeiro item: Pinça Kelly, 2 unidades. Está disponível?',
      FRASES.conferido,
      'Bisturi, 1 unidade. Está disponível?',
      FRASES.faltante,
      FRASES.concluida,
    ]);
    expect(c.violacoes).toEqual([]);
  });

  it('o microfone só abre depois que a fala TERMINA', async () => {
    const c = new Cenario();
    c.segurarFala = true;
    c.ouvirDe('sim');
    c.controlador.iniciar();
    await vi.waitFor(() => expect(c.falas).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(c.eventos.filter((e) => e === 'mic:abre')).toHaveLength(0); // ainda falando: nada de microfone
    c.terminarFala();
    await vi.waitFor(() => expect(c.eventos).toContain('mic:abre'));
    expect(c.violacoes).toEqual([]);
    c.controlador.parar();
  });

  it('o item só avança depois do registro, e a fala de confirmação também vem com o microfone fechado', async () => {
    const c = new Cenario();
    c.ouvirDe('sim', 'sim');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.violacoes).toEqual([]);
    expect(c.status()).toEqual(['confirmed', 'confirmed']);
  });
});

describe('respostas inconclusivas e falhas', () => {
  it('"Acho que sim" NÃO registra: pergunta de novo e só confirma com resposta clara', async () => {
    const c = new Cenario();
    c.ouvirDe('Acho que sim', 'Sim');
    c.itens.pop();
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.falas[1]).toBe(FRASES.repergunta('Pinça Kelly'));
    expect(c.registros).toEqual([['a', 'confirmed']]);
    expect(c.violacoes).toEqual([]);
  });

  it('três respostas inconclusivas seguidas pausam sem registrar nada', async () => {
    const c = new Cenario();
    c.ouvirDe('talvez', 'hum', 'não sei');
    c.controlador.iniciar();
    await concluir(c, 'pausado');
    expect(c.registros).toEqual([]);
    expect(c.status()).toEqual(['pending', 'pending']);
    expect(c.falas.at(-1)).toBe(FRASES.naoConfirmado);
  });

  it('silêncio: pergunta de novo e, no limite, pausa sem registrar', async () => {
    const c = new Cenario();
    c.roteiro.push({ tipo: 'silencio' }, { tipo: 'silencio' }, { tipo: 'silencio' });
    c.controlador.iniciar();
    await concluir(c, 'pausado');
    expect(c.falas[1]).toBe(FRASES.naoOuvi('Pinça Kelly'));
    expect(c.registros).toEqual([]);
    expect(c.falas.at(-1)).toBe(FRASES.semResposta);
  });

  it('silêncio e depois resposta clara funciona', async () => {
    const c = new Cenario();
    c.itens.pop();
    c.roteiro.push({ tipo: 'silencio' });
    c.ouvirDe('tem');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.registros).toEqual([['a', 'confirmed']]);
  });

  it.each([
    ['permissao', /acesso ao microfone foi negado/],
    ['sem-microfone', /Nenhum microfone/],
    ['indisponivel', /não está disponível/],
  ] as const)('erro "%s" para o fluxo e avisa na tela', async (motivo, mensagem) => {
    const c = new Cenario();
    c.roteiro.push({ tipo: 'erro', motivo });
    c.controlador.iniciar();
    await concluir(c, 'erro');
    expect(c.estados.at(-1)![1]).toMatch(mensagem);
    expect(c.registros).toEqual([]);
  });

  it('erro de rede tenta de novo antes de desistir', async () => {
    const c = new Cenario();
    c.itens.pop();
    c.roteiro.push({ tipo: 'erro', motivo: 'rede' });
    c.ouvirDe('sim');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.registros).toEqual([['a', 'confirmed']]);
  });

  it('pedido para repetir repete o anúncio e não registra', async () => {
    const c = new Cenario();
    c.itens.pop();
    c.ouvirDe('pode repetir', 'sim');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.falas.filter((f) => f === 'Pinça Kelly, 2 unidades. Está disponível?')).toHaveLength(2);
    expect(c.registros).toEqual([['a', 'confirmed']]);
  });
});

describe('proteção contra eco e respostas atrasadas', () => {
  it('pareceEco: pedaço da fala do assistente é eco; resposta curta não', () => {
    const fala = 'Pinça Kelly, 2 unidades. Está disponível?';
    expect(pareceEco('pinça kelly está disponível', fala)).toBe(true);
    expect(pareceEco('2 unidades está disponível', fala)).toBe(true);
    expect(pareceEco('Pinça', fala)).toBe(false);
    expect(pareceEco('sim, temos', fala)).toBe(false);
    expect(pareceEco('Não está disponível', fala)).toBe(false); // "não" não foi dito pelo assistente
  });

  it('o eco do próprio anúncio ("...está disponível?") NÃO confirma o item', async () => {
    const c = new Cenario();
    c.itens.pop();
    c.ouvirDe('pinça kelly 2 unidades está disponível', 'não temos');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.registros).toEqual([['a', 'missing']]); // o eco foi ignorado; valeu a resposta real
    expect(c.falas.filter((f) => f.startsWith('Pinça Kelly')).length).toBe(1); // sem repetir a pergunta
  });

  it('resposta que chega depois de parar() é descartada', async () => {
    const c = new Cenario();
    c.controlador.iniciar();
    await vi.waitFor(() => expect(c.eventos).toContain('mic:abre'));
    c.controlador.parar();
    expect(c.microfoneAberto).toBe(false);
    expect(c.registros).toEqual([]);
    expect(c.estadoFinal).toBe('parado');
  });

  it('parar() no meio da fala corta o áudio e nunca abre o microfone', async () => {
    const c = new Cenario();
    c.segurarFala = true;
    c.controlador.iniciar();
    await vi.waitFor(() => expect(c.falas).toHaveLength(1));
    c.controlador.parar();
    await new Promise((r) => setTimeout(r, 30));
    expect(c.eventos).not.toContain('mic:abre');
    expect(c.falando).toBe(false);
  });

  it('resposta do turno antigo não vale depois de reiniciarTurno()', async () => {
    const c = new Cenario();
    let responderTarde!: (r: ResultadoDaEscuta) => void;
    c.roteiro.push(new Promise<ResultadoDaEscuta>((r) => { responderTarde = r; }));
    c.controlador.iniciar();
    await vi.waitFor(() => expect(c.eventos).toContain('mic:abre'));

    c.itens[0]!.status = 'missing'; // o usuário tocou o botão "faltante" no item A
    c.ouvirDe('sim'); // resposta do novo turno (item B)
    c.controlador.reiniciarTurno();
    responderTarde({ tipo: 'fala', alternativas: [{ transcript: 'sim', confidence: 0.9 }] }); // resposta antiga chega tarde

    await concluir(c, 'parado');
    expect(c.registros).toEqual([['b', 'confirmed']]); // "sim" antigo não confirmou o item A nem duplicou
    expect(c.violacoes).toEqual([]);
  });

  it('nunca registra o mesmo item duas vezes', async () => {
    const c = new Cenario();
    c.ouvirDe('sim', 'sim');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.registros.map(([id]) => id)).toEqual(['a', 'b']);
  });
});

describe('invariante geral', () => {
  it('em um fluxo longo e misto nunca houve fala com microfone aberto (ou vice-versa)', async () => {
    const c = new Cenario();
    c.roteiro.push({ tipo: 'silencio' });
    c.ouvirDe('talvez', 'tem sim', 'repete', 'falta');
    c.controlador.iniciar('Olá. Primeiro item:');
    await concluir(c, 'parado');
    expect(c.violacoes).toEqual([]);
    expect(c.status()).toEqual(['confirmed', 'missing']);
  });
});

describe('escuta curta: reabrir o microfone em silêncio antes de repetir a pergunta', () => {
  it('silêncio curto reabre o microfone SEM repetir a pergunta e a resposta seguinte vale', async () => {
    const c = new Cenario();
    ajustesDeTempo.reaberturasSilenciosas = 2;
    c.itens.pop();
    c.roteiro.push({ tipo: 'silencio' }, { tipo: 'silencio' });
    c.ouvirDe('sim, temos');
    c.controlador.iniciar();
    await concluir(c, 'parado');

    expect(c.registros).toEqual([['a', 'confirmed']]);
    expect(c.falas.filter((f) => f.includes('Está disponível?'))).toHaveLength(1); // perguntou uma vez só
    expect(c.falas.some((f) => f.startsWith('Não ouvi'))).toBe(false);
    expect(c.eventos.filter((e) => e === 'mic:abre')).toHaveLength(3); // reabriu duas vezes
    expect(c.violacoes).toEqual([]);
  });

  it('esgotadas as reaberturas, repete a pergunta ("Não ouvi a resposta")', async () => {
    const c = new Cenario();
    ajustesDeTempo.reaberturasSilenciosas = 1;
    c.itens.pop();
    c.roteiro.push({ tipo: 'silencio' }, { tipo: 'silencio' });
    c.ouvirDe('tem');
    c.controlador.iniciar();
    await concluir(c, 'parado');

    expect(c.falas).toContain(FRASES.naoOuvi('Pinça Kelly'));
    expect(c.registros).toEqual([['a', 'confirmed']]);
  });

  it('nunca reabre o microfone enquanto o assistente fala', async () => {
    const c = new Cenario();
    ajustesDeTempo.reaberturasSilenciosas = 3;
    c.roteiro.push({ tipo: 'silencio' }, { tipo: 'silencio' }, { tipo: 'silencio' });
    c.ouvirDe('sim', 'sim');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    expect(c.violacoes).toEqual([]);
  });

  it('o estado "preparando" vem antes de "ouvindo" (a tela só mostra "Ouvindo" com o microfone aberto)', async () => {
    const c = new Cenario();
    c.itens.pop();
    c.ouvirDe('sim');
    c.controlador.iniciar();
    await concluir(c, 'parado');
    const nomes = c.estados.map(([estado]) => estado);
    expect(nomes.indexOf('preparando')).toBeGreaterThan(-1);
    expect(nomes.indexOf('preparando')).toBeLessThan(nomes.indexOf('ouvindo'));
  });
});
