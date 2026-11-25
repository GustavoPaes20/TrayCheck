# Voz do assistente da conferência

Como funciona o diálogo por voz da conferência cirúrgica, como configurar a voz (ElevenLabs) e quais são os limites.

> **Segurança do paciente em primeiro lugar.** Nenhum item é registrado como disponível sem uma confirmação verbal
> clara. Na dúvida o assistente **pergunta de novo** e não registra nada.

## Fluxo

```
anuncia o item  →  (o áudio TERMINA)  →  pausa curta  →  abre o microfone  →  ouve UMA resposta
      ↑                                                                              │
      │                                         fecha o microfone  →  interpreta  ←──┘
      │                                                                 │
      └── próximo item  ←  registra (disponível / faltante)  ←──────────┤
                                       pergunta de novo (inconclusiva) ─┘
```

Peças (todas em `src/frontend/voice/`):

| Arquivo | Responsabilidade |
| --- | --- |
| `interpretarResposta.ts` | Função pura: texto falado → `positiva`, `negativa`, `inconclusiva` ou `repetir`. |
| `controlador.ts` | Máquina de estados do diálogo (anunciar → ouvir → registrar). Garante que fala e microfone nunca se sobreponham. |
| `falante.ts` | Fala o texto e **só resolve quando o áudio termina**. Com backend, **toda fala é da ElevenLabs** (cache + 3 tentativas); **não há voz do navegador de reserva**. Se falhar, `falhou = true` e a conversa pausa. Sem backend (demonstração), usa a voz do navegador. |
| `reconhecedor.ts` | Web Speech API, uma escuta por vez, só resultados finais, microfone fechado assim que a resposta chega. |
| `anuncio.ts` | Texto de tela → fala natural ("nº 22" → "número 22", "2 unid" → "2 unidades"). |

## Como o microfone não ouve a voz do assistente

1. O microfone fica **fechado** durante toda fala e só abre depois que o áudio termina (+ `ATRASO_APOS_FALA_MS`, 450 ms).
2. Cada escuta aceita **uma** resposta final e fecha o microfone na hora; o que chegar depois é descartado.
3. Cada início/pausa/ação manual cria uma nova "geração": resposta de turno antigo nunca registra nada.
4. Segunda barreira: transcrição com 3+ palavras que são só um pedaço da última fala do assistente é tratada como eco e ignorada.

## Regras de interpretação

- **Negativa tem prioridade.** "Não tem", "faltando", "indisponível", "negativo", "nada"... Qualquer sinal negativo
  impede a confirmação, mesmo com "tem"/"sim" na mesma frase.
- **Positivas:** "sim", "tem", "temos", "checado", "check", "certo", "afirmativo", "confirmado", "ok"... e o **nome do
  item** com confirmação ("Pinça conferida", "Pinça, temos"). O **nome sozinho** ("Pinça") só vale com confiança alta
  do reconhecedor (≥ 0,75), porque é a confirmação mais fraca: é o que o próprio assistente acabou de dizer.
- **Estado do material:** "rasgado", "vencido", "contaminado", "sujo", "aberto", "incompleto", "torto"... registram o
  item como **indisponível**, mesmo com "tem" na frase. "Não está vencido" é ambíguo e pede nova confirmação.
- **Quantidade:** o anúncio diz a quantidade ("2 unidades"). "Só tem um", "tem 1 de 2", "metade", "alguns" ou um número
  diferente do anunciado **não confirmam** (inconclusiva). O número só vale se for igual ao anunciado.
- **Dupla negação** ("não está faltando", "não falta") confirma, mas só como frase inteira e **sem pausa**
  ("não, está faltando" é negativa).
- **Inconclusiva** (não registra): hesitação ("acho que", "talvez", "não sei"), conversa fora do assunto, nome de
  **outro** item (mesmo junto com o atual), ressalvas como "problema" ou "defeito", quantidade parcial, baixa confiança
  do reconhecedor numa resposta positiva, ou alternativas do reconhecedor que discordam.
  O assistente diz: *"Não consegui confirmar. {item} está disponível?"*
