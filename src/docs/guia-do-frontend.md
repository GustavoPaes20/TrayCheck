# Guia do Frontend TrayCheck

## Escopo e estrutura

O repositório contém a aplicação frontend React/TypeScript do TrayCheck; não contém backend, banco de dados ou autenticação de produção. A pasta `src/` do repositório é a raiz da aplicação:

| Caminho (relativo a `src/`) | Responsabilidade |
| --- | --- |
| `index.html` | Entrada HTML do Vite. |
| `frontend/main.tsx` | Monta o React e importa os estilos globais. |
| `frontend/App.tsx` | Sessão em memória, navegação e composição das telas. |
| `frontend/components/` | Telas de login, painel, kits, conferência, estoque, relatórios, perfil e administração. |
| `frontend/data/mockData.ts` | Tipos de domínio e dados ilustrativos de demonstração. |
| `frontend/services/api.ts` | Cliente REST e tipos das operações da API. |
| `frontend/index.css` | Tailwind CSS, fontes, estilos globais e animações. |
| `docs/` | Guia funcional e contrato da API. |
| `public/` | Arquivos estáticos copiados para o build. |

## Executar localmente

Requer Node.js 22.12 ou superior. A versão de pnpm está fixada no `package.json` e pode ser executada com Corepack.

Na raiz do repositório:

```powershell
corepack pnpm@10.34.3 --dir src install --frozen-lockfile
corepack pnpm@10.34.3 --dir src dev
```

Ou, estando na pasta `src/`:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Abra `http://localhost:8443/`. Para compilar e validar os tipos TypeScript:

```powershell
corepack pnpm@10.34.3 --dir src build
corepack pnpm@10.34.3 --dir src exec tsc --noEmit
```

O modo padrão é demonstração: usa dados locais em memória e não persiste alterações entre sessões. Não há script `test` configurado.

## Integração com backend

Para habilitar as chamadas à API, crie `src/.env.local` na raiz do repositório (ou `.env.local` na pasta `src/`) e defina:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

O [contrato da API](frontend-api-contract.md) descreve rotas, métodos e formatos de request/response. O backend precisa implementar esse contrato, permitir a origem do frontend via CORS e configurar cookies quando forem usados. A autenticação, autorização, validação e persistência devem ser aplicadas no backend; controles de navegação no frontend não substituem autorização.

O frontend envia credenciais apenas ao login e senhas apenas à operação de troca de senha. Um eventual token de acesso fica em memória, sem ser gravado no armazenamento local do navegador.

Sem `VITE_API_BASE_URL`, o frontend não chama o backend. Os dados de demonstração são apenas ilustrativos e não devem ser usados como fonte de verdade para estoque ou dados clínicos.

Consulte [README.md](../README.md) para os comandos de desenvolvimento e [HANDOFF.md](../HANDOFF.md) para a visão técnica do projeto.
