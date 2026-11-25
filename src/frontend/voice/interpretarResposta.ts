// Interpretador das respostas faladas na conferência ("Pinça, temos", "Não tem", "Acho que sim"...).
//
// É uma função PURA (sem navegador, sem estado): recebe o texto reconhecido e devolve uma classificação.
// Regras de segurança (um item só é "disponível" com confirmação clara):
//   1. NEGATIVA tem prioridade: qualquer sinal de falta/negação na frase impede a confirmação.
//   2. Hesitação ("acho que", "talvez", "não sei") => INCONCLUSIVA, mesmo que haja "sim" ou "não" na frase.
//   3. Dupla negação ("não está faltando") só confirma quando é a frase inteira, sem vírgula/pausa no meio.
//   4. Na dúvida, INCONCLUSIVA: o assistente pergunta de novo, nunca registra no escuro.

export type ClasseDaResposta = 'positiva' | 'negativa' | 'inconclusiva' | 'repetir';

export type Interpretacao = {
  classe: ClasseDaResposta;
  /** Explica a decisão (útil para testes, registros e depuração). */
  motivo: string;
  /** Texto normalizado que foi analisado. */
  textoNormalizado: string;
};

export type OpcoesDeInterpretacao = {
  /** Nome do item que está sendo conferido; permite aceitar "Pinça" sozinho como confirmação. */
  nomeDoItem?: string;
  /** Nomes dos demais itens: citar OUTRO item (com ou sem o atual) torna a resposta inconclusiva. */
  outrosNomes?: string[];
  /** Quantidade anunciada do item: um número falado diferente dela torna a resposta inconclusiva. */
  quantidade?: number;
  /** Confiança (0–1) informada pelo reconhecedor; 0/indefinida = desconhecida. */
  confianca?: number;
};

/** Abaixo disso, uma resposta positiva não é aceita (negativas continuam valendo: errar para "falta" é o lado seguro). */
export const CONFIANCA_MINIMA_POSITIVA = 0.6;

/** Dizer só o nome do item ("Pinça") é a confirmação mais fraca (é o que o próprio assistente acabou de dizer): exige confiança conhecida e alta. */
export const CONFIANCA_MINIMA_SO_NOME = 0.75;

const SEPARADOR = ' | ';

/** Minúsculas, sem acentos; pontuação vira separador (para distinguir "não, está faltando" de "não está faltando"). */
export function normalizarFala(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[,.;:!?…\-–—]+/g, SEPARADOR)
    .replace(/[^a-z0-9| ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:\| ?)+|(?: ?\|)+$/g, '')
    .trim();
}

const semSeparador = (texto: string) => texto.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

const HESITACOES = [
  'acho que', 'acho', 'achamos', 'talvez', 'creio', 'imagino', 'parece', 'parece que', 'mais ou menos',
  'nao sei', 'nao tenho certeza', 'nao tenho ctz', 'nao lembro', 'pode ser', 'deve ter', 'deve estar',
  'quase', 'sera', 'sera que', 'duvido', 'em duvida', 'incerto', 'nao vi direito', 'nao deu pra ver',
  'depende', 'supostamente', 'possivelmente', 'provavelmente', 'se nao me engano',
  // Ressalvas: "sem problema" / "não tem problema" são ambíguas; melhor perguntar de novo.
  'problema', 'problemas', 'defeito', 'defeitos', 'duvida',
];

/** Estado do material (esterilidade/integridade): o item existe, mas NÃO está apto, então não pode ser confirmado. */
const CONDICOES = new Set([
  'vencido', 'vencida', 'vencidos', 'vencidas', 'rasgado', 'rasgada', 'rasgados', 'rasgadas',
  'contaminado', 'contaminada', 'contaminados', 'contaminadas', 'estragado', 'estragada',
  'sujo', 'suja', 'sujos', 'sujas', 'aberto', 'aberta', 'abertos', 'abertas',
  'defeituoso', 'defeituosa', 'incompleto', 'incompleta', 'incompletos', 'incompletas',
  'torto', 'torta', 'enferrujado', 'enferrujada', 'amassado', 'amassada', 'trincado', 'trincada',
  'molhado', 'molhada', 'umido', 'umida', 'furado', 'furada', 'violado', 'violada', 'invalido', 'invalida',
  'esterilizado vencido',
]);

/** Palavras que indicam quantidade parcial: "só tem um", "temos metade". */
const QUANTIDADE_PARCIAL = new Set([
  'so', 'somente', 'apenas', 'metade', 'pouco', 'poucos', 'pouca', 'poucas', 'algum', 'alguns', 'algumas',
  'parte', 'parcial', 'parcialmente', 'restante', 'restam', 'sobrou', 'sobraram', 'menos',
]);

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20,
};

const valorNumerico = (palavra: string): number | null =>
  /^\d+$/.test(palavra) ? Number(palavra) : (NUMEROS[palavra] ?? null);

