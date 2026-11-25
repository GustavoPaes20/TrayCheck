// Controlador do diálogo por voz da conferência.
//
// Fluxo de cada item:   anunciar → (áudio TERMINA) → pausa curta → abrir microfone → ouvir UMA resposta
//                       → fechar microfone → interpretar → registrar → seguir (ou perguntar de novo).
//
// Por que não há eco nem sobreposição:
//   - o microfone só é aberto depois que `falante.falar()` resolve (áudio terminou) + uma pausa curta;
//   - antes de qualquer fala o microfone é fechado (`cancelar`), e as duas coisas nunca coexistem;
//   - cada "geração" (iniciar/parar/reiniciar turno) invalida tudo que ainda estava pendente, então uma
//     resposta atrasada, repetida ou de um turno antigo é descartada e nunca registra nada;
//   - como segunda barreira, uma transcrição que é só um pedaço da última fala do assistente é tratada
//     como eco e ignorada.

import { interpretarAlternativas, normalizarFala, type Interpretacao } from './interpretarResposta';
import type { Falante } from './falante';
import type { Reconhecedor } from './reconhecedor';

export type EstadoDaVoz = 'parado' | 'falando' | 'ouvindo' | 'interpretando' | 'pausado' | 'erro';

export type ItemParaConferir = {
  id: string;
  nome: string;
  /** Nome pronto para falar ("nº 22" vira "número 22"). */
  nomeFalado: string;
  /** Como o assistente o descreve ao anunciar (ex.: "Pinça Kelly, 2 unidades"). */
  anuncio: string;
  /** Quantidade anunciada (para detectar "só tem um" quando eram dois). */
  quantidade: number;
  /** Nomes dos outros itens pendentes (para detectar resposta sobre outra peça). */
  outrosNomes: string[];
};

export type DependenciasDoControlador = {
  falante: Falante;
  reconhecedor: Reconhecedor;
  /** Primeiro item ainda pendente (lido SEMPRE do estado atual da conferência), ou null se acabou. */
  obterItemAtual: () => ItemParaConferir | null;
  /** Registra a resposta no checklist. Deve ignorar itens que já não estão pendentes. */
  registrar: (idDoItem: string, status: 'confirmed' | 'missing', motivo: Interpretacao) => void;
  aoMudarEstado: (estado: EstadoDaVoz, detalhe?: string) => void;
  /** O que foi entendido (para a tela mostrar). */
  aoEntender?: (textoOuvido: string, interpretacao: Interpretacao) => void;
  /** Pausa entre o fim do áudio e a abertura do microfone (deixa a sala "esfriar"). */
  atrasoAposFalaMs?: number;
  /** Máximo de respostas ruins/ausentes seguidas no mesmo item antes de pausar e pedir os botões. */
  maximoDeTentativas?: number;
  esperar?: (ms: number) => Promise<void>;
};

export const ATRASO_APOS_FALA_MS = 450;
export const MAXIMO_DE_TENTATIVAS = 3;

/** Valores usados quando a dependência não os informa. Os testes de tela zeram a pausa para ficarem rápidos. */
export const ajustesDeTempo = { atrasoAposFalaMs: ATRASO_APOS_FALA_MS };

export const FRASES = {
  conferido: 'Conferido.',
  faltante: 'Registrado como faltante.',
  concluida: 'Conferência concluída.',
  semResposta: 'Não obtive resposta. Use os botões na tela ou toque no microfone para continuar.',
  naoConfirmado: 'Não consegui confirmar o item. Use os botões na tela ou toque no microfone para continuar.',
  perguntar: (anuncio: string) => `${anuncio}. Está disponível?`,
  repergunta: (nome: string) => `Não consegui confirmar. ${nome} está disponível?`,
  naoOuvi: (nome: string) => `Não ouvi a resposta. ${nome} está disponível?`,
};

const esperarPadrao = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** True quando a transcrição é só um trecho (3+ palavras) do que o assistente acabou de dizer. */
export function pareceEco(transcricao: string, ultimaFala: string): boolean {
  const ouvidas = normalizarFala(transcricao).replace(/\|/g, ' ').split(' ').filter(Boolean);
  if (ouvidas.length < 3) return false;
  const faladas = new Set(normalizarFala(ultimaFala).replace(/\|/g, ' ').split(' ').filter(Boolean));
  return ouvidas.every((palavra) => faladas.has(palavra));
}

export class ControladorDaConferenciaPorVoz {
  private geracao = 0;
  private ativo = false;
  private ultimaFala = '';

  constructor(private readonly deps: DependenciasDoControlador) {}

  get emAndamento() {
    return this.ativo;
  }

  /** Começa (ou recomeça) o diálogo a partir do primeiro item pendente. */
  /** `introducao` é dita antes do primeiro item (ex.: "Iniciando conferência. Primeiro item:"). */
  iniciar(introducao = ''): void {
    const geracao = this.nova();
    this.ativo = true;
    void this.conversar(geracao, introducao);
  }

  /** Para tudo: fecha o microfone, corta a fala e invalida respostas pendentes. */
  parar(estado: 'parado' | 'pausado' = 'parado', detalhe?: string): void {
    this.nova();
    this.ativo = false;
    this.deps.aoMudarEstado(estado, detalhe);
  }

  /** O usuário agiu pelos botões: descarta o turno atual e recomeça no item pendente atual. */
  reiniciarTurno(): void {
    if (!this.ativo) return;
    const geracao = this.nova();
    void this.conversar(geracao, '');
  }

  private nova(): number {
    this.geracao += 1;
    this.deps.reconhecedor.cancelar(); // microfone fechado ANTES de qualquer coisa
    this.deps.falante.cancelar();
    return this.geracao;
  }

