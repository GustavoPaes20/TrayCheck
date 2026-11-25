# ADR 0004 — Voz do assistente: síntese pela ElevenLabs via backend, sem voz de reserva

- **Status:** Aceita (25/11/2026)
- **Requisitos:** RF07, RNF02, RNF03, RNF07 (voz); RNF01 (segredos fora do código)
- **Origem:** PRs #23, #24 (RFC-09) e #25 (RFC-10)
- **Substitui parcialmente:** a estratégia do ERS 2.5, seção 2.6.3 (Web Speech API e/ou Google Speech-to-Text)

## Contexto

A conferência por voz precisa **falar** o item ao usuário e **ouvir** a resposta. Nos testes com a voz de síntese do navegador (SpeechSynthesis), a voz mudava de um computador para outro (voz robótica, idioma diferente do pt-BR) e o texto falado às vezes era captado pelo microfone, o que confirmava itens por engano. Era preciso uma voz uniforme e controlável, sem expor a chave de nenhum serviço no navegador.

## Decisão

1. **Falar:** toda fala do assistente, quando o frontend está conectado ao backend, é sintetizada pela **ElevenLabs** por meio de `POST /api/v1/voice/speech` (IC-16). A chave (`ELEVENLABS_API_KEY`) e o identificador da voz existem **somente** em `backend/.env` (ignorado pelo Git); o navegador nunca as recebe. A rota exige sessão, limita 60 requisições por minuto por usuário, guarda respostas iguais em cache e responde `503 VOZ_INDISPONIVEL` quando o serviço não está configurado ou falha.
2. **Ouvir:** o reconhecimento continua na **Web Speech API** do navegador (somente Google Chrome ou Microsoft Edge). O microfone só abre depois que o áudio do assistente termina e fica aberto por uma janela garantida de 12 segundos.
3. **Sem voz de reserva:** se a ElevenLabs falhar (três tentativas), o assistente **não** usa a voz do navegador: a conferência por voz **pausa** com um aviso e continua pelos botões da tela (RNF02). No modo demonstração (sem backend) existe apenas a voz do navegador.
4. **Segurança do paciente:** nenhum item é registrado como disponível sem uma confirmação clara; resposta ambígua, quantidade diferente da anunciada ou nome de outro item não registra nada e o assistente pergunta de novo. Negação tem prioridade sobre afirmação.

## Alternativas consideradas

- **Voz do navegador (SpeechSynthesis) como padrão ou reserva:** sem custo, mas a qualidade varia por aparelho e a voz de reserva escondia a falha do serviço principal; descartada.
- **Google Text-to-Speech / Speech-to-Text (ERS 2.5):** exigiria credenciais de nuvem e um backend equivalente; sem ganho para o escopo acadêmico.
- **Chamar a ElevenLabs direto do navegador:** expõe a chave; descartada.
- **Reconhecimento no servidor:** adiciona envio contínuo de áudio e custo; fora do escopo.

## Consequências

- Passa a existir uma dependência externa paga ou com plano gratuito limitado: vozes de biblioteca exigem plano pago (`402`); no plano gratuito usam-se vozes pré-fabricadas (*premade*).
- O reconhecimento não funciona no Brave (erro `network`) nem em navegadores sem a Web Speech API; nesses casos vale o toque.
- A medição do RNF03 (≥ 80% em 50 comandos) continua manual: roteiro em `docs/Roteiro_RNF03_TrayCheck.xlsx` (IC-09).
- Pular, ajustar quantidade e finalizar permanecem por toque; é um desvio do texto do RF07 registrado na RTM 1.7.
- O contrato passa à versão 1.3.0 e o backend à 1.2.

## Referências

- `docs/voz-do-assistente.md`, `backend/src/rotas/voz.ts`, `backend/src/dominio/voz.ts`, `src/frontend/voice/`
- RFC-09 e RFC-10 (`docs/pcm/PCM_TrayCheck.xlsx`)
