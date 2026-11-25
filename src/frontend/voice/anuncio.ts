// Como o assistente fala os itens: o texto de tela ("Bisturi nº 22", "2 unid") vira fala natural.

const UNIDADES: Record<string, [singular: string, plural: string]> = {
  unid: ['unidade', 'unidades'],
  un: ['unidade', 'unidades'],
  amp: ['ampola', 'ampolas'],
  bolsas: ['bolsa', 'bolsas'],
  pares: ['par', 'pares'],
  cilindro: ['cilindro', 'cilindros'],
  kit: ['kit', 'kits'],
};

/** Texto do nome pronto para o sintetizador (sem símbolos que ele lê mal). */
export function nomeParaFala(nome: string): string {
  return nome
    .replace(/n[º°]\s*/gi, 'número ')
    .replace(/(\d)\s*mm\b/gi, '$1 milímetros')
    .replace(/(\d)\s*cm\b/gi, '$1 centímetros')
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Pinça Kelly, 2 unidades" / "Bisturi número 22, 1 unidade". */
export function anuncioDoItem(item: { name: string; quantity: number; unit: string }): string {
  const forma = UNIDADES[item.unit.toLowerCase()];
  const unidade = forma ? (item.quantity === 1 ? forma[0] : forma[1]) : item.unit;
  return `${nomeParaFala(item.name)}, ${item.quantity} ${unidade}`;
}