const NEGATIVAS = new Set([
  'nao', 'nada', 'nunca', 'nem', 'nenhum', 'nenhuma', 'sem', 'negativo', 'negativa',
  'falta', 'faltam', 'faltando', 'faltou', 'faltante', 'faltantes', 'ausente', 'ausentes', 'ausencia',
  'indisponivel', 'indisponiveis', 'esgotado', 'esgotada', 'extraviado', 'extraviada', 'perdido', 'perdida',
  'quebrado', 'quebrada', 'danificado', 'danificada', 'vazio', 'vazia', 'cade', 'nops', 'nope',
]);

const POSITIVAS = new Set([
  'sim', 'tem', 'temos', 'tenho', 'tinha', 'ok', 'okay', 'okey', 'certo', 'certinho', 'correto', 'afirmativo',
  'positivo', 'confirmado', 'confirmada', 'confirmo', 'confirmei', 'checado', 'checada', 'checamos', 'check', 'checkado',
  'conferido', 'conferida', 'conferimos', 'conferi', 'presente', 'presentes', 'disponivel', 'disponiveis',
  'encontrado', 'encontrada', 'encontrei', 'encontramos', 'beleza', 'pronto', 'aqui', 'confere', 'conferem',
  'isso', 'exato', 'exatamente', 'claro', 'uhum', 'aham',
]);

/** "não está faltando", "não falta", "não tem falta", "não está ausente": confirmam, mas só como frase inteira. */
const DUPLA_NEGACAO =
  /^(?:nao (?:esta |estao |ha |tem |temos |tenho )?(?:faltando|falta|faltam|faltou|faltante|faltantes|ausente|ausentes|indisponivel|indisponiveis)|nada (?:esta )?(?:faltando|falta)|sem (?:nenhuma )?falta)$/;

const PEDIDOS_DE_REPETICAO = /\b(repet\w*|de novo|novamente|outra vez|como assim|nao (?:ouvi|escutei|entendi)|pode falar de novo)\b/;

const PALAVRAS_DE_LIGACAO = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'e', 'item', 'numero', 'n']);

function palavras(texto: string): string[] {
  return semSeparador(texto).split(' ').filter(Boolean);
}

function palavrasDoNome(nome: string | undefined): string[] {
  return palavras(normalizarFala(nome ?? '')).filter((p) => !PALAVRAS_DE_LIGACAO.has(p) && p.length > 1);
}

/** Radical simples para casar "pinça"/"pinças" e "tesoura"/"tesouras". */
const radical = (palavra: string) => palavra.replace(/(es|s)$/, '');

function citaItem(falaPalavras: string[], nomePalavras: string[]): boolean {
  if (nomePalavras.length === 0) return false;
  const radicais = new Set(falaPalavras.map(radical));
  return nomePalavras.some((p) => p.length > 2 && radicais.has(radical(p)));
}

function pronto(classe: ClasseDaResposta, motivo: string, textoNormalizado: string): Interpretacao {
  return { classe, motivo, textoNormalizado };
}

