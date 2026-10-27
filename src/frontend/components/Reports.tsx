import { useEffect, useState } from 'react';
import { historicoDeConferencias, ChecklistReport, coresDasCategorias } from '../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../services/api';

function SeloDeStatusDoRelatorio({ estado }: { estado: ChecklistReport['status'] }) {
  if (estado === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
        <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M10.354 2.146a.5.5 0 010 .708l-6 6a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L4 7.793l5.646-5.647a.5.5 0 01.708 0z" clipRule="evenodd" /></svg>
        COMPLETO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full animate-blink" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      DIVERGÊNCIA
    </span>
  );
}

function ModalDeDetalhes({ relatorio, aoFechar }: { relatorio: ChecklistReport; aoFechar: () => void }) {
  const percentual = Math.round((relatorio.confirmed / relatorio.total) * 100);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0" style={{ background: relatorio.status === 'ok' ? 'linear-gradient(135deg,#F0FDF4,#FFFFFF)' : 'linear-gradient(135deg,#FEF2F2,#FFFFFF)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <SeloDeStatusDoRelatorio estado={relatorio.status} />
                <span className="text-xs text-gray-400">{relatorio.date} às {relatorio.time} · {relatorio.duration}</span>
              </div>
              <h2 className="font-bold text-gray-800 text-lg leading-tight" style={{ fontFamily: 'Plus Jakarta Sans' }}>{relatorio.surgeryName}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{relatorio.specialty} · Operador: <span className="font-semibold">{relatorio.operator}</span></p>
            </div>
            <button onClick={aoFechar} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 flex-shrink-0 transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-gray-500">{relatorio.confirmed} de {relatorio.total} itens conferidos</span>
              <span className="font-bold" style={{ color: relatorio.status === 'ok' ? '#059669' : '#DC2626' }}>{percentual}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${percentual}%`, backgroundColor: relatorio.status === 'ok' ? '#10B981' : '#EF4444' }} />
            </div>
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {relatorio.items.map((itemRelatorio) => {
            const coresDaCategoria = coresDasCategorias[itemRelatorio.category] || { fundo: '#F3F4F6', texto: '#374151' };
            return (
              <div
                key={itemRelatorio.id}
                className="flex items-center gap-3 p-3 rounded-xl border transition-colors"
                style={{
                  backgroundColor: itemRelatorio.status === 'confirmed' ? '#F0FDF4' : itemRelatorio.status === 'missing' ? '#FEF2F2' : '#F9FAFB',
                  borderColor: itemRelatorio.status === 'confirmed' ? '#D1FAE5' : itemRelatorio.status === 'missing' ? '#FEE2E2' : '#E5E7EB',
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: itemRelatorio.status === 'confirmed' ? '#10B981' : itemRelatorio.status === 'missing' ? '#EF4444' : '#D1D5DB' }}
                >
                  {itemRelatorio.status === 'confirmed' ? (
                    <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5"><path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : itemRelatorio.status === 'missing' ? (
                    <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5"><path d="M3 3l8 8M11 3l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
                  ) : (
                    <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5"><circle cx="7" cy="7" r="5" stroke="white" strokeWidth="2" /></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: itemRelatorio.status === 'confirmed' ? '#065F46' : itemRelatorio.status === 'missing' ? '#991B1B' : '#374151', textDecoration: itemRelatorio.status === 'missing' ? 'line-through' : 'none' }}>
                      {itemRelatorio.name}
                    </span>
                    {itemRelatorio.critical && <span className="text-xs font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">CRÍTICO</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{itemRelatorio.quantity} {itemRelatorio.unit}</span>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: coresDaCategoria.fundo, color: coresDaCategoria.texto }}>{itemRelatorio.category}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">{itemRelatorio.confirmedAt}</div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{relatorio.confirmed} confirmados</span>
            {relatorio.missing > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{relatorio.missing} faltando</span>}
          </div>
          <button onClick={aoFechar} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const [relatorios, definirRelatorios] = useState<ChecklistReport[]>(apiEstaConfigurada ? [] : historicoDeConferencias);
  const [relatorioSelecionado, definirRelatorioSelecionado] = useState<ChecklistReport | null>(null);
  const [statusFiltrado, definirStatusFiltrado] = useState<'all' | 'ok' | 'divergencia'>('all');
  const [dataFiltrada, definirDataFiltrada] = useState('all');
  const [erroDeCarregamento, definirErroDeCarregamento] = useState('');

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    clienteApi.reports.list().then(definirRelatorios).catch((erro: unknown) => {
      definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar os relatórios.');
    });
  }, []);

  const quantidadeSemDivergencia = relatorios.filter((relatorio) => relatorio.status === 'ok').length;
  const quantidadeComDivergencia = relatorios.filter((relatorio) => relatorio.status === 'divergencia').length;

  const datasDisponiveis = ['all', ...Array.from(new Set(relatorios.map((relatorio) => relatorio.date)))];

  const relatoriosFiltrados = relatorios.filter((relatorio) => {
    if (statusFiltrado !== 'all' && relatorio.status !== statusFiltrado) return false;
    if (dataFiltrada !== 'all' && relatorio.date !== dataFiltrada) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {relatorioSelecionado && <ModalDeDetalhes relatorio={relatorioSelecionado} aoFechar={() => definirRelatorioSelecionado(null)} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Relatórios de Conferência</h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{relatorios.length} sessões registradas</p>
              {erroDeCarregamento && <p role="alert" className="text-xs text-red-600 mt-1">Falha ao carregar relatórios: {erroDeCarregamento}</p>}
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans' }}>{relatorios.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">Total</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-emerald-700" style={{ fontFamily: 'Plus Jakarta Sans' }}>{quantidadeSemDivergencia}</div>
              <div className="text-xs text-emerald-600 mt-0.5">Sem divergências</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-red-700" style={{ fontFamily: 'Plus Jakarta Sans' }}>{quantidadeComDivergencia}</div>
              <div className="text-xs text-red-500 mt-0.5">Com divergências</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {([
              { key: 'all', label: 'Todos' },
              { key: 'ok', label: 'Completo' },
              { key: 'divergencia', label: 'Divergência' },
            ] as const).map(({ key: identificadorDoFiltro, label: rotuloDoFiltro }) => (
              <button
                key={identificadorDoFiltro}
                onClick={() => definirStatusFiltrado(identificadorDoFiltro)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
                style={statusFiltrado === identificadorDoFiltro
                  ? { backgroundColor: identificadorDoFiltro === 'divergencia' ? '#DC2626' : identificadorDoFiltro === 'ok' ? '#059669' : '#1E40AF', color: '#FFF', borderColor: 'transparent' }
                  : { backgroundColor: '#FFF', color: '#6B7280', borderColor: '#E5E7EB' }}
              >
                {rotuloDoFiltro}
              </button>
            ))}
          </div>
          <select
            value={dataFiltrada}
            onChange={(evento) => definirDataFiltrada(evento.target.value)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 ml-auto"
          >
            {datasDisponiveis.map((data) => <option key={data} value={data}>{data === 'all' ? 'Todas as datas' : data}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="max-w-screen-xl mx-auto space-y-3">
          {relatoriosFiltrados.length === 0 && (
            <div className="text-center py-12 text-gray-400">Nenhum relatório encontrado.</div>
          )}
          {relatoriosFiltrados.map((relatorio) => {
            const percentual = Math.round((relatorio.confirmed / relatorio.total) * 100);
            return (
              <button
                key={relatorio.id}
                onClick={() => definirRelatorioSelecionado(relatorio)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 hover:shadow-md hover:border-blue-100 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Left: status icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: relatorio.status === 'ok' ? '#D1FAE5' : '#FEE2E2' }}
                  >
                    {relatorio.status === 'ok' ? (
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M5 13l4 4L19 7" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M12 8v4M12 16h.01" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" /></svg>
                    )}
                  </div>

                  {/* Center: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-800 text-sm sm:text-base truncate" style={{ fontFamily: 'Plus Jakarta Sans' }}>{relatorio.surgeryName}</div>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-xs text-gray-400">{relatorio.specialty}</span>
                          <span className="text-xs text-gray-300">&bull;</span>
                          <span className="text-xs text-gray-500 font-medium">{relatorio.operator}</span>
                          <span className="text-xs text-gray-300">&bull;</span>
                          <span className="text-xs text-gray-400">{relatorio.date} às {relatorio.time}</span>
                        </div>
                      </div>
                      <SeloDeStatusDoRelatorio estado={relatorio.status} />
                    </div>

                    {/* Progress */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${percentual}%`, backgroundColor: relatorio.status === 'ok' ? '#10B981' : '#EF4444' }} />
                      </div>
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: relatorio.status === 'ok' ? '#059669' : '#DC2626' }}>{relatorio.confirmed}/{relatorio.total}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{relatorio.duration}</span>
                    </div>

                    {/* Missing items preview */}
                    {relatorio.missing > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-red-600 font-semibold">Faltando:</span>
                        {relatorio.items.filter((itemRelatorio) => itemRelatorio.status === 'missing').map((itemRelatorio) => (
                          <span key={itemRelatorio.id} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{itemRelatorio.name}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-gray-300 flex-shrink-0 hidden sm:block" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
