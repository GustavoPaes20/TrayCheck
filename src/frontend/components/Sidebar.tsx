import { AuthUser, View, rotulosDosPapeis } from '../data/mockData';

type SidebarProps = {
  telaAtual: View;
  navegarPara: (telaDestino: View) => void;
  usuario: AuthUser | null;
  encerrarSessao: () => void;
  aoFechar?: () => void;
};

type ItemDeNavegacao = { identificador: View; rotulo: string; icone: React.ReactNode; selo?: string };

const IconeDeCruz = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V8c0-.55.45-1 1-1s1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1z" />
  </svg>
);

const itensDeNavegacao: ItemDeNavegacao[] = [
  {
    identificador: 'dashboard',
    rotulo: 'Dashboard',
    icone: <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  },
  {
    identificador: 'surgeries',
    rotulo: 'Kits Cirúrgicos',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M17 3L8 12" strokeLinecap="round" /><path d="M8 12l-4 3.5c-.7.6-.7 1.5 0 2 .6.5 1.5.4 2-.2L10 14" strokeLinecap="round" strokeLinejoin="round" /><circle cx="13" cy="7" r="1.2" fill="currentColor" stroke="none" /></svg>,
  },
  {
    identificador: 'voice-checklist',
    rotulo: 'Conferência por Voz',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><rect x="7" y="2" width="6" height="10" rx="3" /><path d="M4 9a6 6 0 0012 0M10 18v-4" strokeLinecap="round" /><line x1="6.5" y1="19.5" x2="13.5" y2="19.5" strokeLinecap="round" /></svg>,
    selo: 'PRINCIPAL',
  },
  {
    identificador: 'stock',
    rotulo: 'Estoque',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M10 2L2 6l8 4 8-4-8-4z" strokeLinejoin="round" /><path d="M2 14l8 4 8-4M2 10l8 4 8-4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    identificador: 'reports',
    rotulo: 'Relatórios',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M5 3h10a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" strokeLinejoin="round" /><path d="M7 7h6M7 10h6M7 13h4" strokeLinecap="round" /></svg>,
  },
];

const itensAdministrativos: ItemDeNavegacao[] = [
  {
    identificador: 'admin-stock',
    rotulo: 'Gerenciar Estoque',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><rect x="2" y="7" width="16" height="11" rx="2" /><path d="M13 7V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" strokeLinecap="round" /><line x1="10" y1="11" x2="10" y2="14" strokeLinecap="round" /><line x1="8.5" y1="12.5" x2="11.5" y2="12.5" strokeLinecap="round" /></svg>,
  },
  {
    identificador: 'admin-users',
    rotulo: 'Gerenciar Usuários',
    icone: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
];

function BotaoDeNavegacao({ itemDeNavegacao, selecionado, aoNavegar, recolhido }: { itemDeNavegacao: ItemDeNavegacao; selecionado: boolean; aoNavegar: () => void; recolhido?: boolean }) {
  return (
    <button
      onClick={aoNavegar}
      className="w-full flex items-center gap-3 rounded-xl transition-all duration-150 group relative"
      style={{
        padding: recolhido ? '10px 0' : '10px 12px',
        justifyContent: recolhido ? 'center' : 'flex-start',
        backgroundColor: selecionado ? 'rgba(255,255,255,0.18)' : 'transparent',
        border: `1px solid ${selecionado ? 'rgba(255,255,255,0.22)' : 'transparent'}`,
        color: selecionado ? '#FFFFFF' : 'rgba(147,197,253,0.85)',
      }}
      title={recolhido ? itemDeNavegacao.rotulo : undefined}
    >
      <span className="flex-shrink-0">{itemDeNavegacao.icone}</span>
      {!recolhido && (
        <span className="text-sm font-medium flex-1 text-left truncate">{itemDeNavegacao.rotulo}</span>
      )}
      {!recolhido && itemDeNavegacao.selo && (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 flex-shrink-0">
          {itemDeNavegacao.selo}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ telaAtual, navegarPara, usuario, encerrarSessao, aoFechar }: SidebarProps) {
  if (!usuario) return null;
  const usuarioAdministrador = usuario.role === 'admin';

  function navegarParaItem(telaDestino: View) {
    navegarPara(telaDestino);
    aoFechar?.();
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg,#1E3A8A 0%,#1E40AF 100%)' }}>
      {/* Logo + close (mobile) */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
            <div className="text-blue-700"><IconeDeCruz /></div>
          </div>
          <div>
            <div className="text-white font-bold text-lg leading-none" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>TrayCheck</div>
            <div className="text-blue-300 text-xs mt-0.5 font-medium">Check de Instrumentais</div>
          </div>
        </div>
        {aoFechar && (
          <button onClick={aoFechar} className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:bg-white/10 hover:text-white transition-colors lg:hidden">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {itensDeNavegacao.map((itemDeNavegacao) => (
          <BotaoDeNavegacao key={itemDeNavegacao.identificador} itemDeNavegacao={itemDeNavegacao} selecionado={telaAtual === itemDeNavegacao.identificador} aoNavegar={() => navegarParaItem(itemDeNavegacao.identificador)} />
        ))}

        {usuarioAdministrador && (
          <>
            <div className="pt-4 pb-2 px-1">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-400/70">Administração</div>
            </div>
            {itensAdministrativos.map((itemDeNavegacao) => (
              <BotaoDeNavegacao key={itemDeNavegacao.identificador} itemDeNavegacao={itemDeNavegacao} selecionado={telaAtual === itemDeNavegacao.identificador} aoNavegar={() => navegarParaItem(itemDeNavegacao.identificador)} />
            ))}
          </>
        )}
      </nav>

      {/* User info + profile + logout */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1 flex-shrink-0">
        <button
          onClick={() => navegarParaItem('profile')}
          className="w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 hover:bg-white/10 group"
          style={{ backgroundColor: telaAtual === 'profile' ? 'rgba(255,255,255,0.15)' : 'transparent' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: usuarioAdministrador ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)', fontFamily: 'Plus Jakarta Sans' }}>
            {usuario.initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-white text-sm font-semibold truncate">{usuario.name}</div>
            <div className="text-blue-300 text-xs truncate">{rotulosDosPapeis[usuario.role]}</div>
          </div>
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-blue-300 flex-shrink-0" stroke="currentColor" strokeWidth={2}>
            <path d="M6 12l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={encerrarSessao}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-300 hover:bg-red-500/15 hover:text-red-200 transition-all text-sm font-medium"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
          </svg>
          Sair
        </button>
      </div>
    </div>
  );
}
