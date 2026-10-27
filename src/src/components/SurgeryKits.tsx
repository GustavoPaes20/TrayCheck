import { useEffect, useState } from 'react';
import { cirurgiasCadastradas, kitsPorCirurgia, coresDasCategorias, EquipmentItem, View } from '../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../services/api';

type SurgeryKitsProps = {
  navegarPara: (telaDestino: View, idCirurgia?: string) => void;
};

function SeloDeCategoria({ categoria }: { categoria: string }) {
  const cores = coresDasCategorias[categoria] || { fundo: '#F3F4F6', texto: '#374151' };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: cores.fundo, color: cores.texto }}>
      {categoria}
    </span>
  );
}

function ItemDoKit({ itemDoKit }: { itemDoKit: EquipmentItem }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: itemDoKit.critical ? '#EFF6FF' : '#F9FAFB' }}>
        {itemDoKit.critical ? (
          <svg viewBox="0 0 16 16" fill="#2563EB" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5a.905.905 0 00-.9.995l.35 3.507a.552.552 0 001.1 0l.35-3.507A.905.905 0 008 5zm.002 6a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="#9CA3AF" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z" clipRule="evenodd" /></svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-800 text-sm">{itemDoKit.name}</span>
          {itemDoKit.critical && <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0">CRÍTICO</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{itemDoKit.quantity} {itemDoKit.unit}</div>
      </div>
      <SeloDeCategoria categoria={itemDoKit.category} />
    </div>
  );
}

export default function SurgeryKits({ navegarPara }: SurgeryKitsProps) {
  const [idCirurgiaSelecionada, definirIdCirurgiaSelecionada] = useState('joelho');
  const [listaDeCirurgias, definirListaDeCirurgias] = useState(apiEstaConfigurada ? [] : cirurgiasCadastradas);
  const [itensDoKit, definirItensDoKit] = useState<EquipmentItem[]>(apiEstaConfigurada ? [] : kitsPorCirurgia.joelho || []);
  const [categoriaFiltrada, definirCategoriaFiltrada] = useState('Todos');
  const [detalhesVisiveis, definirDetalhesVisiveis] = useState(false);
  const [erroDeCarregamento, definirErroDeCarregamento] = useState('');

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    clienteApi.surgeries.list().then((cirurgiasRecebidas) => {
      definirListaDeCirurgias(cirurgiasRecebidas);
      definirIdCirurgiaSelecionada((idAtual) => cirurgiasRecebidas.some((cirurgia) => cirurgia.id === idAtual) ? idAtual : cirurgiasRecebidas[0]?.id || '');
    }).catch((erro: unknown) => {
      definirListaDeCirurgias([]);
      definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar as cirurgias.');
    });
  }, []);

  useEffect(() => {
    if (!idCirurgiaSelecionada) {
      definirItensDoKit([]);
      return;
    }
    if (!apiEstaConfigurada) {
      definirItensDoKit(kitsPorCirurgia[idCirurgiaSelecionada] || []);
      return;
    }
    let requisicaoAtiva = true;
    clienteApi.surgeries.getKit(idCirurgiaSelecionada).then((itensRecebidos) => {
      if (requisicaoAtiva) definirItensDoKit(itensRecebidos);
    }).catch((erro: unknown) => {
      if (!requisicaoAtiva) return;
      definirItensDoKit([]);
      definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar o kit.');
    });
    return () => { requisicaoAtiva = false; };
  }, [idCirurgiaSelecionada]);

  const cirurgiaSelecionada = listaDeCirurgias.find((cirurgia) => cirurgia.id === idCirurgiaSelecionada);
  const categorias = ['Todos', ...Array.from(new Set(itensDoKit.map((itemDoKit) => itemDoKit.category)))];
  const itensFiltrados = categoriaFiltrada === 'Todos' ? itensDoKit : itensDoKit.filter((itemDoKit) => itemDoKit.category === categoriaFiltrada);
  const quantidadeDeItensCriticos = itensDoKit.filter((itemDoKit) => itemDoKit.critical).length;

  function selecionarCirurgiaEExibirDetalhes(idCirurgia: string) {
    definirIdCirurgiaSelecionada(idCirurgia);
    definirCategoriaFiltrada('Todos');
    definirDetalhesVisiveis(true);
    definirErroDeCarregamento('');
  }

  if (!cirurgiaSelecionada) {
    return <div role={erroDeCarregamento ? 'alert' : 'status'} className="flex-1 flex items-center justify-center text-sm text-gray-500">{erroDeCarregamento || 'Carregando cirurgias...'}</div>;
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Kits Cirúrgicos
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{listaDeCirurgias.length} tipos de cirurgia cadastrados</p>
            {erroDeCarregamento && <p role="alert" className="text-xs text-red-600 mt-1">{erroDeCarregamento}</p>}
          </div>
          <button
            onClick={() => navegarPara('voice-checklist', idCirurgiaSelecionada)}
            className="flex items-center gap-2 font-semibold text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-white transition-colors flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1E3A8A,#2563EB)' }}
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2}><rect x="5" y="1" width="6" height="9" rx="3" /><path d="M2 8a6 6 0 0012 0M8 14v-3" strokeLinecap="round" /></svg>
            <span className="hidden sm:inline">Conferir por Voz</span>
            <span className="sm:hidden">Conferir</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row max-w-screen-xl mx-auto w-full">
        {/* Surgery list — hidden on mobile when detail is shown */}
        <div className={`lg:w-72 xl:w-80 flex-shrink-0 overflow-y-auto p-4 space-y-2 border-r border-gray-100 ${detalhesVisiveis ? 'hidden lg:block' : 'block'}`}>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1 mb-2">Selecione a cirurgia</div>
          {listaDeCirurgias.map((cirurgia) => {
            const selecionada = cirurgia.id === idCirurgiaSelecionada;
            return (
              <button
                key={cirurgia.id}
                onClick={() => selecionarCirurgiaEExibirDetalhes(cirurgia.id)}
                className="w-full text-left rounded-2xl p-3.5 sm:p-4 transition-all duration-200 border"
                style={{
                  backgroundColor: selecionada ? cirurgia.color : '#FFFFFF',
                  borderColor: selecionada ? cirurgia.color : '#F3F4F6',
                  boxShadow: selecionada ? `0 4px 14px ${cirurgia.color}28` : '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight truncate" style={{ color: selecionada ? '#FFF' : '#1F2937' }}>{cirurgia.name}</div>
                    <div className="text-xs mt-1 truncate" style={{ color: selecionada ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }}>{cirurgia.specialty}</div>
                  </div>
                  <div className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ backgroundColor: selecionada ? 'rgba(255,255,255,0.2)' : cirurgia.bgColor, color: selecionada ? '#FFF' : cirurgia.color }}>
                    {cirurgia.scheduledToday}x
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: selecionada ? 'rgba(255,255,255,0.65)' : '#9CA3AF' }}>
                  <span>{cirurgia.duration}</span>
                  <span>&bull;</span>
                  <span>{cirurgia.room}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Kit detail */}
        <div className={`flex-1 overflow-hidden flex flex-col min-w-0 ${!detalhesVisiveis ? 'hidden lg:flex' : 'flex'}`}>
          {/* Mobile back button */}
          <div className="lg:hidden px-4 pt-3 pb-0">
            <button onClick={() => definirDetalhesVisiveis(false)} className="flex items-center gap-2 text-blue-600 text-sm font-semibold">
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}><path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Voltar à lista
            </button>
          </div>

          {/* Detail header */}
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0" style={{ background: `linear-gradient(135deg,${cirurgiaSelecionada.bgColor} 0%,#FFFFFF 70%)` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cirurgiaSelecionada.color }}>{cirurgiaSelecionada.specialty}</span>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mt-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{cirurgiaSelecionada.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span>Duração: {cirurgiaSelecionada.duration}</span>
                  <span>&bull;</span>
                  <span>{itensDoKit.length} itens</span>
                  <span>&bull;</span>
                  <span className="font-semibold text-red-600">{quantidadeDeItensCriticos} críticos</span>
                </div>
              </div>
              <button
                onClick={() => navegarPara('voice-checklist', idCirurgiaSelecionada)}
                className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm px-3 py-2 rounded-xl text-white flex-shrink-0"
                style={{ backgroundColor: cirurgiaSelecionada.color }}
              >
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2}><rect x="5" y="1" width="6" height="9" rx="3" /><path d="M2 8a6 6 0 0012 0M8 14v-3" strokeLinecap="round" /></svg>
                <span className="hidden sm:inline">Conferir por Voz</span>
                <span className="sm:hidden">Voz</span>
              </button>
            </div>

            {/* Category filters */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {categorias.map((categoria) => (
                <button
                  key={categoria}
                  onClick={() => definirCategoriaFiltrada(categoria)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
                  style={categoriaFiltrada === categoria ? { backgroundColor: cirurgiaSelecionada.color, color: '#FFF', borderColor: cirurgiaSelecionada.color } : { backgroundColor: '#F9FAFB', color: '#6B7280', borderColor: '#E5E7EB' }}
                >
                  {categoria}
                  {categoria !== 'Todos' && <span className="ml-1 opacity-60">({itensDoKit.filter((itemDoKit) => itemDoKit.category === categoria).length})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            {itensFiltrados.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">Nenhum item nesta categoria.</div>
            ) : (
              itensFiltrados.map((itemDoKit) => <ItemDoKit key={itemDoKit.id} itemDoKit={itemDoKit} />)
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 sm:px-6 py-3 bg-gray-50/50 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-gray-400">{itensFiltrados.length} de {itensDoKit.length} itens</span>
            <span className="text-xs text-gray-400">Última verificação: hoje 07:30</span>
          </div>
        </div>
      </div>
    </div>
  );
}
