import type { ErrorRequestHandler, RequestHandler } from 'express';
import { emProducao } from '../config.js';

// Todas as respostas de erro seguem o schema `Error` do openapi.yaml:
//   { "message": "texto em português", "code": "CODIGO_ESTAVEL", "details": { ... } }
// O frontend exibe `message`; `code` serve para o cliente tratar casos específicos.

export type CorpoDeErro = { message: string; code: string; details?: Record<string, unknown> };

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }

  paraJson(): CorpoDeErro {
    return { message: this.message, code: this.codigo, ...(this.detalhes ? { details: this.detalhes } : {}) };
  }
}

// Atalhos com as mensagens dos exemplos do contrato (components/responses).
export const erros = {
  validacao: (campos: Record<string, string>, mensagem = 'Dados inválidos.') =>
    new ErroApi(400, 'VALIDACAO', mensagem, { fields: campos }),
  naoAutenticado: (mensagem = 'Sessão expirada. Faça login novamente.') =>
    new ErroApi(401, 'NAO_AUTENTICADO', mensagem),
  semPermissao: (mensagem = 'Seu perfil não tem permissão para esta ação.') =>
    new ErroApi(403, 'SEM_PERMISSAO', mensagem),
  naoEncontrado: (mensagem = 'Registro não encontrado.') => new ErroApi(404, 'NAO_ENCONTRADO', mensagem),
  duplicado: (mensagem = 'Já existe um registro com este código.') => new ErroApi(409, 'DUPLICADO', mensagem),
  checagemEncerrada: (mensagem = 'Esta checagem já foi finalizada e não pode ser alterada.') =>
    new ErroApi(409, 'CHECAGEM_ENCERRADA', mensagem),
  conflito: (codigo: string, mensagem: string) => new ErroApi(409, codigo, mensagem),
  naoImplementado: () =>
    new ErroApi(501, 'NAO_IMPLEMENTADO', 'Esta rota está no contrato, mas ainda não foi implementada.'),
};

/** Rota que não casou com nenhum handler. */
export const rotaNaoEncontrada: RequestHandler = (req, _res, next) => {
  // Se o validador reconheceu a operação (req.openapi), ela existe no contrato mas não tem handler ainda.
  next('openapi' in req && req.openapi ? erros.naoImplementado() : erros.naoEncontrado('Rota não encontrada.'));
};

// ── Tradução dos erros do express-openapi-validator ──────────────────────────
type ErroDoValidador = {
  status: number;
  message: string;
  errors?: Array<{ path?: string; message?: string; errorCode?: string }>;
};

function ehErroDoValidador(erro: unknown): erro is ErroDoValidador {
  return typeof erro === 'object' && erro !== null && 'status' in erro && Array.isArray((erro as ErroDoValidador).errors);
}

/** "/body/email" ou ".body.email" -> "email"; "/query/page" -> "page". */
function nomeDoCampo(caminho = ''): string {
  const partes = caminho.split(/[./]/).filter(Boolean);
  const semOrigem = ['body', 'query', 'params', 'path', 'headers', 'cookies'].includes(partes[0] ?? '')
    ? partes.slice(1)
    : partes;
  return semOrigem.join('.') || 'body';
}

function traduzirMensagem(mensagem = ''): string {
  return mensagem
    .replace(/^must have required property '(.+)'$/, 'Campo obrigatório: $1.')
    .replace(/^Unknown query parameter '(.+)'$/, 'Parâmetro de consulta não previsto no contrato: $1.')
    .replace(/^must be equal to one of the allowed values.*$/, 'Valor fora dos permitidos.')
    .replace(/^must NOT have additional properties$/, 'Campo não permitido.')
    .replace(/^must match format "email"$/, 'Informe um e-mail válido.')
    .replace(/^must match format "(.+)"$/, 'Formato inválido ($1).')
    .replace(/^must NOT have fewer than (\d+) characters$/, 'Deve ter pelo menos $1 caracteres.')
    .replace(/^must NOT have more than (\d+) characters$/, 'Deve ter no máximo $1 caracteres.')
    .replace(/^must match pattern ".*"$/, 'Formato inválido: use apenas letras minúsculas, números e hífen.')
    .replace(/^must NOT have fewer than (\d+) items$/, 'Informe ao menos $1 item.')
    .replace(/^must NOT have more than (\d+) items$/, 'Informe no máximo $1 itens.')
    .replace(/^must be (string|integer|number|boolean|object|array)$/, (_, tipo: string) => `Tipo inválido (esperado ${tipo}).`)
    .replace(/^must be >= (.+)$/, 'Deve ser maior ou igual a $1.')
    .replace(/^must be <= (.+)$/, 'Deve ser menor ou igual a $1.');
}

