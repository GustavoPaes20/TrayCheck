/**
 * Servidor de referência do contrato de API do TrayCheck (src/docs/frontend-api-contract.md).
 *
 * O repositório contém apenas o frontend. Este servidor, em memória e sem dependências, implementa
 * o contrato para que a coleção Newman (tests/api) e os testes E2E em modo conectado tenham um alvo
 * determinístico no CI. NÃO é o backend de produção: quando ele existir, aponte a coleção para ele
 * com `API_BASE_URL` (ver scripts/run-newman.mjs).
 *
 * Regras que a coleção verifica (códigos de status alinhados a docs/api/openapi.yaml; a matriz exata de permissões é premissa documentada em tests/README.md):
 *  - RF01/RN05: sem sessão -> 401; perfil sem permissão -> 403.
 *  - RN02: somente administrador altera cadastro de estoque e gerencia usuários.
 *  - RN01: relatório com itens pendentes é recusado (409, como em docs/api/openapi.yaml).
 *  - Erros no formato { "message": "..." }.
 *
 * Rota exclusiva de teste (fora do contrato): POST /__test__/reset restaura os dados iniciais.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PREFIXO = '/api/v1';
const NOME_DO_COOKIE = 'traycheck_session';

function dadosIniciais() {
  const contas = [
    { id: 'u1', name: 'Ana Silva', email: 'ana.silva@hospitalcentral.br', password: 'senha123', role: 'nurse', shift: 'Turno A (07:00–19:00)', initials: 'AS', hospital: 'Hospital Central', phone: '(11) 99874-3210', crm: 'COREN-SP 123456', joinedAt: 'Março 2024', status: 'active' },
    { id: 'u4', name: 'Rafael Lima', email: 'rafael.lima@hospitalcentral.br', password: 'circ123', role: 'technician', shift: 'Turno A (07:00–19:00)', initials: 'RL', hospital: 'Hospital Central', phone: '(11) 98765-4321', joinedAt: 'Junho 2025', status: 'active' },
    { id: 'u2', name: 'Carlos Mendes', email: 'admin@hospitalcentral.br', password: 'admin123', role: 'admin', shift: 'Administrativo', initials: 'CM', hospital: 'Hospital Central', phone: '(11) 97654-8800', joinedAt: 'Janeiro 2023', status: 'active' },
    { id: 'u6', name: 'Pedro Nunes', email: 'pedro.nunes@hospitalcentral.br', password: 'inativo123', role: 'technician', shift: 'Turno B', initials: 'PN', hospital: 'Hospital Central', phone: '(11) 90000-0000', joinedAt: 'Agosto 2024', status: 'inactive' },
  ];
  const cirurgias = [
    { id: 'joelho', name: 'Artroscopia de Joelho', specialty: 'Ortopedia', duration: '2–3h', color: '#2563EB', bgColor: '#DBEAFE', scheduledToday: 3, room: 'Sala 2', time: '08:00' },
    { id: 'apendicite', name: 'Apendicectomia', specialty: 'Cirurgia Geral', duration: '1h', color: '#D97706', bgColor: '#FEF3C7', scheduledToday: 1, room: 'Sala 2', time: '14:00' },
  ];
  const kits = {
    joelho: [
      { id: 'luvas-est', name: 'Luvas Estéreis (7.5)', quantity: 4, unit: 'pares', category: 'EPI', critical: true },
      { id: 'bisturi-15', name: 'Bisturi nº 15', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true },
      { id: 'artroscopio', name: 'Artroscópio 4mm', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
    ],
    apendicite: [
      { id: 'luvas-ap', name: 'Luvas Estéreis (7.0)', quantity: 3, unit: 'pares', category: 'EPI', critical: true },
      { id: 'bisturi-ap', name: 'Bisturi nº 22', quantity: 1, unit: 'unid', category: 'Instrumental', critical: true },
      { id: 'grasper-ap', name: 'Grasper Laparoscópico', quantity: 2, unit: 'unid', category: 'Instrumental', critical: true },
      { id: 'endoloop', name: 'Endoloop Cirúrgico', quantity: 2, unit: 'unid', category: 'Descartável', critical: true },
      { id: 'trocar-ap', name: 'Trocarte 10mm', quantity: 2, unit: 'unid', category: 'Descartável', critical: false },
      { id: 'co2-ap', name: 'CO2 Medicinal', quantity: 1, unit: 'cilindro', category: 'Anestesia', critical: true },
    ],
  };
  const estoque = [
    { id: 'luvas-75', name: 'Luvas Estéreis 7.5', available: 48, minimum: 20, unit: 'pares', category: 'EPI', status: 'ok', lastUpdated: '01/09/2026', updatedBy: 'Carlos Mendes' },
    { id: 'tela-pp', name: 'Tela de Polipropileno', available: 3, minimum: 5, unit: 'unid', category: 'Implante', status: 'low', lastUpdated: '29/08/2026', updatedBy: 'Carlos Mendes' },
    { id: 'propofol-s', name: 'Propofol 200mg', available: 6, minimum: 10, unit: 'amp', category: 'Anestesia', status: 'low', lastUpdated: '01/09/2026', updatedBy: 'Carlos Mendes' },
    { id: 'bisturi-10s', name: 'Bisturi nº 10', available: 4, minimum: 10, unit: 'unid', category: 'Instrumental', status: 'critical', lastUpdated: '31/08/2026', updatedBy: 'Carlos Mendes' },
  ];
  const relatorios = [
    {
      id: 'r1', surgeryId: 'joelho', surgeryName: 'Artroscopia de Joelho', specialty: 'Ortopedia', operator: 'Ana Silva', operatorRole: 'nurse',
      date: '01/09/2026', time: '07:48', duration: '4min 22s', confirmed: 3, missing: 0, total: 3, status: 'ok',
      items: kits.joelho.map((item) => ({ ...item, status: 'confirmed', confirmedAt: '07:48:12' })),
    },
  ];
  const preferencias = { stockAlert: true, surgeryReminder: true, voiceChecklist: false, weeklyReport: false };
  return { contas, cirurgias, kits, estoque, relatorios, preferencias, sequencia: 100 };
}

function calcularStatusDoEstoque(disponivel, minimo) {
  if (disponivel < minimo * 0.5) return 'critical';
  if (disponivel < minimo) return 'low';
  return 'ok';
}

const iniciaisDe = (nome) => nome.split(' ').filter(Boolean).map((parte) => parte[0]).slice(0, 2).join('').toUpperCase() || 'US';
const hoje = () => new Date().toLocaleDateString('pt-BR');
const ehInteiroNaoNegativo = (valor) => Number.isInteger(valor) && valor >= 0;
const ehTextoPreenchido = (valor) => typeof valor === 'string' && valor.trim().length > 0;

class ErroHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function criarServidor() {
  let banco = dadosIniciais();
  /** token -> id do usuário */
  const sessoes = new Map();

  const publico = ({ password: _senha, status: _status, ...usuario }) => usuario;
  const usuarioDaLista = (conta) => ({ id: conta.id, name: conta.name, email: conta.email, role: conta.role, shift: conta.shift, status: conta.status, lastActive: hoje(), initials: conta.initials });

  function lerCookie(requisicao, nome) {
    const cabecalho = requisicao.headers.cookie ?? '';
    for (const trecho of cabecalho.split(';')) {
      const [chave, ...resto] = trecho.trim().split('=');
      if (chave === nome) return resto.join('=');
    }
    return undefined;
  }

  function sessaoDaRequisicao(requisicao) {
    const autorizacao = requisicao.headers.authorization ?? '';
    const token = autorizacao.startsWith('Bearer ') ? autorizacao.slice(7) : lerCookie(requisicao, NOME_DO_COOKIE);
    const idDoUsuario = token ? sessoes.get(token) : undefined;
    const conta = idDoUsuario ? banco.contas.find((candidata) => candidata.id === idDoUsuario) : undefined;
    return conta ? { token, conta } : undefined;
  }

  function exigirSessao(requisicao) {
    const sessao = sessaoDaRequisicao(requisicao);
    if (!sessao) throw new ErroHttp(401, 'Sessão inválida ou expirada.');
    return sessao;
  }

  function exigirAdministrador(requisicao) {
    const sessao = exigirSessao(requisicao);
    if (sessao.conta.role !== 'admin') throw new ErroHttp(403, 'Apenas administradores podem executar esta ação.');
    return sessao;
  }

  function validarItemDeEstoque(corpo) {
    if (!corpo || typeof corpo !== 'object') throw new ErroHttp(400, 'Corpo da requisição inválido.');
    if (!ehTextoPreenchido(corpo.name)) throw new ErroHttp(400, 'Informe o nome do item.');
    if (!ehTextoPreenchido(corpo.category)) throw new ErroHttp(400, 'Informe a categoria do item.');
    if (!ehTextoPreenchido(corpo.unit)) throw new ErroHttp(400, 'Informe a unidade do item.');
    if (!ehInteiroNaoNegativo(corpo.available)) throw new ErroHttp(400, 'A quantidade disponível deve ser um inteiro maior ou igual a zero.');
    if (!ehInteiroNaoNegativo(corpo.minimum)) throw new ErroHttp(400, 'O estoque mínimo deve ser um inteiro maior ou igual a zero.');
  }

  function validarUsuario(corpo) {
    if (!corpo || typeof corpo !== 'object') throw new ErroHttp(400, 'Corpo da requisição inválido.');
    if (!ehTextoPreenchido(corpo.name)) throw new ErroHttp(400, 'Informe o nome do usuário.');
    if (!ehTextoPreenchido(corpo.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) throw new ErroHttp(400, 'Informe um e-mail válido.');
    if (!['admin', 'nurse', 'technician'].includes(corpo.role)) throw new ErroHttp(400, 'Perfil inválido.');
    if (!ehTextoPreenchido(corpo.shift)) throw new ErroHttp(400, 'Informe o turno.');
  }

  function validarRelatorio(corpo) {
    if (!corpo || typeof corpo !== 'object') throw new ErroHttp(400, 'Corpo da requisição inválido.');
    if ('id' in corpo) throw new ErroHttp(400, 'O relatório não deve conter id.');
    if (!ehTextoPreenchido(corpo.surgeryId) || !ehTextoPreenchido(corpo.surgeryName)) throw new ErroHttp(400, 'Informe a cirurgia do relatório.');
    if (!Array.isArray(corpo.items) || corpo.items.length === 0) throw new ErroHttp(400, 'O relatório deve conter itens.');
    if (corpo.items.some((item) => !['confirmed', 'missing', 'pending'].includes(item?.status))) throw new ErroHttp(400, 'Status de item inválido.');
    // RN01: o checklist só finaliza com todos os itens tratados.
    if (corpo.items.some((item) => item.status === 'pending')) throw new ErroHttp(409, 'O checklist só pode ser finalizado com todos os itens tratados.');
    const confirmados = corpo.items.filter((item) => item.status === 'confirmed').length;
    const faltantes = corpo.items.filter((item) => item.status === 'missing').length;
    if (corpo.confirmed !== confirmados || corpo.missing !== faltantes || corpo.total !== corpo.items.length) throw new ErroHttp(400, 'Os totais do relatório não correspondem aos itens.');
    // RN04/RNF06: item divergente sinaliza o relatório.
    if (corpo.status !== (faltantes > 0 ? 'divergencia' : 'ok')) throw new ErroHttp(400, 'O status do relatório não corresponde às divergências.');
  }

  /** Cada entrada: [método, expressão do caminho, manipulador]. O manipulador devolve { status?, corpo?, cabecalhos? }. */
  const rotas = [
    ['POST', /^\/auth\/login$/, ({ corpo }) => {
      if (!corpo || !ehTextoPreenchido(corpo.email) || typeof corpo.password !== 'string' || corpo.password === '') throw new ErroHttp(400, 'Informe e-mail e senha.');
      const conta = banco.contas.find((candidata) => candidata.email === corpo.email && candidata.password === corpo.password);
      if (!conta) throw new ErroHttp(401, 'E-mail ou senha incorretos.');
      if (conta.status === 'inactive') throw new ErroHttp(401, 'Usuário inativo. Procure um administrador.');
      const token = randomUUID();
      sessoes.set(token, conta.id);
      return {
        corpo: { user: publico(conta), accessToken: token },
        cabecalhos: { 'Set-Cookie': `${NOME_DO_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax` },
      };
    }],
    ['POST', /^\/auth\/logout$/, ({ requisicao }) => {
      const { token } = exigirSessao(requisicao);
      sessoes.delete(token);
      return { status: 204, cabecalhos: { 'Set-Cookie': `${NOME_DO_COOKIE}=; Path=/; HttpOnly; Max-Age=0` } };
    }],
    ['GET', /^\/auth\/me$/, ({ requisicao }) => ({ corpo: publico(exigirSessao(requisicao).conta) })],

    ['GET', /^\/dashboard$/, ({ requisicao }) => {
      exigirSessao(requisicao);
      const criticos = banco.estoque.filter((item) => item.status === 'critical').length;
      const baixos = banco.estoque.filter((item) => item.status === 'low').length;
      return {
        corpo: {
          totalSurgeries: banco.cirurgias.length,
          readyKits: Object.keys(banco.kits).length,
          criticalStockItems: criticos,
          lowStockItems: baixos,
          stockItemCount: banco.estoque.length,
          surgeryTrend: { text: '+1 em relação a ontem', positive: true },
          schedule: banco.cirurgias.map((cirurgia, indice) => ({
            id: `s${indice + 1}`, surgeryId: cirurgia.id, time: cirurgia.time, surgery: cirurgia.name, room: cirurgia.room, surgeon: 'Dr. Pedro Rocha',
            status: indice === 0 ? 'em-andamento' : 'aguardando',
          })),
        },
      };
    }],

    ['GET', /^\/surgeries$/, ({ requisicao }) => { exigirSessao(requisicao); return { corpo: banco.cirurgias }; }],
    ['GET', /^\/surgeries\/([^/]+)\/kit$/, ({ requisicao, parametros }) => {
      exigirSessao(requisicao);
      const kit = banco.kits[parametros[0]];
      if (!kit) throw new ErroHttp(404, 'Cirurgia não encontrada.');
      return { corpo: kit };
    }],

    ['GET', /^\/stock$/, ({ requisicao }) => { exigirSessao(requisicao); return { corpo: banco.estoque }; }],
    ['POST', /^\/stock$/, ({ requisicao, corpo }) => {
      const { conta } = exigirAdministrador(requisicao);
      validarItemDeEstoque(corpo);
      banco.sequencia += 1;
      const item = {
        id: `e${banco.sequencia}`, name: corpo.name.trim(), available: corpo.available, minimum: corpo.minimum, unit: corpo.unit.trim(), category: corpo.category.trim(),
        status: calcularStatusDoEstoque(corpo.available, corpo.minimum), lastUpdated: hoje(), updatedBy: conta.name,
      };
      banco.estoque.unshift(item);
      return { status: 201, corpo: item };
    }],
    ['PUT', /^\/stock\/([^/]+)$/, ({ requisicao, corpo, parametros }) => {
      const { conta } = exigirAdministrador(requisicao);
      validarItemDeEstoque(corpo);
      const indice = banco.estoque.findIndex((item) => item.id === parametros[0]);
      if (indice < 0) throw new ErroHttp(404, 'Item de estoque não encontrado.');
      const atualizado = {
        ...banco.estoque[indice], name: corpo.name.trim(), available: corpo.available, minimum: corpo.minimum, unit: corpo.unit.trim(), category: corpo.category.trim(),
        status: calcularStatusDoEstoque(corpo.available, corpo.minimum), lastUpdated: hoje(), updatedBy: conta.name,
      };
      banco.estoque[indice] = atualizado;
      return { corpo: atualizado };
    }],
    ['DELETE', /^\/stock\/([^/]+)$/, ({ requisicao, parametros }) => {
      exigirAdministrador(requisicao);
      const indice = banco.estoque.findIndex((item) => item.id === parametros[0]);
      if (indice < 0) throw new ErroHttp(404, 'Item de estoque não encontrado.');
      banco.estoque.splice(indice, 1);
      return { status: 204 };
    }],
    ['POST', /^\/stock\/([^/]+)\/adjustments$/, ({ requisicao, corpo, parametros }) => {
      const { conta } = exigirAdministrador(requisicao);
      if (!corpo || !Number.isInteger(corpo.delta) || corpo.delta === 0) throw new ErroHttp(400, 'Informe um ajuste inteiro diferente de zero.');
      const indice = banco.estoque.findIndex((item) => item.id === parametros[0]);
      if (indice < 0) throw new ErroHttp(404, 'Item de estoque não encontrado.');
      const disponivel = Math.max(0, banco.estoque[indice].available + corpo.delta);
      banco.estoque[indice] = { ...banco.estoque[indice], available: disponivel, status: calcularStatusDoEstoque(disponivel, banco.estoque[indice].minimum), lastUpdated: hoje(), updatedBy: conta.name };
      return { corpo: banco.estoque[indice] };
    }],

    ['GET', /^\/reports$/, ({ requisicao }) => { exigirSessao(requisicao); return { corpo: banco.relatorios }; }],
    ['POST', /^\/reports$/, ({ requisicao, corpo }) => {
      exigirSessao(requisicao);
      validarRelatorio(corpo);
      banco.sequencia += 1;
      const relatorio = { id: `r${banco.sequencia}`, ...corpo };
      banco.relatorios.unshift(relatorio);
      return { status: 201, corpo: relatorio };
    }],

    ['GET', /^\/users$/, ({ requisicao }) => { exigirAdministrador(requisicao); return { corpo: banco.contas.map(usuarioDaLista) }; }],
    ['POST', /^\/users$/, ({ requisicao, corpo }) => {
      exigirAdministrador(requisicao);
      validarUsuario(corpo);
      if (banco.contas.some((conta) => conta.email.toLowerCase() === corpo.email.toLowerCase())) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.');
      banco.sequencia += 1;
      const conta = {
        id: `u${banco.sequencia}`, name: corpo.name.trim(), email: corpo.email.trim(), password: randomUUID(), role: corpo.role, shift: corpo.shift.trim(),
        initials: iniciaisDe(corpo.name), hospital: 'Hospital Central', phone: '', joinedAt: 'Novembro 2026', status: 'active',
      };
      banco.contas.push(conta);
      return { status: 201, corpo: usuarioDaLista(conta) };
    }],
    ['PUT', /^\/users\/([^/]+)$/, ({ requisicao, corpo, parametros }) => {
      exigirAdministrador(requisicao);
      validarUsuario(corpo);
      const conta = banco.contas.find((candidata) => candidata.id === parametros[0]);
      if (!conta) throw new ErroHttp(404, 'Usuário não encontrado.');
      if (banco.contas.some((outra) => outra.id !== conta.id && outra.email.toLowerCase() === corpo.email.toLowerCase())) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.');
      Object.assign(conta, { name: corpo.name.trim(), email: corpo.email.trim(), role: corpo.role, shift: corpo.shift.trim(), initials: iniciaisDe(corpo.name) });
      return { corpo: usuarioDaLista(conta) };
    }],
    ['PATCH', /^\/users\/([^/]+)\/status$/, ({ requisicao, corpo, parametros }) => {
      exigirAdministrador(requisicao);
      if (!corpo || !['active', 'inactive'].includes(corpo.status)) throw new ErroHttp(400, 'Status inválido.');
      const conta = banco.contas.find((candidata) => candidata.id === parametros[0]);
      if (!conta) throw new ErroHttp(404, 'Usuário não encontrado.');
      conta.status = corpo.status;
      if (corpo.status === 'inactive') for (const [token, idDoUsuario] of sessoes) if (idDoUsuario === conta.id) sessoes.delete(token);
      return { corpo: usuarioDaLista(conta) };
    }],

    ['GET', /^\/profile$/, ({ requisicao }) => ({ corpo: publico(exigirSessao(requisicao).conta) })],
    ['PATCH', /^\/profile$/, ({ requisicao, corpo }) => {
      const { conta } = exigirSessao(requisicao);
      if (!corpo || !ehTextoPreenchido(corpo.name)) throw new ErroHttp(400, 'Informe o nome.');
      if (typeof corpo.phone !== 'string') throw new ErroHttp(400, 'Informe o telefone.');
      Object.assign(conta, { name: corpo.name.trim(), phone: corpo.phone.trim(), initials: iniciaisDe(corpo.name) });
      return { corpo: publico(conta) };
    }],
    ['GET', /^\/profile\/notifications$/, ({ requisicao }) => { exigirSessao(requisicao); return { corpo: banco.preferencias }; }],
    ['PUT', /^\/profile\/notifications$/, ({ requisicao, corpo }) => {
      exigirSessao(requisicao);
      const chaves = ['stockAlert', 'surgeryReminder', 'voiceChecklist', 'weeklyReport'];
      if (!corpo || chaves.some((chave) => typeof corpo[chave] !== 'boolean')) throw new ErroHttp(400, 'Preferências inválidas.');
      banco.preferencias = Object.fromEntries(chaves.map((chave) => [chave, corpo[chave]]));
      return { corpo: banco.preferencias };
    }],
    ['PUT', /^\/profile\/password$/, ({ requisicao, corpo }) => {
      const { conta } = exigirSessao(requisicao);
      if (!corpo || typeof corpo.currentPassword !== 'string' || typeof corpo.newPassword !== 'string') throw new ErroHttp(400, 'Informe a senha atual e a nova senha.');
      if (corpo.currentPassword !== conta.password) throw new ErroHttp(400, 'Senha atual incorreta.');
      if (corpo.newPassword.length < 8) throw new ErroHttp(400, 'A nova senha deve ter pelo menos 8 caracteres.');
      conta.password = corpo.newPassword;
      return { status: 204 };
    }],
  ];

  async function lerCorpoJson(requisicao) {
    const pedacos = [];
    for await (const pedaco of requisicao) pedacos.push(pedaco);
    const texto = Buffer.concat(pedacos).toString('utf8');
    if (!texto) return undefined;
    try {
      return JSON.parse(texto);
    } catch {
      throw new ErroHttp(400, 'JSON inválido.');
    }
  }

  function responder(requisicao, resposta, status, corpo, cabecalhosExtras = {}) {
    const origem = requisicao.headers.origin;
    const cabecalhos = {
      ...cabecalhosExtras,
      ...(origem ? { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
    };
    if (corpo === undefined) {
      resposta.writeHead(status, cabecalhos).end();
      return;
    }
    resposta.writeHead(status, { ...cabecalhos, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(corpo));
  }

  const servidor = createServer(async (requisicao, resposta) => {
    try {
      const url = new URL(requisicao.url ?? '/', 'http://localhost');

      if (requisicao.method === 'OPTIONS') {
        responder(requisicao, resposta, 204, undefined, {
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600',
        });
        return;
      }

      if (requisicao.method === 'POST' && url.pathname === '/__test__/reset') {
        banco = dadosIniciais();
        sessoes.clear();
        responder(requisicao, resposta, 204, undefined);
        return;
      }

      if (!url.pathname.startsWith(`${PREFIXO}/`)) throw new ErroHttp(404, 'Rota não encontrada.');
      const caminho = url.pathname.slice(PREFIXO.length).replace(/\/$/, '');

      let rotaEncontrada = false;
      for (const [metodo, expressao, manipulador] of rotas) {
        const correspondencia = expressao.exec(caminho);
        if (!correspondencia) continue;
        rotaEncontrada = true;
        if (metodo !== requisicao.method) continue;
        const corpo = ['POST', 'PUT', 'PATCH'].includes(metodo) ? await lerCorpoJson(requisicao) : undefined;
        const parametros = correspondencia.slice(1).map(decodeURIComponent);
        const { status = 200, corpo: corpoDaResposta, cabecalhos } = manipulador({ requisicao, corpo, parametros });
        responder(requisicao, resposta, status, corpoDaResposta, cabecalhos);
        return;
      }
      throw rotaEncontrada ? new ErroHttp(405, 'Método não permitido.') : new ErroHttp(404, 'Rota não encontrada.');
    } catch (erro) {
      if (erro instanceof ErroHttp) return responder(requisicao, resposta, erro.status, { message: erro.message });
      console.error(erro);
      return responder(requisicao, resposta, 500, { message: 'Erro interno.' });
    }
  });

  return servidor;
}

/** Sobe o servidor e resolve com a porta efetiva (use porta 0 para uma porta livre). */
export function iniciarServidor(porta = 0) {
  const servidor = criarServidor();
  return new Promise((resolver, rejeitar) => {
    servidor.once('error', rejeitar);
    servidor.listen(porta, '127.0.0.1', () => {
      const endereco = servidor.address();
      resolver({ servidor, porta: typeof endereco === 'object' && endereco ? endereco.port : porta, fechar: () => new Promise((ok) => servidor.close(() => ok())) });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const porta = Number(process.env.API_PORT || 3000);
  const { porta: portaEfetiva } = await iniciarServidor(porta);
  console.log(`Servidor de referência do TrayCheck em http://127.0.0.1:${portaEfetiva}${PREFIXO}`);
}
