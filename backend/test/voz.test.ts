import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { criarLimitador, criarSintetizador, type OpcoesDeVoz } from '../src/dominio/voz.js';
import { ErroApi } from '../src/http/erros.js';

// Síntese de voz (ElevenLabs): não precisa de banco nem de rede — o fetch é simulado.

const CHAVE_FALSA = 'chave-de-teste-nao-real';
const opcoes: OpcoesDeVoz = {
  chaveApi: CHAVE_FALSA, idDaVoz: 'voz-teste', idDoModelo: 'eleven_multilingual_v2',
  estabilidade: 0.65, similaridade: 0.8, estilo: 0, velocidade: 0.95,
  tempoLimiteMs: 1000, limiteCacheItens: 2, limitePorMinuto: 3,
};

function fetchFalso(corpo = new Uint8Array([1, 2, 3]), status = 200) {
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  const buscar = async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response(status === 200 ? corpo : 'erro com detalhes internos', { status });
  };
  return { buscar, chamadas };
}

async function codigoDoErro(promessa: Promise<unknown>): Promise<[number, string]> {
  try {
    await promessa;
  } catch (erro) {
    assert.ok(erro instanceof ErroApi);
    return [erro.status, erro.codigo];
  }
  assert.fail('deveria ter lançado ErroApi');
}

describe('sintetizador de voz', () => {
  test('chama a ElevenLabs com a chave no cabeçalho, voz, modelo e ajustes de tom', async () => {
    const { buscar, chamadas } = fetchFalso();
    const { audio, doCache } = await criarSintetizador(opcoes, buscar)('Primeiro item: Pinça Kelly.');
    assert.deepEqual([...audio], [1, 2, 3]);
    assert.equal(doCache, false);
    const [chamada] = chamadas;
    assert.match(chamada!.url, /\/v1\/text-to-speech\/voz-teste\?output_format=mp3/);
    assert.equal((chamada!.init.headers as Record<string, string>)['xi-api-key'], CHAVE_FALSA);
    const corpo = JSON.parse(chamada!.init.body as string);
    assert.equal(corpo.text, 'Primeiro item: Pinça Kelly.');
    assert.equal(corpo.model_id, 'eleven_multilingual_v2');
    assert.equal(corpo.voice_settings.stability, 0.65);
    assert.equal(corpo.voice_settings.speed, 0.95);
    assert.ok(!JSON.stringify(corpo).includes(CHAVE_FALSA), 'a chave não pode ir no corpo');
  });

  test('frase repetida sai do cache e não chama a ElevenLabs de novo', async () => {
    const { buscar, chamadas } = fetchFalso();
    const sintetizar = criarSintetizador(opcoes, buscar);
    await sintetizar('Não consegui confirmar.');
    const segunda = await sintetizar('  Não   consegui confirmar. ');
    assert.equal(segunda.doCache, true);
    assert.equal(chamadas.length, 1);
  });

  test('o cache descarta a frase menos usada quando passa do limite', async () => {
    const { buscar, chamadas } = fetchFalso();
    const sintetizar = criarSintetizador(opcoes, buscar); // limite 2
    await sintetizar('a'); await sintetizar('b'); await sintetizar('a'); await sintetizar('c'); // descarta "b"
    await sintetizar('a');
    assert.equal(chamadas.length, 3);
    await sintetizar('b');
    assert.equal(chamadas.length, 4);
  });

  test('sem chave ou sem voz => 503 VOZ_INDISPONIVEL, sem chamar a rede', async () => {
    const { buscar, chamadas } = fetchFalso();
    assert.deepEqual(await codigoDoErro(criarSintetizador({ ...opcoes, chaveApi: '' }, buscar)('oi')), [503, 'VOZ_INDISPONIVEL']);
    assert.deepEqual(await codigoDoErro(criarSintetizador({ ...opcoes, idDaVoz: '' }, buscar)('oi')), [503, 'VOZ_INDISPONIVEL']);
    assert.equal(chamadas.length, 0);
  });

  test('erro da ElevenLabs (401, 429, 500) => 503, sem vazar o corpo do erro', async () => {
    for (const status of [401, 429, 500]) {
      const { buscar } = fetchFalso(undefined, status);
      try {
        await criarSintetizador(opcoes, buscar)('oi');
        assert.fail('deveria falhar');
      } catch (erro) {
        assert.ok(erro instanceof ErroApi);
        assert.equal(erro.status, 503);
        assert.ok(!JSON.stringify(erro.paraJson()).includes('internos'));
        assert.ok(!JSON.stringify(erro.paraJson()).includes(CHAVE_FALSA));
      }
    }
  });

  test('falha de rede e áudio vazio => 503', async () => {
    const quebrado = async () => { throw new Error('ECONNRESET'); };
    assert.deepEqual(await codigoDoErro(criarSintetizador(opcoes, quebrado)('oi')), [503, 'VOZ_INDISPONIVEL']);
    const vazio = fetchFalso(new Uint8Array());
    assert.deepEqual(await codigoDoErro(criarSintetizador(opcoes, vazio.buscar)('oi')), [503, 'VOZ_INDISPONIVEL']);
  });

  test('texto em branco => 400', async () => {
    const { buscar } = fetchFalso();
    assert.deepEqual(await codigoDoErro(criarSintetizador(opcoes, buscar)('   ')), [400, 'VALIDACAO']);
  });
});

describe('limitador de voz', () => {
  test('bloqueia acima do limite por minuto e libera depois da janela, por usuário', () => {
    let agora = 1_000_000;
    const permitir = criarLimitador(3, () => agora);
    assert.deepEqual([1, 2, 3, 4].map(() => permitir(7)), [true, true, true, false]);
    assert.equal(permitir(8), true); // outro usuário não é afetado
    agora += 61_000;
    assert.equal(permitir(7), true);
  });
});