function deValidador(erro: ErroDoValidador): ErroApi {
  switch (erro.status) {
    case 400: {
      const campos: Record<string, string> = {};
      for (const item of erro.errors ?? []) {
        const campo = nomeDoCampo(item.path);
        campos[campo] ??= traduzirMensagem(item.message);
      }
      return erros.validacao(campos);
    }
    case 401:
      return erros.naoAutenticado();
    case 403:
      return erros.semPermissao();
    case 404:
      return erros.naoEncontrado('Rota não encontrada.');
    case 405:
      return new ErroApi(405, 'METODO_NAO_PERMITIDO', 'Método não permitido para esta rota.');
    case 415:
      return new ErroApi(415, 'TIPO_NAO_SUPORTADO', 'Envie o corpo como application/json.');
    default:
      return new ErroApi(erro.status, 'ERRO_DE_CONTRATO', erro.message);
  }
}

// ── Tradução dos erros do MySQL (constraints e gatilhos das migrações) ───────
type ErroMysql = { code?: string; errno?: number; sqlState?: string; sqlMessage?: string };

function ehErroMysql(erro: unknown): erro is ErroMysql {
  return typeof erro === 'object' && erro !== null && 'sqlState' in erro;
}

/**
 * Duplicidade (UNIQUE): descobre qual campo repetiu pelo nome da chave
 * ("... for key 'instrumental.uq_instrumental_nome'") e responde com a mensagem do campo.
 */
function duplicadoPorChave(mensagemMysql: string): ErroApi {
  const chave = /for key '([^']+)'/.exec(mensagemMysql)?.[1] ?? '';
  const campos: Array<[RegExp, string, string]> = [
    [/codigo$/, 'code', 'Já existe um registro com este código.'],
    [/nome$/, 'name', 'Já existe um registro com este nome.'],
    [/email$/, 'email', 'Já existe um usuário com este e-mail.'],
    [/versao$/, 'version', 'Já existe uma versão com este identificador para o procedimento.'],
  ];
  for (const [padrao, campo, texto] of campos) {
    if (padrao.test(chave)) return new ErroApi(409, 'DUPLICADO', texto, { fields: { [campo]: texto } });
  }
  return erros.duplicado();
}

function deMysql(erro: ErroMysql): ErroApi | undefined {
  const mensagem = erro.sqlMessage ?? '';
  switch (erro.code) {
    case 'ER_DUP_ENTRY':
      return duplicadoPorChave(mensagem);
    case 'ER_ROW_IS_REFERENCED_2':
      return erros.conflito('EM_USO', 'Este registro está em uso e não pode ser excluído.');
    case 'ER_NO_REFERENCED_ROW_2':
      return new ErroApi(400, 'REFERENCIA_INVALIDA', 'Um dos registros informados não existe.');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return new ErroApi(400, 'VALIDACAO', 'Dados inválidos.', { constraint: mensagem });
  }
  // SIGNAL SQLSTATE '45000' dos gatilhos: regras de negócio garantidas pelo banco.
  if (erro.sqlState === '45000') {
    if (mensagem.startsWith('RN02')) return erros.semPermissao(mensagem);
    if (mensagem.startsWith('RN03')) return erros.checagemEncerrada(mensagem);
    return erros.conflito('REGRA_DE_NEGOCIO', mensagem);
  }
  return undefined;
}

/** Middleware final: converte qualquer erro no formato `Error` do contrato. */
export const tratadorDeErros: ErrorRequestHandler = (erro, req, res, _next) => {
  let resposta: ErroApi;

  if (erro instanceof ErroApi) resposta = erro;
  else if (ehErroDoValidador(erro)) resposta = deValidador(erro);
  else if (erro?.type === 'entity.parse.failed') resposta = erros.validacao({ body: 'JSON malformado.' });
  else if (ehErroMysql(erro) && deMysql(erro)) resposta = deMysql(erro)!;
  else {
    console.error(`[erro] ${req.method} ${req.originalUrl}`, erro);
    resposta = new ErroApi(500, 'ERRO_INTERNO', 'Erro interno. Tente novamente em instantes.',
      emProducao ? undefined : { causa: String(erro?.message ?? erro) });
  }

  if (res.headersSent) return;
  res.status(resposta.status).json(resposta.paraJson());
};
