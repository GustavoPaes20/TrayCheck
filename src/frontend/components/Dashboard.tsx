import { useEffect, useState } from 'react';
import { cirurgiasCadastradas, itensDeEstoqueDemonstracao, AuthUser, View } from '../data/mockData';
import { clienteApi, DashboardSummary, apiEstaConfigurada } from '../services/api';

type DashboardProps = {
  navegarPara: (tela: View, idCirurgia?: string) => void;
  usuario: AuthUser;
};

const totalCirurgiasDemonstracao = cirurgiasCadastradas.reduce((total, cirurgia) => total + cirurgia.scheduledToday, 0);

const agendaDemonstracao: Omit<DashboardSummary['schedule'][number], 'surgeryId'>[] = [
  { time: '07:00', surgery: 'Revascularização Cardíaca', room: 'Sala 1', surgeon: 'Dr. Marcos Alves', status: 'em-andamento', id: 'cardio' },
  { time: '08:00', surgery: 'Artroscopia de Joelho', room: 'Sala 2', surgeon: 'Dra. Fernanda Costa', status: 'aguardando', id: 'joelho' },
  { time: '09:30', surgery: 'Herniorrafia Laparoscópica', room: 'Sala 4', surgeon: 'Dr. Rafael Lima', status: 'aguardando', id: 'hernia' },
  { time: '10:00', surgery: 'Artrodese de Coluna', room: 'Sala 3', surgeon: 'Dr. Bruno Mendes', status: 'aguardando', id: 'coluna' },
  { time: '11:00', surgery: 'Cesariana', room: 'Sala 5', surgeon: 'Dra. Ana Souza', status: 'aguardando', id: 'cesarea' },
  { time: '14:00', surgery: 'Apendicectomia', room: 'Sala 2', surgeon: 'Dr. Pedro Rocha', status: 'aguardando', id: 'apendicite' },
];

const configuracaoDeStatus: Record<string, { rotulo: string; fundo: string; corDoTexto: string; corDoPonto: string }> = {
  'em-andamento': { rotulo: 'Em andamento', fundo: '#FEF3C7', corDoTexto: '#92400E', corDoPonto: '#F59E0B' },
  aguardando: { rotulo: 'Aguardando', fundo: '#DBEAFE', corDoTexto: '#1D4ED8', corDoPonto: '#3B82F6' },
  concluida: { rotulo: 'Concluída', fundo: '#D1FAE5', corDoTexto: '#065F46', corDoPonto: '#10B981' },
};

