import { useEffect, useState } from 'react';
import { itensDeEstoqueDemonstracao, StockItem } from '../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../services/api';

function SeloDeStatus({ estado }: { estado: StockItem['status'] }) {
  const configuracao = {
    ok: { rotulo: 'OK', fundo: '#D1FAE5', cor: '#065F46' },
    low: { rotulo: 'BAIXO', fundo: '#FEF3C7', cor: '#92400E' },
    critical: { rotulo: 'CRÍTICO', fundo: '#FEE2E2', cor: '#991B1B' },
  }[estado];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: configuracao.fundo, color: configuracao.cor }}>
      {estado !== 'ok' && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: configuracao.cor }} />}
      {configuracao.rotulo}
    </span>
  );
}

export default function StockInventory() {
  const [itensEstoque, definirItensEstoque] = useState<StockItem[]>(apiEstaConfigurada ? [] : itensDeEstoqueDemonstracao);
  const [categoriaFiltrada, definirCategoriaFiltrada] = useState('Todos');
  const [statusFiltrado, definirStatusFiltrado] = useState<'all' | StockItem['status']>('all');
  const [termoBusca, definirTermoBusca] = useState('');
  const [erroDeCarregamento, definirErroDeCarregamento] = useState('');

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    clienteApi.stock.list().then(definirItensEstoque).catch((erro: unknown) => {
      definirItensEstoque([]);
      definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar o estoque.');
    });
  }, []);

  const categorias = ['Todos', ...Array.from(new Set(itensEstoque.map((itemEstoque) => itemEstoque.category)))];

  const itensFiltrados = itensEstoque
    .filter((itemEstoque) => {
      if (categoriaFiltrada !== 'Todos' && itemEstoque.category !== categoriaFiltrada) return false;
      if (statusFiltrado !== 'all' && itemEstoque.status !== statusFiltrado) return false;
      if (termoBusca && !itemEstoque.name.toLowerCase().includes(termoBusca.toLowerCase())) return false;
      return true;
    })
    .sort((primeiroItem, segundoItem) => {
      const ordemDePrioridade = { critical: 0, low: 1, ok: 2 };
      return ordemDePrioridade[primeiroItem.status] - ordemDePrioridade[segundoItem.status];
    });

  const quantidadeCritica = itensEstoque.filter((itemEstoque) => itemEstoque.status === 'critical').length;
  const quantidadeBaixa = itensEstoque.filter((itemEstoque) => itemEstoque.status === 'low').length;
  const quantidadeNormal = itensEstoque.filter((itemEstoque) => itemEstoque.status === 'ok').length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 sm:py-5 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Controle de Estoque</h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{itensEstoque.length} itens monitorados</p>
              {erroDeCarregamento && <p role="alert" className="text-xs text-red-600 mt-1">Falha ao carregar estoque: {erroDeCarregamento}</p>}
            </div>
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: 'all', label: 'Todos', count: itensEstoque.length, color: '#1E40AF' },
              { key: 'critical', label: 'Crítico', count: quantidadeCritica, color: '#DC2626' },
              { key: 'low', label: 'Baixo', count: quantidadeBaixa, color: '#D97706' },
              { key: 'ok', label: 'Normal', count: quantidadeNormal, color: '#059669' },
            ] as const).map(({ key: identificadorDoFiltro, label: rotulo, count: quantidade, color: cor }) => (
              <button
                key={identificadorDoFiltro}
                onClick={() => definirStatusFiltrado(identificadorDoFiltro)}
                className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                style={statusFiltrado === identificadorDoFiltro ? { backgroundColor: cor, color: '#FFF' } : { backgroundColor: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB' }}
              >
                {rotulo}
                <span className="text-xs opacity-70 font-bold">{quantidade}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" stroke="currentColor" strokeWidth={2}><circle cx="7" cy="7" r="5" /><path d="M14 14l-3-3" strokeLinecap="round" /></svg>
            <input type="text" placeholder="Buscar..." value={termoBusca} onChange={(evento) => definirTermoBusca(evento.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm" />
          </div>
          <div className="flex items-center gap-2 flex-wrap overflow-x-auto">
            {categorias.map((categoria) => (
              <button
                key={categoria}
                onClick={() => definirCategoriaFiltrada(categoria)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
                style={categoriaFiltrada === categoria ? { backgroundColor: '#1E40AF', color: '#FFF', borderColor: '#1E40AF' } : { backgroundColor: '#FFF', color: '#6B7280', borderColor: '#E5E7EB' }}
              >
                {categoria}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        <div className="max-w-screen-xl mx-auto">
          {quantidadeCritica > 0 && statusFiltrado !== 'ok' && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-blink flex-shrink-0" />
              <span className="font-semibold text-red-700 text-sm">{quantidadeCritica} item(s) em estado crítico — reposição urgente necessária.</span>
            </div>
          )}

          {/* Mobile card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:hidden gap-3">
            {itensFiltrados.map((itemEstoque) => {
              const percentual = Math.min(100, Math.round((itemEstoque.available / (itemEstoque.minimum * 2)) * 100));
              const corDaBarra = itemEstoque.status === 'critical' ? '#EF4444' : itemEstoque.status === 'low' ? '#F59E0B' : '#10B981';
              return (
                <div key={itemEstoque.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm truncate">{itemEstoque.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{itemEstoque.category}</div>
                    </div>
                    <SeloDeStatus estado={itemEstoque.status} />
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    <div>
                      <span className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: corDaBarra }}>{itemEstoque.available}</span>
                      <span className="text-xs text-gray-400 ml-1">{itemEstoque.unit}</span>
                    </div>
                    <div className="text-xs text-gray-400">mín. {itemEstoque.minimum}</div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${percentual}%`, backgroundColor: corDaBarra }} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1.5">Atualizado por {itemEstoque.updatedBy}</div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden xl:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.5fr 1fr 1fr' }}>
              <div>Item</div><div className="text-center">Disponível</div><div className="text-center">Mínimo</div><div>Nível</div><div className="text-center">Status</div><div className="text-right">Atualização</div>
            </div>
            {itensFiltrados.length === 0 ? (
              <div className="text-center py-12 text-gray-400">Nenhum item encontrado.</div>
            ) : (
              itensFiltrados.map((itemEstoque) => {
                const percentual = Math.min(100, Math.round((itemEstoque.available / (itemEstoque.minimum * 2)) * 100));
                const corDaBarra = itemEstoque.status === 'critical' ? '#EF4444' : itemEstoque.status === 'low' ? '#F59E0B' : '#10B981';
                return (
                  <div key={itemEstoque.id} className="grid gap-4 px-6 py-4 border-b border-gray-50 last:border-0 hover:bg-blue-50/20 transition-colors items-center" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.5fr 1fr 1fr' }}>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{itemEstoque.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{itemEstoque.category} · {itemEstoque.updatedBy}</div>
                    </div>
                    <div className="text-center">
                      <span className="text-xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: corDaBarra }}>{itemEstoque.available}</span>
                      <span className="text-xs text-gray-400 ml-1">{itemEstoque.unit}</span>
                    </div>
                    <div className="text-center text-sm text-gray-500">{itemEstoque.minimum} {itemEstoque.unit}</div>
                    <div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full transition-all" style={{ width: `${percentual}%`, backgroundColor: corDaBarra }} />
                      </div>
                      <div className="text-xs text-gray-400">{percentual}%</div>
                    </div>
                    <div className="flex justify-center"><SeloDeStatus estado={itemEstoque.status} /></div>
                    <div className="text-right text-xs text-gray-400">{itemEstoque.lastUpdated}</div>
                  </div>
                );
              })
            )}
          </div>

          {itensFiltrados.length === 0 && (
            <div className="xl:hidden text-center py-12 text-gray-400">Nenhum item encontrado.</div>
          )}
          <div className="mt-3 text-xs text-gray-400 text-right">{itensFiltrados.length} de {itensEstoque.length} itens</div>
        </div>
      </div>
    </div>
  );
}
