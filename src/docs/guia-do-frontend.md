# Guia do Frontend TrayCheck

## Objetivo e limites

Este repositório contém o frontend React/TypeScript do TrayCheck. Ele apresenta os fluxos de demonstração e prepara a comunicação com uma API REST; não implementa servidor, autenticação real nem persistência em banco de dados. A integração de produção depende da API descrita em [frontend-api-contract.md](frontend-api-contract.md).

O refinamento de código mantém aparência e comportamento da aplicação. As mudanças de nomes são internas ao TypeScript; chaves serializadas, endpoints, IDs de telas, valores de papéis/status e atributos exigidos por React e pelo navegador permanecem como estão.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `src/main.tsx` | Inicializa React, importa o CSS global e monta o aplicativo no elemento `root`. |
| `src/App.tsx` | Mantém a sessão em memória, navegação, alertas e composição das telas. |
| `src/components/` | Telas e componentes da interface: login, painel, kits, conferência, estoque, relatórios, perfil e navegação. |
| `src/components/admin/` | Formulários administrativos de estoque e usuários. |
| `src/data/mockData.ts` | Tipos de domínio e dados de demonstração. Os nomes das exportações de dados demo estão em português; os campos dos registros continuam no formato do contrato. |
| `src/services/api.ts` | Cliente REST, serialização JSON, sessão Bearer em memória e tipos de operação. A instância exportada é `clienteApi`. |
| `src/index.css` | Tailwind, fontes, estilos globais e animações. |
| `src/imports/loginImg.svg` | Arte utilizada na tela de login. |
| `public/robots.txt` | Mantém a orientação `noindex, nofollow` na publicação. |
| `docs/` | Contratos e documentação funcional/técnica do frontend. |
| `vite.config.ts` | Configuração Vite independente do Figma Make. |

`main.tsx`, `App.tsx`, folhas de estilo, telas e cliente REST têm ciclos de vida e responsabilidades diferentes; juntá-los reduziria a separação e dificultaria a integração. Não encontrei arquivos de código órfãos para apagar. O plano do projeto e o contrato de API foram preservados em `docs/`.

## Refinamentos de código

- Identificadores de estado, setters, callbacks, parâmetros e dados demo foram traduzidos para português nos módulos de interface. Exports demo agora têm nomes como `CONTAS_DEMONSTRACAO`, `cirurgiasCadastradas`, `kitsPorCirurgia` e `itensDeEstoqueDemonstracao`.
- O helper exportado do cliente REST chama-se `clienteApi`; métodos orientados a operações HTTP, como `list`, `create`, `setStatus` e `currentUser`, mantêm nomes convencionais de serviço. Eles não são enviados ao backend.
- O checklist reutiliza o tipo compartilhado `ReportItem`/`ReportItemStatus` em vez de manter uma cópia local equivalente.
- Duas contagens antigas não usadas foram removidas do painel e o metadado `adminOnly` não usado da lista de navegação foi retirado; a lista administrativa já é exibida sob a condição de papel.
- A referência de índice sem leitura foi removida do temporizador da demonstração. Não foram encontrados outros arquivos de aplicação seguros para excluir ou fundir.
- Os valores de IDs de tela, papéis e status, assim como atributos da API do navegador e eventos JSX, foram preservados por compatibilidade.

## Fluxos implementados

- **Login:** envia credenciais para a API quando `VITE_API_BASE_URL` está configurada; caso contrário, valida as contas de demonstração de `mockData.ts`.
- **Sessão:** tenta restaurar o usuário por `/auth/me`, guarda o usuário no estado React e chama logout na API ao sair. O token opcional retornado pelo login fica apenas em memória.
- **Navegação:** monta as telas principais e restringe visualmente as rotas administrativas por papel. Essa checagem no cliente não substitui autorização no servidor.
- **Painel:** mostra resumo, programação e alertas; consulta `/dashboard` e `/stock` no modo API.
- **Kits:** carrega cirurgias e composição dos kits; mantém os dados demo quando a API não está habilitada.
- **Conferência:** suporta confirmação manual, reconhecimento de fala do navegador e modo demonstração; ao concluir, envia o relatório para `/reports` no modo API.
- **Estoque:** permite consulta e filtros. O gestor administrativo tem inclusão, edição, exclusão e ajuste de quantidade.
- **Relatórios:** lista, filtra e detalha as conferências; no modo API, carrega `/reports`.
- **Perfil:** altera nome/telefone, preferências de notificação e senha conforme os endpoints definidos no contrato.
- **Usuários:** permite criação, edição e ativação/desativação pela API no modo conectado.

