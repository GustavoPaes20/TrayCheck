import { Router } from 'express';
import { config } from '../config.js';
import { criarLimitador, criarSintetizador } from '../dominio/voz.js';
import { ErroApi } from '../http/erros.js';

// Voz do assistente da conferência (contrato: POST /voice/speech). Qualquer usuário autenticado.
// O navegador nunca fala com a ElevenLabs: ele pede o áudio aqui e a chave fica só no servidor.

const sintetizar = criarSintetizador();
const permitir = criarLimitador(config.voz.limitePorMinuto);

export const rotasVoz = Router();

rotasVoz.post('/voice/speech', async (req, res) => {
  if (!permitir(req.usuario!.id)) {
    throw new ErroApi(429, 'LIMITE_DE_VOZ', 'Muitas solicitações de voz. Aguarde alguns segundos.');
  }
  const { audio, doCache } = await sintetizar((req.body as { text: string }).text);
  res
    .status(200)
    .type('audio/mpeg')
    .set({ 'X-Cache': doCache ? 'HIT' : 'MISS', 'Cache-Control': 'private, max-age=3600' })
    .send(audio);
});
