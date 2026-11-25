import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lê as variáveis de ambiente (carregadas do .env pelo próprio Node, via --env-file-if-exists)
// e as expõe tipadas para o resto da aplicação. Nenhum outro arquivo lê process.env.

const PASTA_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function texto(nome: string, padrao?: string): string {
  const valor = process.env[nome] ?? padrao;
  if (valor === undefined) throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  return valor;
}

function numero(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < 0) throw new Error(`Variável ${nome} deve ser um inteiro: "${bruto}"`);
  return valor;
}

function decimal(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor < 0) throw new Error(`Variável ${nome} deve ser um número: "${bruto}"`);
  return valor;
}

export const config = {
  porta: numero('PORT', 3000),
  ambiente: texto('NODE_ENV', 'development'),
  origensCors: texto('CORS_ORIGIN', 'http://localhost:8443')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
  prefixoApi: '/api/v1',
  caminhoOpenApi: path.resolve(PASTA_BACKEND, texto('OPENAPI_PATH', '../docs/api/openapi.yaml')),
  // Sessão (RF02): expira após este tempo SEM atividade. A ERS manda 8 horas.
  sessaoOciosaSegundos: numero('SESSAO_OCIOSA_HORAS', 8) * 3600,
  nomeDoCookie: 'traycheck_session',
  // Sem coluna no banco (AuthUser.hospital): valor de configuração.
  hospital: texto('HOSPITAL_NOME', 'Hospital Central'),
  // Voz do assistente (ElevenLabs). A chave só existe aqui, no servidor — nunca vai ao frontend.
  // Sem chave/voz configuradas a rota responde 503 e o frontend usa a voz do navegador.
  voz: {
    chaveApi: texto('ELEVENLABS_API_KEY', ''),
    idDaVoz: texto('ELEVENLABS_VOICE_ID', ''),
    idDoModelo: texto('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2'),
    estabilidade: decimal('ELEVENLABS_STABILITY', 0.65),
    similaridade: decimal('ELEVENLABS_SIMILARITY', 0.8),
    estilo: decimal('ELEVENLABS_STYLE', 0),
    velocidade: decimal('ELEVENLABS_SPEED', 0.95),
    tempoLimiteMs: numero('ELEVENLABS_TIMEOUT_MS', 15000),
    limiteCacheItens: numero('VOZ_CACHE_ITENS', 200),
    limitePorMinuto: numero('VOZ_LIMITE_POR_MINUTO', 60),
  },
  banco: {
    host: texto('DB_HOST', '127.0.0.1'),
    porta: numero('DB_PORT', 3306),
    usuario: texto('DB_USER', 'root'),
    senha: texto('DB_PASSWORD', ''),
    nome: texto('DB_NAME', 'traycheck'),
    limiteConexoes: numero('DB_POOL_LIMIT', 10),
  },
} as const;

export const emProducao = config.ambiente === 'production';