- **Janela de resposta garantida:** o usuário tem `TEMPO_MAXIMO_DE_ESCUTA_MS` (12 s, em `reconhecedor.ts`) para responder.
  O Chrome costuma encerrar o reconhecimento antes (silêncio curto, fim espontâneo): o reconhecedor **reabre o microfone
  sozinho** até completar a janela. Se a janela inteira passa em silêncio, o controlador reabre mais uma vez em silêncio
  (`REABERTURAS_SILENCIOSAS`, em `controlador.ts`) antes de o assistente repetir a pergunta. A tela mostra "Abrindo o
  microfone..." e só passa a "Ouvindo..." quando o navegador realmente começou a captar áudio.
- **Voz indisponível:** se a ElevenLabs não responder (chave/voz inválidas, plano, rede), o assistente **não** fala com a
  voz do navegador: a conversa pausa com o aviso "A voz do assistente (ElevenLabs) não respondeu..." e os botões da tela
  continuam funcionando.
- Depois de **3** respostas ruins/ausentes seguidas no mesmo item, o assistente **pausa** e orienta o uso dos botões.
- **Diagnóstico:** o Console do navegador (nível Info) mostra cada reabertura (`[voz] o navegador encerrou a escuta (end)
  após 640 ms; reabrindo o microfone (1)`) e o fim da escuta (`[voz] escuta encerrada: silencio após 12003 ms; microfone
  aberto: sim; reinícios: 3`). Útil quando a escuta fecha cedo demais.
- Pedido para repetir ("repete", "não entendi") repete a pergunta sem contar como tentativa.

## Configuração da voz (ElevenLabs)

Tudo no `backend/.env` (modelo em `backend/.env.example`). **Nunca** coloque a chave no frontend nem em arquivos `VITE_*`.

| Variável | Para quê |
| --- | --- |
| `ELEVENLABS_API_KEY` | Chave da API. Só no backend. |
| `ELEVENLABS_VOICE_ID` | Voz **masculina em português do Brasil** escolhida na Voice Library (ouça antes de escolher). |
| `ELEVENLABS_MODEL_ID` | Padrão `eleven_multilingual_v2` (melhor PT-BR e aceita velocidade). |
| `ELEVENLABS_STABILITY` / `_SIMILARITY` / `_STYLE` / `_SPEED` | Tom. Estabilidade alta + estilo 0 = voz serena e uniforme; velocidade 0,95. |
| `VOZ_CACHE_ITENS`, `VOZ_LIMITE_POR_MINUTO` | Cache de frases e limite por usuário (protege o crédito). |

Se a ElevenLabs falhar (sem chave, sem crédito, rede), a rota responde `503 VOZ_INDISPONIVEL`; o frontend usa a voz do
navegador e **não tenta de novo por 2 minutos**. O diálogo nunca trava por causa disso.

No **modo demonstração** (sem `VITE_API_BASE_URL`) não há backend, então a voz é a do navegador.

## Limitações conhecidas

- A ElevenLabs só **gera voz**. O reconhecimento é o do navegador (Web Speech API): funciona bem no Chrome/Edge;
  Firefox não suporta; Safari tem suporte parcial. Em cada navegador o comportamento deve ser validado em campo.
- O reconhecimento do Chrome envia o áudio ao serviço de fala do Google (exige internet).
- A qualidade/serenidade da voz depende da voz escolhida e dos ajustes de tom: precisa ser **ouvida e aprovada** por uma pessoa.
- Ambiente cirúrgico ruidoso (máscaras, equipamentos) reduz a taxa de acerto; por isso a regra é "na dúvida, perguntar de novo".
- O mesmo caminho por toque (botões) continua disponível e conclui a conferência se o microfone falhar.