function CartaoDeIndicador({ rotulo, valor, complemento, cor, icone, tendencia }: {
  rotulo: string; valor: string | number; complemento?: string; cor: string;
  icone: React.ReactNode; tendencia?: { text: string; positive: boolean };
}) {
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 flex gap-3 sm:gap-4 items-start min-w-0">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cor + '18', color: cor }}>
        {icone}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 truncate">{rotulo}</div>
        <div className="text-2xl sm:text-3xl font-bold text-gray-800 mt-0.5 leading-none" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {valor}
        </div>
        {complemento && <div className="text-xs text-gray-400 mt-1 truncate">{complemento}</div>}
        {tendencia && (
          <div className="text-xs font-semibold mt-1 truncate" style={{ color: tendencia.positive ? '#10B981' : '#EF4444' }}>
            {tendencia.positive ? '▲' : '▼'} {tendencia.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ navegarPara, usuario }: DashboardProps) {
  const [resumo, definirResumo] = useState<DashboardSummary | null>(apiEstaConfigurada ? null : {
    totalSurgeries: totalCirurgiasDemonstracao,
    readyKits: 11,
    criticalStockItems: itensDeEstoqueDemonstracao.filter((item) => item.status === 'critical').length,
    lowStockItems: itensDeEstoqueDemonstracao.filter((item) => item.status === 'low').length,
    stockItemCount: itensDeEstoqueDemonstracao.length,
    surgeryTrend: { text: '2 a mais que ontem', positive: true },
    schedule: agendaDemonstracao.map((cirurgia) => ({ ...cirurgia, surgeryId: cirurgia.id })),
  });
  const [estoque, definirEstoque] = useState(apiEstaConfigurada ? [] : itensDeEstoqueDemonstracao);
  const [erroDeCarregamento, definirErroDeCarregamento] = useState('');

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    Promise.all([clienteApi.dashboard.getSummary(), clienteApi.stock.list()]).then(([dadosDoPainel, itensDoEstoque]) => {
      definirResumo(dadosDoPainel);
      definirEstoque(itensDoEstoque);
    }).catch((erro: unknown) => {
      definirErroDeCarregamento(erro instanceof Error ? erro.message : 'Não foi possível carregar o painel.');
    });
  }, []);

  const totalCirurgias = resumo?.totalSurgeries ?? 0;
  const alertasCriticos = resumo?.criticalStockItems ?? estoque.filter((itemEstoque) => itemEstoque.status === 'critical').length;
  const alertasBaixos = resumo?.lowStockItems ?? estoque.filter((itemEstoque) => itemEstoque.status === 'low').length;
  const agenda = resumo?.schedule ?? [];
  const agora = new Date();
  const horaAtual = agora.getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero banner */}
      <div className="relative overflow-hidden px-4 sm:px-8 py-6 sm:py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border-b border-gray-100">
        {/* Subtle accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full" style={{ backgroundColor: '#2563EB' }} />
        <div className="pl-4">
          <p className="text-gray-400 text-xs sm:text-sm font-medium mb-1 capitalize">
            {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h2 className="text-gray-900 text-xl sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {saudacao}, {usuario.name.split(' ')[0]}.
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{usuario.shift} &bull; {usuario.hospital}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 pl-4 sm:pl-0">
          <div className="text-right hidden sm:block">
            <div className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Horário atual</div>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="#2563EB" strokeWidth={1.8} className="w-5 h-5">
              <rect x="3" y="4" width="14" height="13" rx="2" /><path d="M7 2v4M13 2v4M3 9h14" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-5 sm:space-y-6 max-w-screen-xl mx-auto">
        {erroDeCarregamento && <p role="alert" className="text-sm text-red-600">Falha ao carregar painel: {erroDeCarregamento}</p>}
        {/* Stats */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <CartaoDeIndicador rotulo="Cirurgias Hoje" valor={totalCirurgias} complemento="agendadas no turno" cor="#2563EB"
            tendencia={resumo?.surgeryTrend}
            icone={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M17 3L8 12" strokeLinecap="round" /><path d="M8 12l-4 3.5c-.7.6-.7 1.5 0 2 .6.5 1.5.4 2-.2L10 14" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          />
          <CartaoDeIndicador rotulo="Kits Prontos" valor={resumo?.readyKits ?? 0} complemento="verificados e disponíveis" cor="#10B981"
            icone={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M10 2L2 6l8 4 8-4-8-4z" strokeLinejoin="round" /><path d="M2 14l8 4 8-4M2 10l8 4 8-4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          />
          <CartaoDeIndicador rotulo="Alertas Críticos" valor={alertasCriticos} complemento="reposição urgente" cor="#EF4444"
            tendencia={{ text: 'Atenção imediata', positive: false }}
            icone={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M9 3L1 16h16L9 3z" strokeLinejoin="round" /><line x1="9" y1="9" x2="9" y2="12" strokeLinecap="round" /><circle cx="9" cy="14.5" r="0.8" fill="currentColor" stroke="none" /></svg>}
          />
          <CartaoDeIndicador rotulo="Itens em Estoque" valor={resumo?.stockItemCount ?? estoque.length} complemento={`${alertasBaixos} com nível baixo`} cor="#F59E0B"
            icone={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><rect x="2" y="7" width="16" height="11" rx="2" /><path d="M13 7V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" strokeLinecap="round" /></svg>}
          />
        </div>

        {/* Schedule + Alerts */}
        <div className="flex flex-col xl:flex-row gap-5 sm:gap-6">
          {/* Schedule */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-50">
              <div>
                <h3 className="font-bold text-gray-800 text-base sm:text-lg" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Programação de Hoje
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{totalCirurgias} cirurgias agendadas</p>
              </div>
              <button
                onClick={() => navegarPara('surgeries')}
                className="text-xs sm:text-sm text-blue-600 font-semibold hover:text-blue-800 transition-colors flex items-center gap-1 flex-shrink-0"
              >
                Ver kits
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2}><path d="M6 12l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {agenda.map((cirurgia) => {
                const configuracao = configuracaoDeStatus[cirurgia.status];
                return (
                  <div key={cirurgia.id} className="flex items-center gap-3 sm:gap-4 px-5 sm:px-6 py-3.5 hover:bg-blue-50/30 transition-colors group">
                    <div className="text-sm font-bold text-blue-700 w-12 flex-shrink-0" style={{ fontFamily: 'Plus Jakarta Sans' }}>{cirurgia.time}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm truncate">{cirurgia.surgery}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{cirurgia.surgeon} &bull; {cirurgia.room}</div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 hidden sm:flex" style={{ backgroundColor: configuracao.fundo, color: configuracao.corDoTexto }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: configuracao.corDoPonto }} />
                      {configuracao.rotulo}
                    </div>
                    <button
                      onClick={() => navegarPara('voice-checklist', cirurgia.surgeryId)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                    >
                      <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth={2}><rect x="5" y="1" width="6" height="9" rx="3" /><path d="M2 8a6 6 0 0012 0M8 14v-3" strokeLinecap="round" /></svg>
                      Conferir
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column */}
          <div className="xl:w-72 space-y-4 flex-shrink-0">
            {/* Alerts */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-blink" />
                <h3 className="font-bold text-gray-800 text-sm" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Alertas de Estoque</h3>
              </div>
              <div className="p-3 space-y-2">
                {estoque.filter((itemEstoque) => itemEstoque.status !== 'ok').slice(0, 4).map((itemEstoque) => (
                  <div
                    key={itemEstoque.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: itemEstoque.status === 'critical' ? '#FEF2F2' : '#FFFBEB' }}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: itemEstoque.status === 'critical' ? '#EF4444' : '#F59E0B' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{itemEstoque.name}</div>
                      <div className="text-xs truncate" style={{ color: itemEstoque.status === 'critical' ? '#B91C1C' : '#92400E' }}>
                        {itemEstoque.available}/{itemEstoque.minimum} {itemEstoque.unit}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => navegarPara('stock')}
                  className="w-full text-center text-xs text-blue-600 font-semibold py-2 hover:text-blue-800 transition-colors"
                >
                  Ver estoque completo
                </button>
              </div>
            </div>

            {/* Quick start voice */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="#2563EB" strokeWidth={1.8} className="w-5 h-5">
                    <rect x="7" y="2" width="6" height="10" rx="3" /><path d="M4 9a6 6 0 0012 0M10 18v-4" strokeLinecap="round" /><line x1="6.5" y1="19.5" x2="13.5" y2="19.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Conferência por Voz</h3>
                  <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">Verifique equipamentos cirúrgicos por comando de voz</p>
                </div>
              </div>
              <button
                onClick={() => navegarPara('voice-checklist')}
                className="w-full flex items-center justify-center gap-2 font-semibold text-sm text-white py-2.5 rounded-xl transition-colors"
                style={{ backgroundColor: '#1E3A8A' }}
              >
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}><rect x="5" y="1" width="6" height="9" rx="3" /><path d="M2 8a6 6 0 0012 0M8 14v-3" strokeLinecap="round" /></svg>
                Iniciar Conferência
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