  private vigente(geracao: number) {
    return this.ativo && geracao === this.geracao;
  }

  private async dizer(geracao: number, texto: string): Promise<boolean> {
    this.deps.reconhecedor.cancelar(); // garante microfone fechado durante a fala
    this.ultimaFala = texto;
    this.deps.aoMudarEstado('falando');
    await this.deps.falante.falar(texto); // só volta quando o áudio terminou (ou foi cancelado)
    return this.vigente(geracao);
  }

  private async conversar(geracao: number, introducao: string): Promise<void> {
    const { reconhecedor, obterItemAtual, registrar, aoMudarEstado, aoEntender } = this.deps;
    const esperar = this.deps.esperar ?? esperarPadrao;
    const atraso = this.deps.atrasoAposFalaMs ?? ajustesDeTempo.atrasoAposFalaMs;
    const maximo = this.deps.maximoDeTentativas ?? MAXIMO_DE_TENTATIVAS;

    let tentativas = 0;
    let itemDaTentativa: string | null = null;
    let perguntaPendente: ((item: ItemParaConferir) => string) | null = null;
    let primeira = true;
    let ecos = 0;

    while (this.vigente(geracao)) {
      const item = obterItemAtual();
      if (!item) {
        if (!(await this.dizer(geracao, FRASES.concluida))) return;
        this.ativo = false;
        aoMudarEstado('parado');
        return;
      }
      if (item.id !== itemDaTentativa) { itemDaTentativa = item.id; tentativas = 0; ecos = 0; perguntaPendente = null; }

      // 1) Anunciar (ou repetir a pergunta). O microfone continua FECHADO.
      const abertura = primeira && introducao ? `${introducao} ` : '';
      const texto = perguntaPendente ? perguntaPendente(item) : `${abertura}${FRASES.perguntar(item.anuncio)}`;
      perguntaPendente = null;
      primeira = false;
      if (ecos === 0 && !(await this.dizer(geracao, texto))) return;

      // 2) Só agora: pausa curta e microfone aberto para UMA resposta.
      await esperar(atraso);
      if (!this.vigente(geracao)) return;
      aoMudarEstado('ouvindo');
      const escuta = await reconhecedor.ouvir();
      if (!this.vigente(geracao)) return; // turno antigo: descarta
      reconhecedor.cancelar(); // microfone fechado antes de qualquer outra coisa

      // 3) Falhas do microfone.
      if (escuta.tipo === 'cancelado') return;
      if (escuta.tipo === 'erro') {
        if (escuta.motivo === 'rede' && tentativas + 1 < maximo) { tentativas += 1; perguntaPendente = (i) => FRASES.naoOuvi(i.nomeFalado); continue; }
        this.ativo = false;
        aoMudarEstado('erro', mensagemDeErro(escuta.motivo));
        return;
      }

      // 4) Sem resposta: pergunta de novo, até o limite.
      if (escuta.tipo === 'silencio') {
        tentativas += 1;
        if (tentativas >= maximo) return this.pausarPorFalta(geracao, FRASES.semResposta);
        perguntaPendente = (i) => FRASES.naoOuvi(i.nomeFalado);
        continue;
      }

      // 5) Eco da própria voz: ignora e escuta de novo, sem repetir a pergunta.
      const textoOuvido = escuta.alternativas[0]!.transcript;
      if (pareceEco(textoOuvido, this.ultimaFala)) {
        ecos += 1;
        if (ecos > 2) { ecos = 0; tentativas += 1; if (tentativas >= maximo) return this.pausarPorFalta(geracao, FRASES.semResposta); perguntaPendente = (i) => FRASES.naoOuvi(i.nomeFalado); }
        continue;
      }
      ecos = 0;

      // 6) Interpretar e agir.
      aoMudarEstado('interpretando');
      const interpretacao = interpretarAlternativas(escuta.alternativas, { nomeDoItem: item.nome, outrosNomes: item.outrosNomes, quantidade: item.quantidade });
      aoEntender?.(textoOuvido, interpretacao);

      if (interpretacao.classe === 'repetir') continue; // repete o anúncio, sem contar tentativa

      if (interpretacao.classe === 'positiva' || interpretacao.classe === 'negativa') {
        registrar(item.id, interpretacao.classe === 'positiva' ? 'confirmed' : 'missing', interpretacao);
        tentativas = 0;
        if (!(await this.dizer(geracao, interpretacao.classe === 'positiva' ? FRASES.conferido : FRASES.faltante))) return;
        continue; // próximo item (lido do estado atual no topo do laço)
      }

      // Inconclusiva: NÃO registra nada; pede confirmação clara.
      tentativas += 1;
      if (tentativas >= maximo) return this.pausarPorFalta(geracao, FRASES.naoConfirmado);
      perguntaPendente = (i) => FRASES.repergunta(i.nomeFalado);
    }
  }

  private async pausarPorFalta(geracao: number, frase: string) {
    if (!(await this.dizer(geracao, frase))) return;
    this.ativo = false;
    this.deps.aoMudarEstado('pausado', frase);
  }
}

function mensagemDeErro(motivo: 'permissao' | 'sem-microfone' | 'rede' | 'indisponivel'): string {
  switch (motivo) {
    case 'permissao': return 'O acesso ao microfone foi negado. Permita o microfone nas configurações do navegador ou use os botões na tela.';
    case 'sem-microfone': return 'Nenhum microfone foi encontrado. Conecte um microfone ou use os botões na tela.';
    case 'rede': return 'O reconhecimento de voz perdeu a conexão. Use os botões na tela ou tente de novo.';
    default: return 'O reconhecimento de voz não está disponível neste navegador. Use os botões na tela ou o modo Demonstração.';
  }
}
