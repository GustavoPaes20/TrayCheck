import { describe, expect, it } from 'vitest';
import { interpretarAlternativas, interpretarResposta, normalizarFala } from '@/voice/interpretarResposta';

const item = { nomeDoItem: 'Pinça Kelly', outrosNomes: ['Bisturi nº 22', 'Tesoura Mayo', 'Pinça Halsted'] };
const classe = (fala: string, extra = {}) => interpretarResposta(fala, { ...item, ...extra }).classe;

describe('normalizarFala', () => {
  it('tira acentos, caixa e pontuação (mantendo a pausa como separador)', () => {
    expect(normalizarFala('  Não, ESTÁ Faltando! ')).toBe('nao | esta faltando');
  });
});

describe('respostas positivas', () => {
  it.each([
    'Sim', 'sim!', 'Tem', 'Temos', 'Pinça, temos', 'Pinça conferida', 'Checado', 'Check',
    'Certo', 'Afirmativo', 'Confirmado', 'tem sim', 'ok', 'Pinça Kelly ok', 'temos a pinça', 'A pinça está presente',
    'disponível', 'Beleza', 'pinças, temos',
  ])('"%s" confirma', (fala) => {
    expect(classe(fala)).toBe('positiva');
  });
});

describe('só o nome do item (confirmação mais fraca)', () => {
  it('exige confiança conhecida e alta do reconhecedor', () => {
    expect(classe('Pinça', { confianca: 0.9 })).toBe('positiva');
    expect(classe('pinça kelly', { confianca: 0.8 })).toBe('positiva');
    expect(classe('Pinça', { confianca: 0.6 })).toBe('inconclusiva');
    expect(classe('Pinça')).toBe('inconclusiva'); // confiança desconhecida: não confirma
    expect(classe('Pinça', { confianca: 0 })).toBe('inconclusiva');
  });
  it('com uma palavra de confirmação não precisa dessa exigência', () => {
    expect(classe('Pinça, temos')).toBe('positiva');
  });
});

describe('respostas negativas', () => {
  it.each([
    'Não', 'Não tem', 'Não temos', 'Nada', 'Falta', 'Está faltando', 'Pinça faltando', 'Não encontramos',
    'Indisponível', 'Negativo', 'não temos a pinça', 'sem pinça', 'nenhuma pinça', 'não tem não', 'faltou',
    'Pinça, não temos', 'ausente',
  ])('"%s" registra como faltante', (fala) => {
    expect(classe(fala)).toBe('negativa');
  });
});

describe('negativa tem prioridade sobre positiva', () => {
  it.each([
    ['Tem', 'positiva'], ['Não tem', 'negativa'], ['Temos', 'positiva'], ['Não temos', 'negativa'],
    ['Pinça conferida', 'positiva'], ['Pinça não conferida', 'negativa'], ['sim, falta', 'negativa'],
    ['não, tem sim', 'negativa'], ['tem mas está faltando', 'negativa'], ['Checado não', 'negativa'],
    ['não está confirmado', 'negativa'], ['ok não', 'negativa'],
  ])('"%s" => %s', (fala, esperado) => {
    expect(classe(fala)).toBe(esperado);
  });

  it('palavra positiva dentro de frase negativa nunca confirma', () => {
    for (const fala of ['não temos a pinça, só a tesoura que tem', 'sem a pinça mas tem tudo ok', 'nada disponível']) {
      expect(classe(fala)).not.toBe('positiva');
    }
  });
});

describe('dupla negação', () => {
  it.each(['Não está faltando', 'não falta', 'Pinça não está faltando', 'não tem falta', 'não está ausente'])(
    '"%s" confirma (frase inteira, sem pausa)', (fala) => {
      expect(classe(fala)).toBe('positiva');
    });

  it.each(['Não, está faltando', 'não. falta', 'não, falta pinça', 'não está faltando, não'])(
    '"%s" NÃO confirma', (fala) => {
      expect(classe(fala)).not.toBe('positiva');
    });
});

describe('respostas inconclusivas', () => {
  it.each([
    'Acho que sim', 'acho que não', 'talvez', 'creio que tem', 'não sei', 'não tenho certeza', 'mais ou menos',
    'pode ser', 'deve ter', 'parece que tem', 'provavelmente', '', '   ', 'banana', 'hum', 'sim, mas avisa o enfermeiro',
  ])('"%s" pede nova confirmação', (fala) => {
    expect(classe(fala)).toBe('inconclusiva');
  });

  it('citar OUTRO item (sem citar o atual) é inconclusivo, mesmo com "sim"', () => {
    expect(classe('tem o bisturi')).toBe('inconclusiva');
    expect(classe('sim, a tesoura')).toBe('inconclusiva');
  });

  it('citar outro item junto de uma negação também pede nova confirmação (a negativa pode ser sobre a outra peça)', () => {
    expect(classe('não temos o bisturi')).toBe('inconclusiva');
  });

  it('citar o item atual junto de "sim" confirma', () => {
    expect(classe('sim, a pinça')).toBe('positiva');
  });

  it('baixa confiança do reconhecedor invalida confirmação, mas não uma negativa', () => {
    expect(classe('sim', { confianca: 0.3 })).toBe('inconclusiva');
    expect(classe('Pinça', { confianca: 0.4 })).toBe('inconclusiva');
    expect(classe('não temos', { confianca: 0.3 })).toBe('negativa');
    expect(classe('sim', { confianca: 0.9 })).toBe('positiva');
    expect(classe('sim', { confianca: 0 })).toBe('positiva'); // 0 = "desconhecida" no Chrome
  });
});

