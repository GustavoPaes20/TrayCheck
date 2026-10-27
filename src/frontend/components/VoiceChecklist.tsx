import { useState, useEffect, useRef, useCallback } from 'react';
import { cirurgiasCadastradas, kitsPorCirurgia, coresDasCategorias } from '../data/mockData';
import type { AuthUser, ReportItem, ReportItemStatus } from '../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../services/api';

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type WindowWithSpeech = {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

type VoiceChecklistProps = {
  idCirurgiaInicial?: string;
  usuario: AuthUser;
  voltarAoPainel?: () => void;
};

function falar(texto: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const enunciado = new SpeechSynthesisUtterance(texto);
  enunciado.lang = 'pt-BR';
  enunciado.rate = 0.95;
  window.speechSynthesis.speak(enunciado);
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoCorrespondeAoItem(textoFalado: string, nomeDoItem: string): boolean {
  const textoNormalizado = normalizarTexto(textoFalado);
  const nomeNormalizado = normalizarTexto(nomeDoItem);
  const palavras = nomeNormalizado.split(' ').filter((palavra) => palavra.length > 3);
  if (palavras.length === 0) return textoNormalizado.includes(nomeNormalizado);
  return palavras.filter((palavra) => textoNormalizado.includes(palavra)).length >= Math.max(1, Math.floor(palavras.length * 0.5));
}

const intervaloDaDemonstracao = 1800;

function formatarDuracao(inicioDaConferencia: number) {
  const segundosDecorridos = Math.max(0, Math.floor((Date.now() - inicioDaConferencia) / 1000));
  const minutos = Math.floor(segundosDecorridos / 60);
  const segundos = segundosDecorridos % 60;
  return `${minutos}min ${segundos}s`;
}

export default function VoiceChecklist({ idCirurgiaInicial, usuario, voltarAoPainel }: VoiceChecklistProps) {
  const [idCirurgiaSelecionada, definirIdCirurgiaSelecionada] = useState(idCirurgiaInicial || 'joelho');
  const [listaDeCirurgias, definirListaDeCirurgias] = useState(apiEstaConfigurada ? [] : cirurgiasCadastradas);
  const [itensDaConferencia, definirItensDaConferencia] = useState<ReportItem[]>([]);
  const [ouvindoMicrofone, definirOuvindoMicrofone] = useState(false);
  const [transcricaoAtual, definirTranscricaoAtual] = useState('');
  const [ultimoTextoReconhecido, definirUltimoTextoReconhecido] = useState('');
  const [conferenciaIniciada, definirConferenciaIniciada] = useState(false);
  const [conferenciaConcluida, definirConferenciaConcluida] = useState(false);
  const [demonstracaoEmExecucao, definirDemonstracaoEmExecucao] = useState(false);
  const [filtroDeStatus, definirFiltroDeStatus] = useState<'all' | 'pending' | 'confirmed' | 'missing'>('all');
  const [itemVerificadoRecentemente, definirItemVerificadoRecentemente] = useState<string | null>(null);
  const [painelDeVozAberto, definirPainelDeVozAberto] = useState(false);
  const [deslocamentoVertical, definirDeslocamentoVertical] = useState(0);
  const [salvandoRelatorio, definirSalvandoRelatorio] = useState(false);
  const [erroAoSalvarRelatorio, definirErroAoSalvarRelatorio] = useState('');
  const [erroDeCarregamento, definirErroDeCarregamento] = useState('');
  const arrastandoPainel = useRef(false);
  const posicaoInicialDoArrasto = useRef(0);
  const referenciaDoPainel = useRef<HTMLDivElement>(null);
  const inicioDaConferenciaRef = useRef<number | null>(null);
  const relatorioEnviadoRef = useRef(false);

  const reconhecimentoDeVozRef = useRef<SpeechRecognitionInstance | null>(null);
  const temporizadorDaDemonstracaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cirurgiaSelecionada = listaDeCirurgias.find((cirurgia) => cirurgia.id === idCirurgiaSelecionada) ?? cirurgiasCadastradas.find((cirurgia) => cirurgia.id === idCirurgiaSelecionada) ?? cirurgiasCadastradas[0];

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    clienteApi.surgeries.list().then((cirurgiasRecebidas) => {
      definirListaDeCirurgias(cirurgiasRecebidas);
      definirIdCirurgiaSelecionada((idAtual) => cirurgiasRecebidas.some((cirurgia) => cirurgia.id === idAtual) ? idAtual : cirurgiasRecebidas[0]?.id || '');
      if (cirurgiasRecebidas.length === 0) definirErroDeCarregamento('Nenhuma cirurgia disponível para conferência.');
    }).catch((erro: unknown) => {
      definirListaDeCirurgias([]);
      definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar as cirurgias.');
    });
  }, []);

  // Initialize items when surgery changes
  useEffect(() => {
    if (!listaDeCirurgias.some((cirurgia) => cirurgia.id === idCirurgiaSelecionada)) return;
    let requisicaoAtiva = true;
    definirErroDeCarregamento('');
    definirItensDaConferencia([]);
    definirConferenciaIniciada(false);
    definirConferenciaConcluida(false);
    definirTranscricaoAtual('');
    definirUltimoTextoReconhecido('');
    definirOuvindoMicrofone(false);
    definirFiltroDeStatus('all');
    inicioDaConferenciaRef.current = null;
    relatorioEnviadoRef.current = false;
    definirErroAoSalvarRelatorio('');
    interromperDemonstracao();
    interromperReconhecimentoDeVoz();
    const inicializarItensDaConferencia = async () => {
      try {
        const itensDoKit = apiEstaConfigurada
          ? await clienteApi.surgeries.getKit(idCirurgiaSelecionada)
          : kitsPorCirurgia[idCirurgiaSelecionada] || [];
        if (!requisicaoAtiva) return;
        definirItensDaConferencia(itensDoKit.map((itemDoKit) => ({ ...itemDoKit, status: 'pending' as ReportItemStatus })));
      } catch (erro) {
        if (requisicaoAtiva) {
          definirItensDaConferencia([]);
          definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar os itens do kit.');
        }
      }
    };
    void inicializarItensDaConferencia();
    return () => { requisicaoAtiva = false; };
  }, [idCirurgiaSelecionada, listaDeCirurgias]);

  // Check if session complete
  useEffect(() => {
    if (conferenciaIniciada && itensDaConferencia.length > 0) {
      const todosOsItensProcessados = itensDaConferencia.every((itemDaConferencia) => itemDaConferencia.status !== 'pending');
      if (todosOsItensProcessados) {
        definirConferenciaConcluida(true);
        definirOuvindoMicrofone(false);
        definirDemonstracaoEmExecucao(false);
        interromperReconhecimentoDeVoz();
      }
    }
  }, [itensDaConferencia, conferenciaIniciada]);

  useEffect(() => {
    if (!apiEstaConfigurada || !conferenciaConcluida || !conferenciaIniciada || relatorioEnviadoRef.current) return;

    relatorioEnviadoRef.current = true;
    definirSalvandoRelatorio(true);
    const agora = new Date();
    const inicioDaConferencia = inicioDaConferenciaRef.current ?? agora.getTime();
    clienteApi.reports.create({
      surgeryId: idCirurgiaSelecionada,
      surgeryName: cirurgiaSelecionada.name,
      specialty: cirurgiaSelecionada.specialty,
      operator: usuario.name,
      operatorRole: usuario.role,
      date: agora.toLocaleDateString('pt-BR'),
      time: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      duration: formatarDuracao(inicioDaConferencia),
      confirmed: itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'confirmed').length,
      missing: itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'missing').length,
      total: itensDaConferencia.length,
      status: itensDaConferencia.some((itemDaConferencia) => itemDaConferencia.status === 'missing') ? 'divergencia' : 'ok',
      items: itensDaConferencia,
    }).catch((erro: unknown) => {
      definirErroAoSalvarRelatorio(erro instanceof Error ? erro.message : 'Não foi possível salvar o relatório.');
    }).finally(() => definirSalvandoRelatorio(false));
  }, [itensDaConferencia, cirurgiaSelecionada, idCirurgiaSelecionada, conferenciaConcluida, conferenciaIniciada, usuario.name, usuario.role]);

  const marcarItem = useCallback((idDoItem: string, novoStatus: ReportItemStatus) => {
    const horarioAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    definirItensDaConferencia((itensAnteriores) =>
      itensAnteriores.map((itemDaConferencia) => (itemDaConferencia.id === idDoItem && itemDaConferencia.status === 'pending' ? { ...itemDaConferencia, status: novoStatus, confirmedAt: horarioAtual } : itemDaConferencia))
    );
    definirItemVerificadoRecentemente(idDoItem);
    setTimeout(() => definirItemVerificadoRecentemente(null), 600);
  }, []);

  const alternarStatusDoItem = useCallback((idDoItem: string) => {
    definirItensDaConferencia((itensAnteriores) =>
      itensAnteriores.map((itemDaConferencia) => {
        if (itemDaConferencia.id !== idDoItem) return itemDaConferencia;
        if (itemDaConferencia.status === 'pending') return { ...itemDaConferencia, status: 'confirmed', confirmedAt: new Date().toLocaleTimeString('pt-BR') };
        if (itemDaConferencia.status === 'confirmed') return { ...itemDaConferencia, status: 'pending', confirmedAt: undefined };
        return itemDaConferencia;
      })
    );
  }, []);

  const marcarItemComoFaltante = useCallback((idDoItem: string) => {
    const horarioAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    definirItensDaConferencia((itensAnteriores) =>
      itensAnteriores.map((itemDaConferencia) =>
        itemDaConferencia.id === idDoItem ? { ...itemDaConferencia, status: 'missing', confirmedAt: horarioAtual } : itemDaConferencia
      )
    );
  }, []);

  function interromperReconhecimentoDeVoz() {
    if (reconhecimentoDeVozRef.current) {
      try { reconhecimentoDeVozRef.current.stop(); } catch (_) {}
      reconhecimentoDeVozRef.current = null;
    }
    definirOuvindoMicrofone(false);
  }

  function interromperDemonstracao() {
    if (temporizadorDaDemonstracaoRef.current) {
      clearTimeout(temporizadorDaDemonstracaoRef.current);
      temporizadorDaDemonstracaoRef.current = null;
    }
    definirDemonstracaoEmExecucao(false);
  }

  function iniciarReconhecimentoDeVoz() {
    const janelaComVoz = window as unknown as WindowWithSpeech;
    const ConstrutorDeReconhecimento = janelaComVoz.SpeechRecognition || janelaComVoz.webkitSpeechRecognition;

    if (!ConstrutorDeReconhecimento) {
      alert('Reconhecimento de voz nao suportado neste navegador. Use o modo Demonstracao.');
      return;
    }

    const reconhecimento = new ConstrutorDeReconhecimento();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = true;
    reconhecimento.interimResults = true;

    reconhecimento.onresult = (eventoDeReconhecimento: SpeechRecognitionEvent) => {
      const resultados: SpeechRecognitionResult[] = [];
      for (let indice = 0; indice < eventoDeReconhecimento.results.length; indice++) {
        resultados.push(eventoDeReconhecimento.results[indice]);
      }
      const transcricaoParcial = resultados.map((resultado) => resultado[0].transcript).join(' ');
      definirTranscricaoAtual(transcricaoParcial);

      const transcricaoFinal = resultados
        .filter((resultado) => resultado.isFinal)
        .map((resultado) => resultado[0].transcript)
        .join(' ');

      if (transcricaoFinal) {
        definirUltimoTextoReconhecido(transcricaoFinal);
        definirTranscricaoAtual('');
        definirItensDaConferencia((itensAnteriores) => {
          let nomeDoItemCorrespondente = '';
          const itensAtualizados = itensAnteriores.map((itemDaConferencia) => {
            if (itemDaConferencia.status === 'pending' && textoCorrespondeAoItem(transcricaoFinal, itemDaConferencia.name)) {
              nomeDoItemCorrespondente = itemDaConferencia.name;
              const horarioAtual = new Date().toLocaleTimeString('pt-BR');
              definirItemVerificadoRecentemente(itemDaConferencia.id);
              setTimeout(() => definirItemVerificadoRecentemente(null), 800);
              return { ...itemDaConferencia, status: 'confirmed' as ReportItemStatus, confirmedAt: horarioAtual };
            }
            return itemDaConferencia;
          });
          if (nomeDoItemCorrespondente) falar(`${nomeDoItemCorrespondente}. Confirmado.`);
          return itensAtualizados;
        });
      }
    };

    reconhecimento.onerror = () => {
      definirOuvindoMicrofone(false);
      reconhecimentoDeVozRef.current = null;
    };

    reconhecimento.onend = () => {
      if (ouvindoMicrofone) {
        try { reconhecimento.start(); } catch (_) {}
      }
    };

    reconhecimentoDeVozRef.current = reconhecimento;
    reconhecimento.start();
    definirOuvindoMicrofone(true);
    definirConferenciaIniciada(true);
    inicioDaConferenciaRef.current ??= Date.now();
    const primeiroItemPendente = itensDaConferencia.find((itemDaConferencia) => itemDaConferencia.status === 'pending');
    falar(`Iniciando conferência de ${cirurgiaSelecionada.name}. ${primeiroItemPendente ? `Primeiro item: ${primeiroItemPendente.name}.` : 'Todos os itens já foram verificados.'}`);
  }

  function alternarReconhecimentoDeVoz() {
    if (ouvindoMicrofone) {
      falar('Microfone pausado.');
      interromperReconhecimentoDeVoz();
    } else {
      iniciarReconhecimentoDeVoz();
    }
  }

  function pularItemAtual() {
    const proximoItemPendente = itensDaConferencia.find((itemDaConferencia) => itemDaConferencia.status === 'pending');
    if (!proximoItemPendente) return;
    marcarItemComoFaltante(proximoItemPendente.id);
    falar(`Item pulado: ${proximoItemPendente.name}. Marcado como faltando.`);
    const itemPendenteSeguinte = itensDaConferencia.find((itemDaConferencia) => itemDaConferencia.status === 'pending' && itemDaConferencia.id !== proximoItemPendente.id);
    if (itemPendenteSeguinte) setTimeout(() => falar(`Próximo: ${itemPendenteSeguinte.name}`), 1800);
  }

  function repetirItemAtual() {
    const proximoItemPendente = itensDaConferencia.find((itemDaConferencia) => itemDaConferencia.status === 'pending');
    if (proximoItemPendente) {
      falar(`${proximoItemPendente.name}. ${proximoItemPendente.quantity} ${proximoItemPendente.unit}.`);
    } else {
      falar('Todos os itens já foram verificados.');
    }
  }

  function finalizarConferencia() {
    interromperReconhecimentoDeVoz();
    interromperDemonstracao();
    if (quantidadeDeItensFaltantes > 0) {
      falar(`Conferência finalizada com ${quantidadeDeItensFaltantes} item faltando.`);
    } else {
      falar(`Conferência concluída. Todos os ${quantidadeDeItensConfirmados} itens confirmados.`);
    }
    definirConferenciaConcluida(true);
  }

  function iniciarDemonstracao() {
    if (demonstracaoEmExecucao) {
      interromperDemonstracao();
      return;
    }
    definirConferenciaIniciada(true);
    inicioDaConferenciaRef.current ??= Date.now();
    definirDemonstracaoEmExecucao(true);

    const itensPendentes = itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'pending');

    function conferirProximoItem(indice: number) {
      if (indice >= itensPendentes.length) {
        definirDemonstracaoEmExecucao(false);
        return;
      }
      const itemDaConferencia = itensPendentes[indice];
      definirUltimoTextoReconhecido(itemDaConferencia.name);
      marcarItem(itemDaConferencia.id, 'confirmed');
      temporizadorDaDemonstracaoRef.current = setTimeout(() => conferirProximoItem(indice + 1), intervaloDaDemonstracao);
    }

    temporizadorDaDemonstracaoRef.current = setTimeout(() => conferirProximoItem(0), 800);
  }

  function reiniciarConferencia() {
    interromperDemonstracao();
    interromperReconhecimentoDeVoz();
    definirItensDaConferencia((itensAnteriores) => itensAnteriores.map((itemDaConferencia) => ({ ...itemDaConferencia, status: 'pending', confirmedAt: undefined })));
    definirConferenciaIniciada(false);
    definirConferenciaConcluida(false);
    inicioDaConferenciaRef.current = null;
    relatorioEnviadoRef.current = false;
    definirErroAoSalvarRelatorio('');
    definirTranscricaoAtual('');
    definirUltimoTextoReconhecido('');
    definirFiltroDeStatus('all');
  }

  const quantidadeDeItensConfirmados = itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'confirmed').length;
  const quantidadeDeItensFaltantes = itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'missing').length;
  const quantidadeDeItensPendentes = itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'pending').length;
  const progressoDaConferencia = itensDaConferencia.length > 0 ? Math.round(((quantidadeDeItensConfirmados + quantidadeDeItensFaltantes) / itensDaConferencia.length) * 100) : 0;

  const itensFiltrados =
    filtroDeStatus === 'all' ? itensDaConferencia : itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === filtroDeStatus);

  const itensFaltantes = itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === 'missing');

  if (apiEstaConfigurada && listaDeCirurgias.length === 0) {
    return <div role={erroDeCarregamento ? 'alert' : 'status'} className="flex-1 flex items-center justify-center text-sm text-gray-500">{erroDeCarregamento || 'Carregando cirurgias...'}</div>;
  }

  // Bottom sheet drag handlers
  function iniciarArrastoDoPainel(posicaoDoPonteiro: number) {
    arrastandoPainel.current = true;
    posicaoInicialDoArrasto.current = posicaoDoPonteiro;
    definirDeslocamentoVertical(0);
  }

  function moverPainelDuranteArrasto(posicaoDoPonteiro: number) {
    if (!arrastandoPainel.current) return;
    const distanciaDoArrasto = Math.max(0, posicaoDoPonteiro - posicaoInicialDoArrasto.current);
    definirDeslocamentoVertical(distanciaDoArrasto);
  }

  function finalizarArrastoDoPainel() {
    if (!arrastandoPainel.current) return;
    arrastandoPainel.current = false;
    if (deslocamentoVertical > 90) {
      definirPainelDeVozAberto(false);
      definirDeslocamentoVertical(0);
    } else {
      definirDeslocamentoVertical(0);
    }
  }

  if (conferenciaConcluida) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-white p-8">
        <div className="max-w-2xl w-full text-center space-y-6">
          {quantidadeDeItensFaltantes === 0 ? (
            <>
              <div className="w-28 h-28 mx-auto rounded-full bg-emerald-100 flex items-center justify-center animate-check-pop">
                <svg viewBox="0 0 48 48" fill="none" className="w-16 h-16">
                  <circle cx="24" cy="24" r="22" fill="#10B981" />
                  <path d="M14 24l7 7 13-14" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-4xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Kit Completo!
              </h2>
              <p className="text-gray-500 text-lg">
                Todos os {quantidadeDeItensConfirmados} itens foram confirmados. Cirurgia pode prosseguir.
              </p>
            </>
          ) : (
            <>
              <div className="w-28 h-28 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                <svg viewBox="0 0 48 48" fill="none" className="w-16 h-16">
                  <circle cx="24" cy="24" r="22" fill="#EF4444" />
                  <path d="M16 24h16M24 16v16" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="text-4xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Itens Faltando!
              </h2>
              <p className="text-gray-500 text-lg">
                {quantidadeDeItensConfirmados} itens OK &mdash; {quantidadeDeItensFaltantes} item(s) nao localizado(s)
              </p>
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-left space-y-3">
                <h3 className="font-bold text-red-700 text-sm uppercase tracking-wider">Itens em falta:</h3>
                {itensFaltantes.map((itemFaltante) => (
                  <div key={itemFaltante.id} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="font-semibold text-red-700">{itemFaltante.name}</span>
                    <span className="text-red-400 text-sm">— {itemFaltante.quantity} {itemFaltante.unit}</span>
                    {itemFaltante.critical && (
                      <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded">CRITICO</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={reiniciarConferencia}
              className="px-6 py-3 rounded-xl border-2 border-blue-200 text-blue-700 font-semibold hover:bg-blue-50 transition-colors"
            >
              Nova Conferencia
            </button>
            <button
              onClick={() => { reiniciarConferencia(); voltarAoPainel?.(); }}
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              Voltar ao Dashboard
            </button>
          </div>
          {salvandoRelatorio && <p className="text-sm text-gray-500">Salvando relatório...</p>}
          {erroAoSalvarRelatorio && <p role="alert" className="text-sm text-red-600">Relatório não salvo: {erroAoSalvarRelatorio}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gradient-to-b from-blue-50/60 to-white relative">
      {/* Top Bar */}
      <div
        className="px-4 sm:px-6 py-4 border-b border-blue-100/60 flex items-center gap-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)' }}
      >
        <div className="flex-1 flex items-center gap-4">
          <div>
            <div className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-0.5">Conferencia de Material</div>
            <select
              value={idCirurgiaSelecionada}
              onChange={(evento) => definirIdCirurgiaSelecionada(evento.target.value)}
              className="text-white font-bold text-xl bg-transparent border-none outline-none cursor-pointer"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {listaDeCirurgias.map((cirurgia) => (
                <option key={cirurgia.id} value={cirurgia.id} style={{ color: '#1F2937', backgroundColor: '#FFFFFF' }}>
                  {cirurgia.name}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden sm:flex items-center gap-3 ml-2">
            <div className="bg-white/10 rounded-xl px-3 py-1.5 text-center">
              <div className="text-white text-lg font-bold leading-none" style={{ fontFamily: 'Plus Jakarta Sans' }}>{quantidadeDeItensConfirmados}</div>
              <div className="text-blue-200 text-xs">OK</div>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-1.5 text-center">
              <div className="text-amber-300 text-lg font-bold leading-none" style={{ fontFamily: 'Plus Jakarta Sans' }}>{quantidadeDeItensPendentes}</div>
              <div className="text-blue-200 text-xs">Pend.</div>
            </div>
            {quantidadeDeItensFaltantes > 0 && (
              <div className="bg-red-500/25 border border-red-400/30 rounded-xl px-3 py-1.5 text-center">
                <div className="text-red-300 text-lg font-bold leading-none" style={{ fontFamily: 'Plus Jakarta Sans' }}>{quantidadeDeItensFaltantes}</div>
                <div className="text-red-200 text-xs">Falta</div>
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 w-40">
          <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressoDaConferencia}%`, backgroundColor: quantidadeDeItensFaltantes > 0 ? '#F87171' : '#34D399' }}
            />
          </div>
          <span className="text-blue-200 text-xs w-8 text-right">{progressoDaConferencia}%</span>
        </div>

        <button
          onClick={reiniciarConferencia}
          className="text-blue-200 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
          title="Reiniciar"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
            <path d="M1 4h10a4 4 0 010 8H5" strokeLinecap="round" />
            <path d="M4 1L1 4l3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Checklist Area */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Filter tabs */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {(['all', 'pending', 'confirmed', 'missing'] as const).map((filtro) => {
              const quantidade = filtro === 'all' ? itensDaConferencia.length : itensDaConferencia.filter((itemDaConferencia) => itemDaConferencia.status === filtro).length;
              const rotulosDosFiltros = { all: 'Todos', pending: 'Pendentes', confirmed: 'Confirmados', missing: 'Faltando' };
              const coresAtivasDosFiltros = { all: '#2563EB', pending: '#D97706', confirmed: '#059669', missing: '#DC2626' };
              return (
                <button
                  key={filtro}
                  onClick={() => definirFiltroDeStatus(filtro)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
                  style={
                    filtroDeStatus === filtro
                      ? { backgroundColor: coresAtivasDosFiltros[filtro], color: '#FFFFFF' }
                      : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                  }
                >
                  {rotulosDosFiltros[filtro]}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={filtroDeStatus === filtro ? { backgroundColor: 'rgba(255,255,255,0.25)' } : { backgroundColor: '#E5E7EB' }}
                  >
                    {quantidade}
                  </span>
                </button>
              );
            })}
          </div>
          {ultimoTextoReconhecido && (
            <div className="flex items-center gap-2 text-sm animate-slide-in-right">
              <span className="text-gray-400">Detectado:</span>
              <span className="font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">"{ultimoTextoReconhecido}"</span>
            </div>
          )}
        </div>

        {/* Items grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6" style={{ paddingBottom: painelDeVozAberto ? '72vh' : '7rem' }}>
          {!conferenciaIniciada && (
            <div className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
              <svg viewBox="0 0 20 20" fill="#2563EB" className="w-5 h-5 flex-shrink-0">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-blue-700 text-sm">
                Toque no <strong>botao de microfone</strong> abaixo e dite o nome do equipamento, ou use o <strong>Modo Demo</strong>. Voce tambem pode tocar em qualquer item para confirmar manualmente.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {itensFiltrados.map((itemDaConferencia) => {
              const coresDaCategoria = coresDasCategorias[itemDaConferencia.category] || coresDasCategorias['Instrumental'];
              const itemFoiVerificadoRecentemente = itemVerificadoRecentemente === itemDaConferencia.id;
              return (
                <div
                  key={itemDaConferencia.id}
                  className="rounded-2xl border-2 transition-all duration-300 overflow-hidden"
                  style={{
                    borderColor: itemDaConferencia.status === 'confirmed' ? '#10B981' : itemDaConferencia.status === 'missing' ? '#EF4444' : itemFoiVerificadoRecentemente ? '#3B82F6' : '#E5E7EB',
                    backgroundColor: itemDaConferencia.status === 'confirmed' ? '#F0FDF4' : itemDaConferencia.status === 'missing' ? '#FEF2F2' : '#FFFFFF',
                    transform: itemFoiVerificadoRecentemente ? 'scale(1.01)' : 'scale(1)',
                    boxShadow: itemFoiVerificadoRecentemente ? '0 0 0 4px rgba(59,130,246,0.2)' : itemDaConferencia.status === 'confirmed' ? '0 2px 8px rgba(16,185,129,0.12)' : itemDaConferencia.status === 'missing' ? '0 2px 8px rgba(239,68,68,0.12)' : 'none',
                  }}
                >
                  <div className="flex items-center gap-4 p-4">
                    <button
                      onClick={() => alternarStatusDoItem(itemDaConferencia.id)}
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 hover:opacity-80"
                      style={{ backgroundColor: itemDaConferencia.status === 'confirmed' ? '#10B981' : itemDaConferencia.status === 'missing' ? '#EF4444' : '#F3F4F6' }}
                    >
                      {itemDaConferencia.status === 'confirmed' ? (
                        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 animate-check-pop"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : itemDaConferencia.status === 'missing' ? (
                        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 animate-missing-shake"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><circle cx="12" cy="12" r="9" stroke="#9CA3AF" strokeWidth="2" /></svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base leading-tight" style={{ color: itemDaConferencia.status === 'confirmed' ? '#065F46' : itemDaConferencia.status === 'missing' ? '#991B1B' : '#1F2937', fontFamily: 'Plus Jakarta Sans, sans-serif', textDecoration: itemDaConferencia.status === 'missing' ? 'line-through' : 'none' }}>
                          {itemDaConferencia.name}
                        </span>
                        {itemDaConferencia.critical && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">CRITICO</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-500">{itemDaConferencia.quantity} {itemDaConferencia.unit}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: coresDaCategoria.fundo, color: coresDaCategoria.texto }}>{itemDaConferencia.category}</span>
                        {itemDaConferencia.confirmedAt && <span className="text-xs text-gray-400">{itemDaConferencia.confirmedAt}</span>}
                      </div>
                    </div>
                    {itemDaConferencia.status === 'pending' && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => marcarItem(itemDaConferencia.id, 'confirmed')} className="w-9 h-9 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors" title="Confirmar">
                          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}><path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        <button onClick={() => marcarItemComoFaltante(itemDaConferencia.id)} className="w-9 h-9 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center justify-center transition-colors" title="Faltando">
                          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
                        </button>
                      </div>
                    )}
                    {itemDaConferencia.status !== 'pending' && (
                      <button onClick={() => definirItensDaConferencia((itensAnteriores) => itensAnteriores.map((itemAnterior) => itemAnterior.id === itemDaConferencia.id ? { ...itemAnterior, status: 'pending', confirmedAt: undefined } : itemAnterior))} className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 px-2 py-1 rounded-lg hover:bg-gray-100">
                        Desfazer
                      </button>
                    )}
                  </div>
                  {itemDaConferencia.status === 'missing' && (
                    <div className="bg-red-500 px-4 py-2 flex items-center gap-2">
                      <svg viewBox="0 0 16 16" fill="white" className="w-3.5 h-3.5 flex-shrink-0"><path fillRule="evenodd" d="M8.257 2.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 11a1 1 0 11-2 0 1 1 0 012 0zm-1-6a1 1 0 00-1 1v2a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      <span className="text-white text-xs font-bold">FALTANDO: {itemDaConferencia.name} — Notificar responsavel!</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {itensFiltrados.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 mx-auto mb-3 text-gray-200"><circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" /><path d="M16 24l5 5 11-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p>Nenhum item nesta categoria</p>
            </div>
          )}

          {conferenciaIniciada && quantidadeDeItensPendentes === 0 && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => definirConferenciaConcluida(true)}
                className="px-8 py-3 rounded-xl font-bold text-sm text-white transition-all"
                style={{ background: quantidadeDeItensFaltantes > 0 ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                {quantidadeDeItensFaltantes > 0 ? 'Ver Relatorio Final' : 'Conferencia Concluida!'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating mic FAB */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
        <button
          onClick={() => definirPainelDeVozAberto(true)}
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl font-semibold text-sm text-white transition-all duration-300 active:scale-95"
          style={{
            background: ouvindoMicrofone
              ? 'linear-gradient(135deg, #1D4ED8, #2563EB)'
              : 'linear-gradient(135deg, #1E3A8A, #1D4ED8)',
            boxShadow: ouvindoMicrofone
              ? '0 4px 24px rgba(37,99,235,0.5), 0 0 0 6px rgba(37,99,235,0.15)'
              : '0 4px 20px rgba(30,58,138,0.4)',
          }}
        >
          {ouvindoMicrofone && (
            <span className="flex items-center gap-0.5 h-5">
              {Array.from({ length: 5 }).map((_, indice) => (
                <span
                  key={indice}
                  className="w-1 bg-white rounded-full animate-wave-bar"
                  style={{ animationDelay: `${indice * 0.1}s`, animationDuration: `${0.5 + (indice % 3) * 0.15}s`, height: '100%' }}
                />
              ))}
            </span>
          )}
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 flex-shrink-0">
            <rect x="8" y="3" width="8" height="12" rx="4" fill="white" />
            <path d="M5 12a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="21" x2="12" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="8" y1="22.5" x2="16" y2="22.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{ouvindoMicrofone ? 'Ouvindo...' : 'Microfone'}</span>
        </button>
      </div>


      {/* Bottom sheet */}
      <div
        ref={referenciaDoPainel}
        className="absolute left-2 right-2 z-50 bg-white flex flex-col"
        style={{
          bottom: painelDeVozAberto ? 0 : '-100%',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '82vh',
          transform: `translateY(${deslocamentoVertical}px)`,
          transition: arrastandoPainel.current ? 'none' : 'bottom 0.35s cubic-bezier(0.32,0.72,0,1), transform 0.18s ease',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          willChange: 'transform',
        }}
        onMouseMove={(evento) => moverPainelDuranteArrasto(evento.clientY)}
        onMouseUp={finalizarArrastoDoPainel}
        onMouseLeave={finalizarArrastoDoPainel}
        onTouchMove={(evento) => moverPainelDuranteArrasto(evento.touches[0].clientY)}
        onTouchEnd={finalizarArrastoDoPainel}
      >
        {/* Drag handle */}
        <div
          className="pt-3 pb-2 flex flex-col items-center cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onMouseDown={(evento) => iniciarArrastoDoPainel(evento.clientY)}
          onTouchStart={(evento) => iniciarArrastoDoPainel(evento.touches[0].clientY)}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
          <div className="mt-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Conferencia por Voz</div>
        </div>

        {/* Sheet content */}
        <div className="overflow-y-auto flex-1 pb-6">
          {/* Mic section */}
          <div
            className="px-5 pt-2 pb-5 flex flex-col items-center gap-4 border-b border-gray-100"
            style={{ background: ouvindoMicrofone ? 'linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%)' : '#FAFAFA' }}
          >
            {/* Mic button */}
            <div className="relative flex items-center justify-center pt-2">
              {ouvindoMicrofone && (
                <>
                  <div className="absolute w-28 h-28 rounded-full border-2 border-blue-400 animate-voice-ring" />
                  <div className="absolute w-24 h-24 rounded-full border border-blue-300 animate-voice-ring" style={{ animationDelay: '0.4s' }} />
                </>
              )}
              <button
                onClick={alternarReconhecimentoDeVoz}
                className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg"
                style={{
                  background: ouvindoMicrofone ? 'linear-gradient(135deg, #1D4ED8, #2563EB)' : 'linear-gradient(135deg, #374151, #1F2937)',
                  transform: ouvindoMicrofone ? 'scale(1.05)' : 'scale(1)',
                  animation: ouvindoMicrofone ? 'voicePulse 1.2s ease-in-out infinite' : 'none',
                }}
              >
                <svg viewBox="0 0 32 32" fill="none" className="w-9 h-9">
                  <rect x="11" y="4" width="10" height="16" rx="5" fill="white" />
                  <path d="M6 16a10 10 0 0020 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="16" y1="28" x2="16" y2="22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="10" y1="30" x2="22" y2="30" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="text-center">
              <div className="font-bold text-base" style={{ color: ouvindoMicrofone ? '#1D4ED8' : '#374151', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {ouvindoMicrofone ? 'Ouvindo...' : 'Microfone inativo'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {ouvindoMicrofone ? 'Dite o nome do equipamento' : 'Toque para ativar o microfone'}
              </div>
            </div>

            {ouvindoMicrofone && (
              <div className="flex items-center gap-1 h-7">
                {Array.from({ length: 12 }).map((_, indice) => (
                  <div key={indice} className="w-1.5 bg-blue-500 rounded-full animate-wave-bar" style={{ animationDelay: `${indice * 0.07}s`, animationDuration: `${0.5 + (indice % 3) * 0.15}s`, height: '100%' }} />
                ))}
              </div>
            )}

            {(transcricaoAtual || ultimoTextoReconhecido) && (
              <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-3">
                {transcricaoAtual && <div className="text-blue-400 italic text-xs mb-1">"{transcricaoAtual}"</div>}
                {ultimoTextoReconhecido && <div className="text-blue-700 font-semibold text-sm">Ultimo: "{ultimoTextoReconhecido}"</div>}
              </div>
            )}

            <button
              onClick={alternarReconhecimentoDeVoz}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
              style={{ background: ouvindoMicrofone ? '#FEF2F2' : 'linear-gradient(135deg, #1D4ED8, #2563EB)', color: ouvindoMicrofone ? '#DC2626' : '#FFFFFF' }}
            >
              {ouvindoMicrofone ? 'Pausar Microfone' : 'Ativar Microfone'}
            </button>
          </div>

          {/* Commands */}
          <div className="px-5 pt-4 pb-4 border-b border-gray-100">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Comandos</div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button onClick={pularItemAtual} disabled={quantidadeDeItensPendentes === 0} className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all" style={{ backgroundColor: '#FEF3C7', color: '#92400E', opacity: quantidadeDeItensPendentes === 0 ? 0.4 : 1 }}>
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}><path d="M4 8h7M8 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Pular
              </button>
              <button onClick={repetirItemAtual} disabled={quantidadeDeItensPendentes === 0} className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all" style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', opacity: quantidadeDeItensPendentes === 0 ? 0.4 : 1 }}>
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}><path d="M2 8a6 6 0 1012 0" strokeLinecap="round" /><path d="M14 4l-2 4-2-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Repetir
              </button>
              <button onClick={finalizarConferencia} disabled={!conferenciaIniciada} className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all" style={{ backgroundColor: quantidadeDeItensFaltantes > 0 ? '#FEE2E2' : '#D1FAE5', color: quantidadeDeItensFaltantes > 0 ? '#991B1B' : '#065F46', opacity: !conferenciaIniciada ? 0.4 : 1 }}>
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}><path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Finalizar
              </button>
            </div>
            <button
              onClick={iniciarDemonstracao}
              disabled={ouvindoMicrofone}
              className="w-full py-2 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
              style={{ background: demonstracaoEmExecucao ? '#FEF3C7' : '#F3F4F6', color: demonstracaoEmExecucao ? '#92400E' : '#374151', opacity: ouvindoMicrofone ? 0.4 : 1 }}
            >
              {demonstracaoEmExecucao ? <><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Parar Demo</> : <><svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3"><polygon points="3,2 10,6 3,10" /></svg>Modo Demo</>}
            </button>
          </div>

          {/* Progress */}
          <div className="px-5 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Progresso</div>
            <div className="space-y-3">
              {[
                { label: 'Confirmados', quantidade: quantidadeDeItensConfirmados, cor: '#10B981', corDoTexto: '#065F46' },
                { label: 'Pendentes', quantidade: quantidadeDeItensPendentes, cor: '#F59E0B', corDoTexto: '#92400E' },
                ...(quantidadeDeItensFaltantes > 0 ? [{ label: 'Faltando', quantidade: quantidadeDeItensFaltantes, cor: '#EF4444', corDoTexto: '#991B1B' }] : []),
              ].map(({ label: rotulo, quantidade, cor, corDoTexto }) => (
                <div key={rotulo}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: corDoTexto }}>
                    <span className="font-semibold">{rotulo}</span>
                    <span className="font-bold">{quantidade}/{itensDaConferencia.length}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: itensDaConferencia.length ? `${(quantidade / itensDaConferencia.length) * 100}%` : '0%', backgroundColor: cor }} />
                  </div>
                </div>
              ))}
            </div>
            {itensFaltantes.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Itens em falta
                </div>
                {itensFaltantes.map((itemFaltante) => (
                  <div key={itemFaltante.id} className="flex items-start gap-1.5 text-xs text-red-600 mb-1">
                    <span className="mt-0.5">•</span>
                    <span className="font-semibold">{itemFaltante.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
