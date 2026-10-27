import { useEffect, useState } from 'react';
import { usuariosAplicacao as usuariosIniciais, AppUser, UserRole, rotulosDosPapeis, coresDosPapeis } from '../../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../../services/api';

function AvatarDoUsuario({ iniciais, papel }: { iniciais: string; papel: UserRole }) {
  const corDeFundo = papel === 'admin' ? 'linear-gradient(135deg,#1E3A8A,#1D4ED8)' : papel === 'nurse' ? 'linear-gradient(135deg,#059669,#10B981)' : 'linear-gradient(135deg,#7C3AED,#8B5CF6)';
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: corDeFundo, fontFamily: 'Plus Jakarta Sans' }}>
      {iniciais}
    </div>
  );
}

type DadosDoModalDeUsuario = Partial<AppUser> & { novoUsuario?: boolean };

function ModalDeUsuario({ dados, aoSalvar, aoFechar }: { dados: DadosDoModalDeUsuario; aoSalvar: (usuario: AppUser) => void; aoFechar: () => void }) {
  const [dadosDoFormulario, definirDadosDoFormulario] = useState({
    name: dados.name || '',
    email: dados.email || '',
    role: (dados.role || 'nurse') as UserRole,
    shift: dados.shift || 'Turno A',
  });

  function gerarIniciais(nomeCompleto: string) {
    return nomeCompleto.split(' ').filter(Boolean).map((parteDoNome) => parteDoNome[0]).slice(0, 2).join('').toUpperCase() || 'US';
  }

  function enviarFormulario(evento: React.FormEvent) {
    evento.preventDefault();
    aoSalvar({
      id: dados.id || `u-${Date.now()}`,
      ...dadosDoFormulario,
      status: 'active',
      lastActive: new Date().toLocaleDateString('pt-BR'),
      initials: gerarIniciais(dadosDoFormulario.name),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg" style={{ fontFamily: 'Plus Jakarta Sans' }}>
            {dados.novoUsuario ? 'Adicionar Usuário' : 'Editar Usuário'}
          </h2>
          <button onClick={aoFechar} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <form onSubmit={enviarFormulario} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome completo</label>
            <input value={dadosDoFormulario.name} onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, name: evento.target.value }))} required placeholder="Ex: Maria Oliveira" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">E-mail institucional</label>
            <input type="email" value={dadosDoFormulario.email} onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, email: evento.target.value }))} required placeholder="usuario@hospitalcentral.br" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Função</label>
              <select value={dadosDoFormulario.role} onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, role: evento.target.value as UserRole }))} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                <option value="nurse">Enfermeiro(a)</option>
                <option value="technician">Técnico(a)</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Turno</label>
              <select value={dadosDoFormulario.shift} onChange={(evento) => definirDadosDoFormulario((anteriores) => ({ ...anteriores, shift: evento.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                {['Turno A', 'Turno B', 'Turno C', 'Administrativo'].map((turno) => <option key={turno}>{turno}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={aoFechar} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#1E3A8A,#2563EB)' }}>
              {dados.novoUsuario ? 'Adicionar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserManager() {
  const [usuarios, definirUsuarios] = useState<AppUser[]>(apiEstaConfigurada ? [] : usuariosIniciais);
  const [dadosDoModal, definirDadosDoModal] = useState<DadosDoModalDeUsuario | null>(null);
  const [termoDeBusca, definirTermoDeBusca] = useState('');
  const [papelFiltrado, definirPapelFiltrado] = useState<UserRole | 'all'>('all');
  const [erroDaApi, definirErroDaApi] = useState('');

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    clienteApi.users.list().then(definirUsuarios).catch((erro: unknown) => {
      definirUsuarios([]);
      definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível carregar os usuários.');
    });
  }, []);

  async function salvarUsuario(usuario: AppUser) {
    definirErroDaApi('');
    if (apiEstaConfigurada) {
      try {
        const dadosDeEntrada = { name: usuario.name, email: usuario.email, role: usuario.role, shift: usuario.shift };
        const usuarioJaExiste = usuarios.some((usuarioAtual) => usuarioAtual.id === usuario.id);
        const usuarioSalvo = usuarioJaExiste ? await clienteApi.users.update(usuario.id, dadosDeEntrada) : await clienteApi.users.create(dadosDeEntrada);
        definirUsuarios((usuariosAnteriores) => usuarioJaExiste ? usuariosAnteriores.map((usuarioAtual) => usuarioAtual.id === usuarioSalvo.id ? usuarioSalvo : usuarioAtual) : [usuarioSalvo, ...usuariosAnteriores]);
        definirDadosDoModal(null);
      } catch (erro: unknown) {
        definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível salvar o usuário.');
      }
      return;
    }
    definirUsuarios((usuariosAnteriores) => {
      const usuarioExistente = usuariosAnteriores.find((usuarioAtual) => usuarioAtual.id === usuario.id);
      if (usuarioExistente) return usuariosAnteriores.map((usuarioAtual) => (usuarioAtual.id === usuario.id ? usuario : usuarioAtual));
      return [usuario, ...usuariosAnteriores];
    });
    definirDadosDoModal(null);
  }

  async function alternarStatusDoUsuario(idUsuario: string) {
    definirErroDaApi('');
    const usuarioEncontrado = usuarios.find((usuarioAtual) => usuarioAtual.id === idUsuario);
    if (!usuarioEncontrado) return;
    if (apiEstaConfigurada) {
      try {
        const usuarioAtualizado = await clienteApi.users.setStatus(idUsuario, usuarioEncontrado.status === 'active' ? 'inactive' : 'active');
        definirUsuarios((usuariosAnteriores) => usuariosAnteriores.map((usuarioAtual) => usuarioAtual.id === idUsuario ? usuarioAtualizado : usuarioAtual));
      } catch (erro: unknown) {
        definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível atualizar o status.');
      }
      return;
    }
    definirUsuarios((usuariosAnteriores) => usuariosAnteriores.map((usuarioAtual) => usuarioAtual.id === idUsuario ? { ...usuarioAtual, status: usuarioAtual.status === 'active' ? 'inactive' : 'active' } : usuarioAtual));
  }

  const usuariosFiltrados = usuarios.filter((usuario) => {
    if (papelFiltrado !== 'all' && usuario.role !== papelFiltrado) return false;
    if (termoDeBusca && !usuario.name.toLowerCase().includes(termoDeBusca.toLowerCase()) && !usuario.email.toLowerCase().includes(termoDeBusca.toLowerCase())) return false;
    return true;
  });

  const quantidadeDeUsuariosAtivos = usuarios.filter((usuario) => usuario.status === 'active').length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {dadosDoModal && <ModalDeUsuario dados={dadosDoModal} aoSalvar={salvarUsuario} aoFechar={() => definirDadosDoModal(null)} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-5 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans' }}>Gerenciar Usuários</h1>
            <p className="text-sm text-gray-400 mt-0.5">{usuarios.length} usuários · {quantidadeDeUsuariosAtivos} ativos</p>
            {erroDaApi && <p role="alert" className="text-xs text-red-600 mt-1">{erroDaApi}</p>}
          </div>
          <button onClick={() => definirDadosDoModal({ novoUsuario: true })} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#1E3A8A,#2563EB)' }}>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z" /></svg>
            Adicionar usuário
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" stroke="currentColor" strokeWidth={2}><circle cx="7" cy="7" r="5" /><path d="M14 14l-3-3" strokeLinecap="round" /></svg>
            <input type="text" placeholder="Buscar usuário..." value={termoDeBusca} onChange={(evento) => definirTermoDeBusca(evento.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'nurse', 'technician', 'admin'] as const).map((papel) => {
              const rotulosDosPapeis = { all: 'Todos', nurse: 'Enfermeiros', technician: 'Técnicos', admin: 'Admins' };
              return (
                <button key={papel} onClick={() => definirPapelFiltrado(papel)} className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap" style={papelFiltrado === papel ? { backgroundColor: '#1E40AF', color: '#fff', borderColor: '#1E40AF' } : { backgroundColor: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                  {rotulosDosPapeis[papel]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-screen-xl mx-auto space-y-3">
          {usuariosFiltrados.map((usuarioDaLista) => {
            const coresDoPapel = coresDosPapeis[usuarioDaLista.role];
            return (
              <div key={usuarioDaLista.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all hover:shadow-md" style={{ opacity: usuarioDaLista.status === 'inactive' ? 0.6 : 1 }}>
                <AvatarDoUsuario iniciais={usuarioDaLista.initials} papel={usuarioDaLista.role} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800" style={{ fontFamily: 'Plus Jakarta Sans' }}>{usuarioDaLista.name}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: coresDoPapel.fundo, color: coresDoPapel.texto }}>{rotulosDosPapeis[usuarioDaLista.role]}</span>
                    {usuarioDaLista.status === 'inactive' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">INATIVO</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{usuarioDaLista.email}</span>
                    <span>&bull;</span>
                    <span>{usuarioDaLista.shift}</span>
                    <span>&bull;</span>
                    <span>Último acesso: {usuarioDaLista.lastActive}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => definirDadosDoModal(usuarioDaLista)} className="px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">Editar</button>
                  <button
                    onClick={() => alternarStatusDoUsuario(usuarioDaLista.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
                    style={usuarioDaLista.status === 'active' ? { borderColor: '#FECACA', color: '#DC2626', backgroundColor: '#FEF2F2' } : { borderColor: '#D1FAE5', color: '#059669', backgroundColor: '#F0FDF4' }}
                  >
                    {usuarioDaLista.status === 'active' ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            );
          })}
          {usuariosFiltrados.length === 0 && <div className="text-center py-12 text-gray-400">Nenhum usuário encontrado.</div>}
        </div>
      </div>
    </div>
  );
}