/** Interpreta UMA transcrição. */
export function interpretarResposta(transcricao: string, opcoes: OpcoesDeInterpretacao = {}): Interpretacao {
  const normalizado = normalizarFala(transcricao);
  const plano = semSeparador(normalizado);
  if (!plano) return pronto('inconclusiva', 'Nenhuma fala reconhecida.', normalizado);

  // 1) Pedido para repetir o item (não registra nada).
  if (PEDIDOS_DE_REPETICAO.test(plano)) return pronto('repetir', 'Pedido para repetir.', normalizado);

  // 2) Hesitação: inconclusiva, vale mais que qualquer "sim"/"não" da mesma frase.
  const comEspacos = ` ${plano} `;
  const hesitacao = HESITACOES.find((h) => comEspacos.includes(` ${h} `));
  if (hesitacao) return pronto('inconclusiva', `Hesitação ("${hesitacao}").`, normalizado);

  // 3) Citou outro item e não o atual: a resposta pode ser sobre outra peça.
  const palavrasDaFala = palavras(normalizado);
  const nomeAtual = palavrasDoNome(opcoes.nomeDoItem);
  const citouAtual = citaItem(palavrasDaFala, nomeAtual);
  const citouOutro = (opcoes.outrosNomes ?? []).some((nome) => {
    const outro = palavrasDoNome(nome).filter((p) => !nomeAtual.includes(p));
    return citaItem(palavrasDaFala, outro);
  });
  if (citouOutro) return pronto('inconclusiva', 'Citou outro item: a resposta pode não ser sobre o item atual.', normalizado);

  const confiancaBaixa = opcoes.confianca !== undefined && opcoes.confianca > 0 && opcoes.confianca < CONFIANCA_MINIMA_POSITIVA;

  // 4) Dupla negação ("não está faltando"): só vale como frase inteira. Uma pausa/vírgula no meio
  //    ("não, está faltando") separa as frases e NÃO confirma. O nome do item pode vir antes ou depois.
  const ehNomeOuLigacao = (p: string) => PALAVRAS_DE_LIGACAO.has(p)
    || (citouAtual && nomeAtual.map(radical).includes(radical(p)));
  const segmentos = normalizado.split('|').map((s) => s.trim()).filter(Boolean);
  const comConteudo = segmentos.map((s) => s.split(' ').filter((p) => !ehNomeOuLigacao(p)).join(' ')).filter(Boolean);
  if (comConteudo.length === 1 && DUPLA_NEGACAO.test(comConteudo[0]!)) {
    return confiancaBaixa
      ? pronto('inconclusiva', 'Dupla negação com baixa confiança.', normalizado)
      : pronto('positiva', 'Dupla negação clara ("não está faltando").', normalizado);
  }

  // 4b) Estado do material ("rasgado", "vencido"...): o item não está apto. "Não está vencido" é ambíguo, então pergunta de novo.
  const condicao = palavrasDaFala.find((p) => CONDICOES.has(p));
  if (condicao) {
    const negacao = palavrasDaFala.some((p) => ['nao', 'nem', 'nunca', 'nenhum', 'nenhuma', 'sem', 'nada'].includes(p));
    return negacao
      ? pronto('inconclusiva', `Negação de estado do material ("${condicao}").`, normalizado)
      : pronto('negativa', `Material em condição inadequada ("${condicao}").`, normalizado);
  }

  // 5) Negativa tem prioridade absoluta sobre a positiva.
  const negativa = palavrasDaFala.find((p) => NEGATIVAS.has(p));
  if (negativa) return pronto('negativa', `Sinal negativo ("${negativa}").`, normalizado);

  // 6) Positiva explícita.
  const positivas = palavrasDaFala.filter((p) => POSITIVAS.has(p));
  const restante = palavrasDaFala.filter((p) => p !== '|' && !POSITIVAS.has(p) && !PALAVRAS_DE_LIGACAO.has(p)
    && !(citouAtual && nomeAtual.map(radical).includes(radical(p))));
  if (positivas.length > 0) {
    if (confiancaBaixa) return pronto('inconclusiva', 'Resposta positiva com baixa confiança.', normalizado);
    // Palavras desconhecidas junto com o "sim" ("sim mas a ponta está torta") não confirmam.
    if (/\b(mas|porem|entretanto|so que)\b/.test(plano)) {
      return pronto('inconclusiva', 'Ressalva na frase ("mas").', normalizado);
    }
    // Quantidade parcial ou diferente da anunciada ("só tem um", "tem 1 de 2") não confirma o item inteiro.
    const parcial = palavrasDaFala.find((p) => QUANTIDADE_PARCIAL.has(p));
    if (parcial) return pronto('inconclusiva', `Quantidade parcial ("${parcial}").`, normalizado);
    const tokensDoNome = new Set(palavras(normalizarFala(opcoes.nomeDoItem ?? '')));
    const numeros = palavrasDaFala.filter((p) => !tokensDoNome.has(p)).map(valorNumerico).filter((n): n is number => n !== null);
    if (numeros.length > 0 && (opcoes.quantidade === undefined || numeros.some((n) => n !== opcoes.quantidade))) {
      return pronto('inconclusiva', `Quantidade falada (${numeros.join(', ')}) difere da anunciada.`, normalizado);
    }
    return pronto('positiva', `Confirmação explícita ("${positivas[0]}").`, normalizado);
  }

  // 7) Só o nome do item ("Pinça"): confirmação pelo nome, como nos exemplos do pedido.
  if (citouAtual && restante.length === 0) {
    const confiante = opcoes.confianca !== undefined && opcoes.confianca >= CONFIANCA_MINIMA_SO_NOME;
    return confiante
      ? pronto('positiva', 'Apenas o nome do item foi dito.', normalizado)
      : pronto('inconclusiva', 'Só o nome do item, sem confiança suficiente do reconhecedor.', normalizado);
  }

  return pronto('inconclusiva', 'Resposta não reconhecida.', normalizado);
}

/**
 * Interpreta as ALTERNATIVAS do reconhecedor para a mesma fala (mais segura que olhar só a primeira):
 *   - alguma alternativa negativa  -> negativa (lado seguro);
 *   - todas positivas             -> positiva;
 *   - qualquer outra combinação   -> inconclusiva.
 */
export function interpretarAlternativas(
  alternativas: Array<{ transcript: string; confidence?: number }>,
  opcoes: Omit<OpcoesDeInterpretacao, 'confianca'> = {},
): Interpretacao {
  const lista = alternativas.filter((a) => a.transcript.trim());
  if (lista.length === 0) return pronto('inconclusiva', 'Nenhuma fala reconhecida.', '');
  const resultados = lista.map((a) => interpretarResposta(a.transcript, { ...opcoes, confianca: a.confidence }));
  const principal = resultados[0]!;
  if (principal.classe === 'repetir') return principal;
  const negativa = resultados.find((r) => r.classe === 'negativa');
  if (negativa) return negativa;
  if (resultados.every((r) => r.classe === 'positiva')) return principal;
  if (principal.classe === 'positiva') {
    return pronto('inconclusiva', 'Alternativas do reconhecedor discordam.', principal.textoNormalizado);
  }
  return principal;
}
