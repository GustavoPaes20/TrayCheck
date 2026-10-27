import { useEffect, useState } from 'react';
import { AuthUser, StockItem, View } from './data/mockData';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Profile from './components/Profile';
import Dashboard from './components/Dashboard';
import SurgeryKits from './components/SurgeryKits';
import VoiceChecklist from './components/VoiceChecklist';
import StockInventory from './components/StockInventory';
import Reports from './components/Reports';
import StockManager from './components/admin/StockManager';
import UserManager from './components/admin/UserManager';
import { clienteApi, apiEstaConfigurada } from './services/api';

const telasRestritasAoAdministrador: View[] = ['admin-dashboard', 'admin-stock', 'admin-kits', 'admin-users'];

const itensNavegacaoMovel: { identificador: View; rotulo: string; icone: React.ReactNode }[] = [
  {
    identificador: 'dashboard',
    rotulo: 'Início',
    icone: <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" /></svg>,
  },
  {
    identificador: 'surgeries',
    rotulo: 'Kits',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M17 3L8 12" strokeLinecap="round" /><path d="M8 12l-4 3.5c-.7.6-.7 1.5 0 2 .6.5 1.5.4 2-.2L10 14" strokeLinecap="round" strokeLinejoin="round" /><circle cx="13" cy="7" r="1.2" fill="currentColor" stroke="none" /></svg>,
  },
  {
    identificador: 'voice-checklist',
    rotulo: 'Voz',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><rect x="7" y="2" width="6" height="10" rx="3" /><path d="M4 9a6 6 0 0012 0M10 18v-4" strokeLinecap="round" /><line x1="6.5" y1="19.5" x2="13.5" y2="19.5" strokeLinecap="round" /></svg>,
  },
  {
    identificador: 'reports',
    rotulo: 'Relatórios',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M5 3h10a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" strokeLinejoin="round" /><path d="M7 7h6M7 10h6M7 13h4" strokeLinecap="round" /></svg>,
  },
  {
    identificador: 'profile',
    rotulo: 'Perfil',
    icone: <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>,
  },
];

const titulosDasTelas: Record<View, string> = {
  dashboard: 'Dashboard',
  surgeries: 'Kits Cirúrgicos',
  'voice-checklist': 'Conferência por Voz',
  stock: 'Estoque',
  reports: 'Relatórios de Conferência',
  profile: 'Meu Perfil',
  'admin-dashboard': 'Painel Admin',
  'admin-stock': 'Gerenciar Estoque',
  'admin-kits': 'Gerenciar Kits',
  'admin-users': 'Gerenciar Usuários',
};

