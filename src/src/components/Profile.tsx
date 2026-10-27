import { useEffect, useState } from 'react';
import { AuthUser, rotulosDosPapeis } from '../data/mockData';
import { clienteApi, apiEstaConfigurada, NotificationPreferences } from '../services/api';

type ProfileProps = {
  usuario: AuthUser;
  atualizarUsuario: (usuario: AuthUser) => void;
  encerrarSessao: () => void;
};

const preferenciasPadrao: NotificationPreferences = {
  stockAlert: true,
  surgeryReminder: true,
  voiceChecklist: false,
  weeklyReport: true,
};

function Alternador({ marcado, aoAlterar }: { marcado: boolean; aoAlterar: () => void }) {
  return (
    <button
      onClick={aoAlterar}
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ backgroundColor: marcado ? '#2563EB' : '#D1D5DB' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
        style={{ transform: marcado ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function Secao({ titulo, children: conteudo }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="font-bold text-gray-800 text-base" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{titulo}</h3>
      </div>
      <div className="p-5">{conteudo}</div>
    </div>
  );
}

function Campo({ rotulo, valor, editavel, aoAlterar }: { rotulo: string; valor: string; editavel?: boolean; aoAlterar?: (valor: string) => void }) {
  const [valorDoCampo, definirValorDoCampo] = useState(valor);
  const [emEdicao, definirEmEdicao] = useState(false);

  useEffect(() => definirValorDoCampo(valor), [valor]);

  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-50 last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{rotulo}</div>
        {editavel && emEdicao ? (
          <input
            value={valorDoCampo}
            onChange={(evento) => {
              definirValorDoCampo(evento.target.value);
              aoAlterar?.(evento.target.value);
            }}
            onBlur={() => definirEmEdicao(false)}
            autoFocus
            className="w-full text-sm font-medium text-gray-800 border border-blue-300 rounded-lg px-2 py-1 mt-0.5"
          />
        ) : (
          <div className="text-sm font-medium text-gray-800">{valorDoCampo}</div>
        )}
      </div>
      {editavel && !emEdicao && (
        <button
          onClick={() => definirEmEdicao(true)}
          className="text-xs text-blue-600 font-semibold hover:text-blue-800 transition-colors flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50"
        >
          Editar
        </button>
      )}
    </div>
  );
}

export default function Profile({ usuario, atualizarUsuario, encerrarSessao }: ProfileProps) {
  const [perfil, definirPerfil] = useState(usuario);
  const [preferencias, definirPreferencias] = useState<NotificationPreferences>(preferenciasPadrao);
  const [salvando, definirSalvando] = useState(false);
  const [erroDaApi, definirErroDaApi] = useState('');
  const [mensagemDaSenha, definirMensagemDaSenha] = useState('');
  const [senhaAtual, definirSenhaAtual] = useState('');
  const [novaSenha, definirNovaSenha] = useState('');
  const [confirmacaoDaNovaSenha, definirConfirmacaoDaNovaSenha] = useState('');

  useEffect(() => definirPerfil(usuario), [usuario]);

  useEffect(() => {
    if (!apiEstaConfigurada) return;
    Promise.all([clienteApi.profile.get(), clienteApi.profile.getNotifications()]).then(([perfilRecebido, preferenciasRecebidas]) => {
      definirPerfil(perfilRecebido);
      definirPreferencias(preferenciasRecebidas);
      atualizarUsuario(perfilRecebido);
    }).catch((erro: unknown) => {
      definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível carregar o perfil.');
    });
  }, [atualizarUsuario]);

  async function salvarAlteracoes() {
    definirErroDaApi('');
    definirSalvando(true);
    try {
      if (apiEstaConfigurada) {
        const perfilSalvo = await clienteApi.profile.update({ name: perfil.name, phone: perfil.phone });
        definirPerfil(perfilSalvo);
        atualizarUsuario(perfilSalvo);
        const preferenciasSalvas = await clienteApi.profile.updateNotifications(preferencias);
        definirPreferencias(preferenciasSalvas);
      } else {
        const perfilAtualizado = {
          ...perfil,
          initials: perfil.name.split(' ').filter(Boolean).map((parteDoNome) => parteDoNome[0]).slice(0, 2).join('').toUpperCase(),
        };
        definirPerfil(perfilAtualizado);
        atualizarUsuario(perfilAtualizado);
      }
    } catch (erro: unknown) {
      definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível salvar as alterações.');
    } finally {
      definirSalvando(false);
    }
  }

  async function alterarSenha() {
    definirErroDaApi('');
    definirMensagemDaSenha('');
    if (!senhaAtual || !novaSenha) {
      definirErroDaApi('Informe a senha atual e a nova senha.');
      return;
    }
    if (novaSenha !== confirmacaoDaNovaSenha) {
      definirErroDaApi('A confirmação da nova senha não corresponde.');
      return;
    }
    if (!apiEstaConfigurada) {
      definirErroDaApi('A troca de senha requer conexão com o servidor.');
      return;
    }
    try {
      await clienteApi.profile.changePassword({ currentPassword: senhaAtual, newPassword: novaSenha });
      definirSenhaAtual('');
      definirNovaSenha('');
      definirConfirmacaoDaNovaSenha('');
      definirMensagemDaSenha('Senha atualizada com sucesso.');
    } catch (erro: unknown) {
      definirErroDaApi(erro instanceof Error ? erro.message : 'Não foi possível atualizar a senha.');
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Header bar — matches VoiceChecklist top bar style */}
      <div
        className="px-4 sm:px-6 py-4 border-b flex items-center gap-4 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1E3A8A, #1E40AF)', borderColor: 'rgba(255,255,255,0.12)' }}
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
          style={{
            background: perfil.role === 'admin'
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(255,255,255,0.15)',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          {perfil.initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-base sm:text-lg leading-tight truncate" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {perfil.name}
          </h1>
          <p className="text-blue-200 text-xs mt-0.5 truncate">{rotulosDosPapeis[perfil.role]} &bull; {perfil.hospital}</p>
        </div>
        <span
          className="hidden sm:inline-flex items-center text-xs font-bold px-3 py-1 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#BFDBFE' }}
        >
          {perfil.shift}
        </span>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-8 py-6 pb-10 space-y-5 flex-1">
        {/* Profile card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg"
            style={{
              background: perfil.role === 'admin'
                ? 'linear-gradient(135deg, #1E3A8A, #1D4ED8)'
                : 'linear-gradient(135deg, #059669, #10B981)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            {perfil.initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {perfil.name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className="text-xs font-bold px-3 py-1 rounded-full"
                style={{
                  backgroundColor: perfil.role === 'admin' ? '#DBEAFE' : '#D1FAE5',
                  color: perfil.role === 'admin' ? '#1D4ED8' : '#065F46',
                }}
              >
                {rotulosDosPapeis[perfil.role]}
              </span>
              <span className="text-xs text-gray-400">{perfil.hospital}</span>
              <span className="text-xs text-gray-300">&bull;</span>
              <span className="text-xs text-gray-400">{perfil.shift}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{perfil.email}</div>
          </div>
          <button className="flex-shrink-0 border border-gray-200 text-gray-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
            Alterar foto
          </button>
        </div>

        {/* Personal info */}
        <Secao titulo="Informações Pessoais">
          <Campo rotulo="Nome completo" valor={perfil.name} editavel aoAlterar={(nome) => definirPerfil((perfilAtual) => ({ ...perfilAtual, name: nome }))} />
          <Campo rotulo="E-mail" valor={perfil.email} />
          <Campo rotulo="Telefone" valor={perfil.phone} editavel aoAlterar={(telefone) => definirPerfil((perfilAtual) => ({ ...perfilAtual, phone: telefone }))} />
          {perfil.crm && <Campo rotulo="Registro profissional" valor={perfil.crm} />}
          <Campo rotulo="Hospital" valor={perfil.hospital} />
          <Campo rotulo="Turno" valor={perfil.shift} />
          <Campo rotulo="Membro desde" valor={perfil.joinedAt} />
        </Secao>

        {/* Notifications */}
        <Secao titulo="Notificações">
          <div className="space-y-4">
            {[
              { key: 'stockAlert', label: 'Alertas de estoque crítico', desc: 'Receba notificações quando um item estiver abaixo do mínimo' },
              { key: 'surgeryReminder', label: 'Lembretes de cirurgia', desc: 'Notificação 30 min antes de cada cirurgia agendada' },
              { key: 'voiceChecklist', label: 'Resumo de conferências por voz', desc: 'Receba um resumo após cada sessão de conferência' },
              { key: 'weeklyReport', label: 'Relatório semanal', desc: 'Relatório de consumo e estoque toda segunda-feira' },
            ].map(({ key: chaveDaPreferencia, label: rotulo, desc: descricao }) => (
              <div key={chaveDaPreferencia} className="flex items-center justify-between gap-4 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{rotulo}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{descricao}</div>
                </div>
                <Alternador
                  marcado={preferencias[chaveDaPreferencia as keyof typeof preferencias]}
                  aoAlterar={() =>
                    definirPreferencias((preferenciasAtuais) => ({ ...preferenciasAtuais, [chaveDaPreferencia]: !preferenciasAtuais[chaveDaPreferencia as keyof typeof preferenciasAtuais] }))
                  }
                />
              </div>
            ))}
          </div>
        </Secao>

        {/* Security */}
        <Secao titulo="Segurança">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Senha atual</label>
              <input
                type="password"
                placeholder="••••••••"
                value={senhaAtual}
                onChange={(evento) => definirSenhaAtual(evento.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nova senha</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={novaSenha}
                  onChange={(evento) => definirNovaSenha(evento.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirmar nova senha</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmacaoDaNovaSenha}
                  onChange={(evento) => definirConfirmacaoDaNovaSenha(evento.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm"
                />
              </div>
            </div>
            <button onClick={alterarSenha} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50">
              Atualizar senha
            </button>
          </div>
        </Secao>

        {erroDaApi && <p role="alert" className="text-sm text-red-600">{erroDaApi}</p>}
        {mensagemDaSenha && <p role="status" className="text-sm text-emerald-700">{mensagemDaSenha}</p>}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={salvarAlteracoes}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #1E3A8A, #2563EB)' }}
          >
            {salvando ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar alterações'
            )}
          </button>
          <button
            onClick={encerrarSessao}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            Sair do sistema
          </button>
        </div>
      </div>
    </div>
  );
}