Sem a variável `VITE_API_BASE_URL`, os dados e operações de demonstração são locais e não persistem entre sessões. Isso é intencional para desenvolvimento do frontend; não é uma simulação de banco de dados.

Na demonstração, o total de cirurgias do painel é a soma de `scheduledToday` (13), enquanto a programação mostra uma linha representativa para cada um dos seis tipos de cirurgia. Esses dados são ilustrativos; a API de produção deve devolver as ocorrências reais da agenda.

## Integração com Backend

Configure `VITE_API_BASE_URL`, por exemplo `http://localhost:3000/api/v1`. O prefixo `/api/v1` é usado por padrão se a variável não estiver definida, mas a ausência da variável mantém a aplicação no modo demo.

O cliente envia `Content-Type: application/json` para corpos JSON, cookies com `credentials: include` e, se houver `accessToken` no retorno do login, o cabeçalho `Authorization: Bearer ...`. Erros HTTP podem retornar `{ "message": "..." }`. A aplicação não grava token nem senha no armazenamento local do navegador.

Os nomes de campos JSON, tipos compartilhados e valores de enum ficam em inglês porque constituem a fronteira acordada com o backend. Não os traduza isoladamente. Exemplos que devem permanecer idênticos: `email`, `password`, `role`, `status`, `surgeryId`, `confirmedAt`, `available`, `minimum`, `currentPassword`, `newPassword`; papéis `admin`, `nurse`, `technician`; estados de item `pending`, `confirmed`, `missing`; status de estoque `ok`, `low`, `critical`.

O nome da variável de ambiente, rotas, métodos HTTP e nomes dos métodos da fachada REST também são convenções de integração. Para detalhes dos request/response e endpoints, consulte [frontend-api-contract.md](frontend-api-contract.md).

## Convenção de nomes

Estados, setters (`definir...`), parâmetros, funções auxiliares, handlers e nomes de dados de demonstração são em português para facilitar a leitura da equipe. Tipos de domínio e identificadores exportados dos componentes mantêm os nomes existentes para não ampliar a renomeação dos módulos. Campos dos DTOs, nomes de métodos da fachada HTTP, valores de enum e APIs do navegador/React ficam em inglês quando são compartilhados ou seguem uma interface externa.

Exemplos internos: `itensDaConferencia`, `definirConferenciaConcluida`, `navegarParaTela`, `salvarItemDoEstoque`, `textoCorrespondeAoItem`. Exemplo de campo de contrato que não deve ser renomeado: `item.confirmedAt`.

Ao acrescentar uma tela, mantenha estado e callbacks locais em português, mas serialize os dados no formato definido pelo contrato. Evite traduzir nomes em objetos de request/response, IDs de tela (`dashboard`, `voice-checklist`) ou classes CSS de `index.css`.

## Execução e validação

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm exec tsc --noEmit
```

Se o backend rodar em outra origem, ele precisa permitir CORS para a origem do frontend e credenciais/cookies quando forem usados. A equipe do backend deve aplicar autenticação, autorização, validação, auditoria e persistência no servidor; esconder uma rota no frontend não é controle de segurança.

## Itens deliberadamente não consolidados

- `StockInventory` é consulta; `admin/StockManager` altera registros. Compartilham domínio, mas não o mesmo fluxo.
- `Reports`, `Profile`, `UserManager` e `VoiceChecklist` possuem estados e efeitos próprios; reuni-los numa tela/arquivo aumentaria acoplamento.
- `src/index.css` permanece separado dos componentes para manter o pipeline global Tailwind e as animações compartilhadas.
- Componentes com marcação de status parecida têm conteúdo e contexto diferentes; uma abstração comum exigiria parâmetros visuais extras e não traria benefício suficiente para esta rodada sem visual regression tests.

As constantes de alerta não utilizadas no Dashboard foram removidas. Além disso, não foi encontrado outro módulo frontend comprovadamente sem uso que pudesse ser excluído com segurança.
