import { useEffect, useState } from 'react';
import { itensDeEstoqueDemonstracao as itensIniciais, StockItem } from '../../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../../services/api';

const opcoesDeCategorias = ['EPI', 'Instrumental', 'Descartável', 'Anestesia', 'Implante'];
const opcoesDeUnidades = ['unid', 'pares', 'amp', 'bolsas', 'kit', 'cilindro', 'caixas'];

type DadosDoModalDeEstoque = Partial<StockItem> & { novoItem?: boolean };

function SeloDeStatusDoEstoque({ estado }: { estado: StockItem['status'] }) {
  const configuracao = {
    ok: { rotulo: 'OK', fundo: '#D1FAE5', texto: '#065F46' },
    low: { rotulo: 'BAIXO', fundo: '#FEF3C7', texto: '#92400E' },
    critical: { rotulo: 'CRÍTICO', fundo: '#FEE2E2', texto: '#991B1B' },
  }[estado];
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: configuracao.fundo, color: configuracao.texto }}>
      {configuracao.rotulo}
    </span>
  );
}

function ModalDeEstoque({
  dados,
  aoSalvar,
  aoFechar,
}: {
  dados: DadosDoModalDeEstoque;
  aoSalvar: (item: Omit<StockItem, 'status' | 'lastUpdated' | 'updatedBy'> & { id: string }) => void;
  aoFechar: () => void;
}) {
  const [dadosDoFormulario, definirDadosDoFormulario] = useState({
    name: dados.name || '',
    category: dados.category || 'EPI',
    available: dados.available ?? 0,
    minimum: dados.minimum ?? 10,
    unit: dados.unit || 'unid',
  });

  function enviarFormulario(evento: React.FormEvent) {
    evento.preventDefault();
    aoSalvar({ id: dados.id || `item-${Date.now()}`, ...dadosDoFormulario });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {dados.novoItem ? 'Adicionar Item ao Estoque' : 'Editar Item'}
          </h2>
          <button onClick={aoFechar} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <form onSubmit={enviarFormulario} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome do item</label>
            <input
              value={dadosDoFormulario.name}
              onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, name: evento.target.value }))}
              required
              placeholder="Ex: Luvas Estéreis 7.5"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Categoria</label>
              <select
                value={dadosDoFormulario.category}
                onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, category: evento.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
              >
                {opcoesDeCategorias.map((categoria) => <option key={categoria}>{categoria}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Unidade</label>
              <select
                value={dadosDoFormulario.unit}
                onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, unit: evento.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
              >
                {opcoesDeUnidades.map((unidade) => <option key={unidade}>{unidade}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Quantidade disponível</label>
              <input
                type="number"
                min={0}
                value={dadosDoFormulario.available}
                onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, available: Number(evento.target.value) }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mínimo recomendado</label>
              <input
                type="number"
                min={1}
                value={dadosDoFormulario.minimum}
                onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, minimum: Number(evento.target.value) }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
              />
            </div>
          </div>
          {dadosDoFormulario.available < dadosDoFormulario.minimum && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Atenção: quantidade disponível está abaixo do mínimo recomendado.
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={aoFechar} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #1E3A8A, #2563EB)' }}
            >
              {dados.novoItem ? 'Adicionar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StockManager() {
  const [itensEstoque, definirItensEstoque] = useState<StockItem[]>(apiEstaConfigurada ? [] : itensIniciais);
  const [dadosDoModal, definirDadosDoModal] = useState<DadosDoModalDeEstoque | null>(null);
  const [termoDeBusca, definirTermoDeBusca] = useState('');
  const [categoriaFiltrada, definirCategoriaFiltrada] = useState('Todos');
  const [statusFiltrado, definirStatusFiltrado] = useState<'all' | StockItem['status']>('all');
  const [idDoItemAExcluir, definirIdDoItemAExcluir] = useState<string | null>(null);
  const [erroDaApi, definirErroDaApi] = useState('');

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    clienteApi.stock.list().then(definirItensEstoque).catch((erro: unknown) => {
      definirItensEstoque([]);
      definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível carregar o estoque.');
    });
  }, []);

  const categorias = ['Todos', ...opcoesDeCategorias];

  function calcularStatusDoEstoque(quantidadeDisponivel: number, quantidadeMinima: number): StockItem['status'] {
    if (quantidadeDisponivel < quantidadeMinima * 0.5) return 'critical';
    if (quantidadeDisponivel < quantidadeMinima) return 'low';
    return 'ok';
  }

  async function salvarItemDoEstoque(dados: Omit<StockItem, 'status' | 'lastUpdated' | 'updatedBy'> & { id: string }) {
    definirErroDaApi('');
    if (apiEstaConfigurada) {
      try {
        const dadosParaApi = { name: dados.name, category: dados.category, available: dados.available, minimum: dados.minimum, unit: dados.unit };
        const itemJaExiste = itensEstoque.some((itemEstoque) => itemEstoque.id === dados.id);
        const itemSalvo = itemJaExiste ? await clienteApi.stock.update(dados.id, dadosParaApi) : await clienteApi.stock.create(dadosParaApi);
        definirItensEstoque((itensAnteriores) => itemJaExiste ? itensAnteriores.map((itemEstoque) => itemEstoque.id === itemSalvo.id ? itemSalvo : itemEstoque) : [itemSalvo, ...itensAnteriores]);
        definirDadosDoModal(null);
      } catch (erro: unknown) {
        definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível salvar o item.');
      }
      return;
    }

    const dataAtualizacao = new Date().toLocaleDateString('pt-BR');
    const statusCalculado = calcularStatusDoEstoque(dados.available, dados.minimum);
    const novoItem: StockItem = { ...dados, status: statusCalculado, lastUpdated: dataAtualizacao, updatedBy: 'Carlos Mendes' };
    definirItensEstoque((itensAnteriores) => {
      const itemExistente = itensAnteriores.find((itemEstoque) => itemEstoque.id === dados.id);
      if (itemExistente) return itensAnteriores.map((itemEstoque) => (itemEstoque.id === dados.id ? novoItem : itemEstoque));
      return [novoItem, ...itensAnteriores];
    });
    definirDadosDoModal(null);
  }

  async function excluirItemDoEstoque(idDoItem: string) {
    definirErroDaApi('');
    if (apiEstaConfigurada) {
      try {
        await clienteApi.stock.remove(idDoItem);
      } catch (erro: unknown) {
        definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível excluir o item.');
        return;
      }
    }
    definirItensEstoque((itensAnteriores) => itensAnteriores.filter((itemEstoque) => itemEstoque.id !== idDoItem));
    definirIdDoItemAExcluir(null);
  }

  async function ajustarQuantidadeDoEstoque(idDoItem: string, variacao: number) {
    definirErroDaApi('');
    if (apiEstaConfigurada) {
      try {
        const itemAtualizado = await clienteApi.stock.adjust(idDoItem, variacao);
        definirItensEstoque((itensAnteriores) => itensAnteriores.map((itemEstoque) => itemEstoque.id === idDoItem ? itemAtualizado : itemEstoque));
      } catch (erro: unknown) {
        definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível ajustar o estoque.');
      }
      return;
    }
    definirItensEstoque((itensAnteriores) =>
      itensAnteriores.map((itemEstoque) => {
        if (itemEstoque.id !== idDoItem) return itemEstoque;
        const quantidadeDisponivel = Math.max(0, itemEstoque.available + variacao);
        return { ...itemEstoque, available: quantidadeDisponivel, status: calcularStatusDoEstoque(quantidadeDisponivel, itemEstoque.minimum), lastUpdated: new Date().toLocaleDateString('pt-BR') };
      })
    );
  }

  const itensFiltrados = itensEstoque.filter((itemEstoque) => {
    if (categoriaFiltrada !== 'Todos' && itemEstoque.category !== categoriaFiltrada) return false;
    if (statusFiltrado !== 'all' && itemEstoque.status !== statusFiltrado) return false;
    if (termoDeBusca && !itemEstoque.name.toLowerCase().includes(termoDeBusca.toLowerCase())) return false;
    return true;
  });

  const quantidadeCritica = itensEstoque.filter((itemEstoque) => itemEstoque.status === 'critical').length;
  const quantidadeBaixa = itensEstoque.filter((itemEstoque) => itemEstoque.status === 'low').length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {dadosDoModal && (
        <ModalDeEstoque
          dados={dadosDoModal}
          aoSalvar={salvarItemDoEstoque}
          aoFechar={() => definirDadosDoModal(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-5 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Gerenciar Estoque
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">{itensEstoque.length} itens · {quantidadeCritica} críticos · {quantidadeBaixa} baixos</p>
            {erroDaApi && <p role="alert" className="text-xs text-red-600 mt-1">{erroDaApi}</p>}
          </div>
          <button
            onClick={() => definirDadosDoModal({ novoItem: true })}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1E3A8A, #2563EB)' }}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z" />
            </svg>
            Adicionar item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" stroke="currentColor" strokeWidth={2}>
              <circle cx="7" cy="7" r="5" /><path d="M14 14l-3-3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Buscar item..."
              value={termoDeBusca}
              onChange={(evento) => definirTermoDeBusca(evento.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
            {(['all', 'critical', 'low', 'ok'] as const).map((status) => {
              const rotulosDosStatus = { all: 'Todos', critical: 'Crítico', low: 'Baixo', ok: 'Normal' };
              const coresAtivasDosStatus = { all: '#1E40AF', critical: '#DC2626', low: '#D97706', ok: '#059669' };
              return (
                <button
                  key={status}
                  onClick={() => definirStatusFiltrado(status)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
                  style={statusFiltrado === status ? { backgroundColor: coresAtivasDosStatus[status], color: '#fff', borderColor: coresAtivasDosStatus[status] } : { backgroundColor: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}
                >
                  {rotulosDosStatus[status]}
                </button>
              );
            })}
            <div className="w-px h-4 bg-gray-200 hidden sm:block" />
            {categorias.map((categoria) => (
              <button
                key={categoria}
                onClick={() => definirCategoriaFiltrada(categoria)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap"
                style={categoriaFiltrada === categoria ? { backgroundColor: '#1E40AF', color: '#fff', borderColor: '#1E40AF' } : { backgroundColor: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}
              >
                {categoria}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-screen-xl mx-auto">
          {/* Mobile cards */}
          <div className="block sm:hidden space-y-3">
            {itensFiltrados.map((itemEstoque) => (
              <div key={itemEstoque.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{itemEstoque.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{itemEstoque.category}</div>
                  </div>
                  <SeloDeStatusDoEstoque estado={itemEstoque.status} />
                </div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans' }}>{itemEstoque.available}</div>
                    <div className="text-xs text-gray-400">disponível</div>
                  </div>
                  <div className="text-gray-300">/</div>
                  <div className="text-center">
                    <div className="text-base font-semibold text-gray-500">{itemEstoque.minimum}</div>
                    <div className="text-xs text-gray-400">mínimo</div>
                  </div>
                  <div className="text-xs text-gray-400">{itemEstoque.unit}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => ajustarQuantidadeDoEstoque(itemEstoque.id, -1)} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 font-bold text-lg flex items-center justify-center hover:bg-red-100 transition-colors">−</button>
                  <button onClick={() => ajustarQuantidadeDoEstoque(itemEstoque.id, 1)} className="w-8 h-8 rounded-lg bg-green-50 text-green-600 font-bold text-lg flex items-center justify-center hover:bg-green-100 transition-colors">+</button>
                  <button onClick={() => definirDadosDoModal(itemEstoque)} className="flex-1 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">Editar</button>
                  <button onClick={() => definirIdDoItemAExcluir(itemEstoque.id)} className="w-8 h-8 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z" />
                      <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-blue-50 overflow-hidden">
            <div className="grid gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto' }}>
              <div>Item</div>
              <div className="text-center">Disponível</div>
              <div className="text-center">Mínimo</div>
              <div>Nível</div>
              <div className="text-center">Status</div>
              <div>Ações</div>
            </div>
            {itensFiltrados.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Nenhum item encontrado.</div>
            ) : (
              itensFiltrados.map((itemEstoque) => {
                const percentualDoEstoque = Math.min(100, Math.round((itemEstoque.available / (itemEstoque.minimum * 2)) * 100));
                const corDaBarra = itemEstoque.status === 'critical' ? '#EF4444' : itemEstoque.status === 'low' ? '#F59E0B' : '#10B981';
                return (
                  <div
                    key={itemEstoque.id}
                    className="grid gap-4 px-6 py-4 border-b border-gray-50 last:border-0 hover:bg-blue-50/20 transition-colors items-center"
                    style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto' }}
                  >
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{itemEstoque.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{itemEstoque.category} · Atualizado por {itemEstoque.updatedBy}</div>
                    </div>
                    <div className="text-center">
                      <span className="text-xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans', color: corDaBarra }}>{itemEstoque.available}</span>
                      <span className="text-xs text-gray-400 ml-1">{itemEstoque.unit}</span>
                    </div>
                    <div className="text-center text-sm text-gray-500">{itemEstoque.minimum} {itemEstoque.unit}</div>
                    <div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentualDoEstoque}%`, backgroundColor: corDaBarra }} />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{percentualDoEstoque}%</div>
                    </div>
                    <div className="flex justify-center"><SeloDeStatusDoEstoque estado={itemEstoque.status} /></div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => ajustarQuantidadeDoEstoque(itemEstoque.id, -5)} className="w-7 h-7 rounded-md bg-red-50 text-red-500 text-xs font-bold flex items-center justify-center hover:bg-red-100 transition-colors" title="−5">−5</button>
                      <button onClick={() => ajustarQuantidadeDoEstoque(itemEstoque.id, 5)} className="w-7 h-7 rounded-md bg-green-50 text-green-600 text-xs font-bold flex items-center justify-center hover:bg-green-100 transition-colors" title="+5">+5</button>
                      <button onClick={() => definirDadosDoModal(itemEstoque)} className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Editar">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10z" />
                        </svg>
                      </button>
                      <button onClick={() => definirIdDoItemAExcluir(itemEstoque.id)} className="w-7 h-7 rounded-md bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors" title="Excluir">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z" />
                          <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400 text-right">{itensFiltrados.length} de {itensEstoque.length} itens</div>
        </div>
      </div>

      {/* Delete confirm */}
      {idDoItemAExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-fade-in-up text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 20 20" fill="#EF4444" className="w-7 h-7">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1" style={{ fontFamily: 'Plus Jakarta Sans' }}>Excluir item?</h3>
            <p className="text-gray-500 text-sm mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => definirIdDoItemAExcluir(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => excluirItemDoEstoque(idDoItemAExcluir)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