describe('pedido de repetição', () => {
  it.each(['repete', 'pode repetir', 'de novo', 'não entendi', 'como assim'])('"%s" => repetir', (fala) => {
    expect(classe(fala)).toBe('repetir');
  });
});

describe('alternativas do reconhecedor', () => {
  it('todas positivas confirmam', () => {
    expect(interpretarAlternativas([{ transcript: 'sim' }, { transcript: 'tem' }], item).classe).toBe('positiva');
  });
  it('uma alternativa negativa vence', () => {
    expect(interpretarAlternativas([{ transcript: 'tem' }, { transcript: 'não tem' }], item).classe).toBe('negativa');
  });
  it('positiva que as alternativas contradizem vira inconclusiva', () => {
    expect(interpretarAlternativas([{ transcript: 'sim' }, { transcript: 'banana' }], item).classe).toBe('inconclusiva');
  });
  it('sem alternativas é inconclusiva', () => {
    expect(interpretarAlternativas([], item).classe).toBe('inconclusiva');
  });
});

describe('segurança: nada é confirmado sem confirmação clara', () => {
  it('lista de frases ambíguas jamais vira positiva', () => {
    for (const fala of ['', 'hum', 'sei lá', 'eu acho', 'olha', 'espera', 'um momento', 'bisturi', 'tesoura mayo', 'não']) {
      expect(classe(fala)).not.toBe('positiva');
    }
  });
});

describe('quantidade parcial ou diferente da anunciada não confirma o item', () => {
  it.each(['só tem um', 'tem só um', 'tem um só', 'tem apenas um', 'temos metade', 'tem poucos', 'temos alguns', 'tem somente uma', 'sobrou uma, tem'])(
    '"%s" => inconclusiva', (fala) => {
      expect(classe(fala, { quantidade: 2 })).toBe('inconclusiva');
    });

  it('número falado diferente do anunciado é inconclusivo; igual confirma', () => {
    expect(classe('tem 1 de 2', { quantidade: 2 })).toBe('inconclusiva');
    expect(classe('tem três', { quantidade: 2 })).toBe('inconclusiva');
    expect(classe('tem uma pinça', { quantidade: 2 })).toBe('inconclusiva');
    expect(classe('temos duas', { quantidade: 2 })).toBe('positiva');
    expect(classe('sim, dois', { quantidade: 2 })).toBe('positiva');
    expect(classe('tem 2', { quantidade: 2 })).toBe('positiva');
    expect(classe('tem um', { quantidade: 1 })).toBe('positiva');
  });

  it('sem quantidade conhecida, qualquer número falado pede confirmação', () => {
    expect(classe('tem dois')).toBe('inconclusiva');
  });

  it('números que fazem parte do nome do item não contam como quantidade', () => {
    expect(classe('bisturi 22, tem', { nomeDoItem: 'Bisturi nº 22', quantidade: 1, outrosNomes: [] })).toBe('positiva');
    expect(classe('luvas 7 ponto 0, temos', { nomeDoItem: 'Luvas Estéreis (7.0)', quantidade: 3, outrosNomes: [] })).toBe('positiva'); // "7" e "0" são do nome, não quantidade
  });

  it('falta de quantidade continua sendo negativa', () => {
    expect(classe('falta uma', { quantidade: 2 })).toBe('negativa');
    expect(classe('faltam duas', { quantidade: 2 })).toBe('negativa');
  });
});

describe('estado do material (esterilidade/integridade)', () => {
  it.each(['tem rasgado', 'tem vencido', 'está contaminado', 'tem sujo', 'embalagem aberta', 'incompleto', 'a ponta está torta',
    'sim, mas a ponta está torta', 'tem, mas enferrujado', 'temos, vencido'])('"%s" NUNCA confirma e registra como indisponível', (fala) => {
    expect(classe(fala)).toBe('negativa');
  });

  it.each(['não está vencido', 'não está rasgado', 'nada contaminado', 'sem sujeira, não está sujo'])(
    '"%s" (negação do estado) é ambígua: pede confirmação', (fala) => {
      expect(classe(fala)).toBe('inconclusiva');
    });
});

describe('ressalvas e itens citados', () => {
  it.each(['sem problema', 'não tem problema', 'tem problema', 'tem um defeito', 'tenho dúvida'])('"%s" => inconclusiva', (fala) => {
    expect(classe(fala)).toBe('inconclusiva');
  });

  it('citar outro item junto com o atual também pede confirmação', () => {
    expect(classe('temos a pinça kelly e o bisturi')).toBe('inconclusiva');
    expect(classe('tem a pinça e a tesoura mayo')).toBe('inconclusiva');
  });
});