export default function App() {
  const [usuario, definirUsuario] = useState<AuthUser | null>(null);
  const [telaAtual, definirTelaAtual] = useState<View>('dashboard');
  const [idCirurgiaDaConferencia, definirIdCirurgiaDaConferencia] = useState<string | undefined>(undefined);
  const [menuLateralAberto, definirMenuLateralAberto] = useState(false);
  const [alertasDeEstoque, definirAlertasDeEstoque] = useState(apiEstaConfigurada ? 0 : 2);

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    let efeitoAtivo = true;
    clienteApi.auth.currentUser().then((usuarioRestaurado) => {
      if (efeitoAtivo) definirUsuario((usuarioAtual) => usuarioAtual ?? usuarioRestaurado);
    }).catch(() => undefined);
    return () => { efeitoAtivo = false; };
  }, []);

  useEffect(() => {
    if (!apiEstaConfigurada || !usuario) return;
    let efeitoAtivo = true;
    clienteApi.stock.list().then((itensEstoque: StockItem[]) => {
      if (efeitoAtivo) definirAlertasDeEstoque(itensEstoque.filter((itemEstoque) => itemEstoque.status === 'critical').length);
    }).catch(() => {
      if (efeitoAtivo) definirAlertasDeEstoque(0);
    });
    return () => { efeitoAtivo = false; };
  }, [usuario]);

  if (!usuario) {
    return <Login aoEntrar={(usuarioAutenticado) => { definirUsuario(usuarioAutenticado); definirTelaAtual('dashboard'); }} />;
  }

  function navegarParaTela(telaDestino: View, idCirurgia?: string) {
    if (telasRestritasAoAdministrador.includes(telaDestino) && usuario?.role !== 'admin') return;
    if (telaDestino === 'voice-checklist' && idCirurgia) definirIdCirurgiaDaConferencia(idCirurgia);
    definirTelaAtual(telaDestino);
    definirMenuLateralAberto(false);
  }

  async function encerrarSessao() {
    if (apiEstaConfigurada) await clienteApi.auth.logout().catch(() => undefined);
    definirUsuario(null);
    definirTelaAtual('dashboard');
    definirMenuLateralAberto(false);
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 h-full shadow-lg">
        <Sidebar telaAtual={telaAtual} navegarPara={navegarParaTela} usuario={usuario} encerrarSessao={encerrarSessao} />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {menuLateralAberto && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => definirMenuLateralAberto(false)} />
          <aside className="relative z-50 flex flex-col w-72 h-full shadow-2xl animate-slide-in-left">
            <Sidebar telaAtual={telaAtual} navegarPara={navegarParaTela} usuario={usuario} encerrarSessao={encerrarSessao} aoFechar={() => definirMenuLateralAberto(false)} />
          </aside>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => definirMenuLateralAberto(true)}
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-800 text-base sm:text-lg truncate" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {titulosDasTelas[telaAtual]}
            </h1>
            <p className="text-xs text-gray-400 hidden sm:block truncate">
              {usuario.hospital} &bull; {new Date().toLocaleDateString('pt-BR')} &bull; {usuario.shift}
            </p>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Stock alert bell */}
            <button onClick={() => navegarParaTela('stock')} aria-label="Ver alertas de estoque" className="relative w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg>
              {alertasDeEstoque > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border border-white animate-blink" />
              )}
            </button>

            {/* User avatar — desktop */}
            <button
              onClick={() => navegarParaTela('profile')}
              className="hidden sm:flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{
                  background: usuario.role === 'admin' ? 'linear-gradient(135deg,#1E3A8A,#1D4ED8)' : 'linear-gradient(135deg,#059669,#10B981)',
                  fontFamily: 'Plus Jakarta Sans',
                }}
              >
                {usuario.initials}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-gray-700 leading-none">{usuario.name.split(' ')[0]}</div>
                <div className="text-xs text-gray-400 mt-0.5 capitalize">{usuario.role === 'admin' ? 'Administrador' : usuario.role === 'technician' ? 'Circulante' : 'Enf. Instrumentador(a)'}</div>
              </div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {telaAtual === 'dashboard' && <Dashboard navegarPara={navegarParaTela} usuario={usuario} />}
          {telaAtual === 'surgeries' && <SurgeryKits navegarPara={navegarParaTela} />}
          {telaAtual === 'voice-checklist' && <VoiceChecklist key={idCirurgiaDaConferencia || 'default'} idCirurgiaInicial={idCirurgiaDaConferencia} usuario={usuario} voltarAoPainel={() => navegarParaTela('dashboard')} />}
          {telaAtual === 'stock' && <StockInventory />}
          {telaAtual === 'reports' && <Reports />}
          {telaAtual === 'profile' && <Profile usuario={usuario} atualizarUsuario={definirUsuario} encerrarSessao={encerrarSessao} />}
          {telaAtual === 'admin-stock' && <StockManager />}
          {telaAtual === 'admin-users' && <UserManager />}
          {telaAtual === 'admin-dashboard' && <Dashboard navegarPara={navegarParaTela} usuario={usuario} />}
          {telaAtual === 'admin-kits' && <SurgeryKits navegarPara={navegarParaTela} />}
        </main>

        {/* ── Mobile bottom tab bar ── */}
        <nav className="lg:hidden flex items-center border-t border-gray-100 bg-white flex-shrink-0 safe-bottom shadow-[0_-1px_8px_rgba(0,0,0,0.06)]">
          {itensNavegacaoMovel.map(({ identificador, rotulo, icone }) => {
            const selecionada = telaAtual === identificador;
            return (
              <button
                key={identificador}
                onClick={() => navegarParaTela(identificador)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors"
                style={{ color: selecionada ? '#1D4ED8' : '#9CA3AF' }}
              >
                <span className={`relative ${identificador === 'voice-checklist' ? 'p-1.5 rounded-xl' : ''}`}
                  style={identificador === 'voice-checklist' ? { background: selecionada ? '#1D4ED8' : '#EFF6FF' } : {}}>
                  <span style={{ color: identificador === 'voice-checklist' ? (selecionada ? '#FFFFFF' : '#1D4ED8') : undefined }}>
                    {icone}
                  </span>
                </span>
                <span className="text-xs font-semibold">{rotulo}</span>
                {selecionada && (
                  <span className="absolute bottom-0 w-6 h-0.5 rounded-full" style={{ backgroundColor: '#1D4ED8' }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
