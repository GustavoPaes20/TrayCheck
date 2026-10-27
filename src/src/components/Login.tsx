import { useState } from 'react';
import { CONTAS_DEMONSTRACAO, USUARIOS_DEMONSTRACAO, AuthUser } from '../data/mockData';
import { clienteApi, apiEstaConfigurada } from '../services/api';
import loginImg from '../imports/loginImg.svg';

type LoginProps = {
  aoEntrar: (usuario: AuthUser) => void;
};

export default function Login({ aoEntrar }: LoginProps) {
  const [emailDigitado, definirEmailDigitado] = useState('');
  const [senhaDigitada, definirSenhaDigitada] = useState('');
  const [senhaVisivel, definirSenhaVisivel] = useState(false);
  const [mensagemDeErro, definirMensagemDeErro] = useState('');
  const [carregando, definirCarregando] = useState(false);

  async function enviarFormulario(evento: React.FormEvent) {
    evento.preventDefault();
    definirMensagemDeErro('');
    definirCarregando(true);
    try {
      if (apiEstaConfigurada) {
        aoEntrar(await clienteApi.auth.login({ email: emailDigitado.trim(), password: senhaDigitada }));
        return;
      }

      const contaEncontrada = CONTAS_DEMONSTRACAO.find((conta) => conta.email === emailDigitado && conta.password === senhaDigitada);
      if (contaEncontrada) {
        aoEntrar(USUARIOS_DEMONSTRACAO[emailDigitado]);
      } else {
        definirMensagemDeErro('E-mail ou senha incorretos.');
      }
    } catch (erro: unknown) {
      definirMensagemDeErro(erro instanceof Error ? erro.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      definirCarregando(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col lg:flex-row bg-white">

      {/* ── LEFT: Illustration panel ── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[56%] flex-shrink-0 flex-col justify-between px-10 py-10 xl:px-14 xl:py-12 relative overflow-hidden"
        style={{ backgroundColor: '#F0F5FF' }}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1E3A8A' }}>
            <svg viewBox="0 0 20 20" fill="white" className="w-4.5 h-4.5" style={{ width: 18, height: 18 }}>
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3 9h-2v2c0 .55-.45 1-1 1s-1-.45-1-1v-2H7c-.55 0-1-.45-1-1s.45-1 1-1h2V7c0-.55.45-1 1-1s1 .45 1 1v2h2c.55 0 1 .45 1 1s-.45 1-1 1z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>TrayCheck</span>
          <span className="text-xs font-semibold text-gray-400 ml-0.5 mt-0.5">v2.1</span>
        </div>

        {/* Illustration — centered */}
        <div className="flex-1 flex items-center justify-center py-6">
          <img src={loginImg} alt="Ilustração de profissionais de saúde e equipamentos hospitalares" className="w-full max-w-[440px] object-contain animate-login-float" />
        </div>

        {/* Tagline */}
        <div className="flex-shrink-0 space-y-3">
          <h1
            className="text-3xl xl:text-4xl font-extrabold text-gray-900 leading-tight"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Cada instrumento no lugar.<br />
            Toda cirurgia segura.
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
            Checklist de instrumentais cirúrgicos por voz, gestão de kits e auditoria completa.
          </p>

        </div>
      </div>

      {/* ── RIGHT: Form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-10 bg-white">

        {/* Mobile wordmark */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1E3A8A' }}>
            <svg viewBox="0 0 20 20" fill="white" style={{ width: 18, height: 18 }}>
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3 9h-2v2c0 .55-.45 1-1 1s-1-.45-1-1v-2H7c-.55 0-1-.45-1-1s.45-1 1-1h2V7c0-.55.45-1 1-1s1 .45 1 1v2h2c.55 0 1 .45 1 1s-.45 1-1 1z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>TrayCheck</span>
        </div>

        <div className="w-full max-w-sm">

          {/* Heading */}
          <div className="mb-8">
            <h2
              className="text-2xl sm:text-3xl font-bold text-gray-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Bem-vindo de volta
            </h2>
            <p className="text-gray-400 mt-1.5 text-sm">Acesse o sistema com suas credenciais institucionais.</p>
          </div>

          {/* Form */}
          <form onSubmit={enviarFormulario} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">E-mail</label>
              <div className="relative">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <input
                  type="email"
                  value={emailDigitado}
                  onChange={(evento) => definirEmailDigitado(evento.target.value)}
                  placeholder="nome@hospitalcentral.br"
                  required
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-900 placeholder-gray-400 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Senha</label>
              <div className="relative">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input
                  type={senhaVisivel ? 'text' : 'password'}
                  value={senhaDigitada}
                  onChange={(evento) => definirSenhaDigitada(evento.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-3.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-900 transition-all"
                />
                <button
                  type="button"
                  onClick={() => definirSenhaVisivel(!senhaVisivel)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {senhaVisivel ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {mensagemDeErro && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl text-red-700 text-sm animate-fade-in-up" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {mensagemDeErro}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={carregando}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 flex items-center justify-center gap-2 mt-1"
              style={{
                backgroundColor: carregando ? '#93C5FD' : '#1E3A8A',
                cursor: carregando ? 'not-allowed' : 'pointer',
              }}
            >
              {carregando ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </>
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8 leading-relaxed">
            Problemas de acesso?{' '}
            <span className="text-blue-600 font-medium cursor-pointer hover:underline">
              Contate o administrador do sistema.
            </span>
          </p>

        </div>

        {/* Footer */}
        <p className="absolute bottom-5 left-0 right-0 text-center text-xs text-gray-300">
          TrayCheck &copy; 2026 — Hospital Central
        </p>
      </div>

    </div>
  );
}
