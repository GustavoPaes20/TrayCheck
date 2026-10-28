# TrayCheck — frontend

Esta pasta é a raiz da aplicação frontend. O TrayCheck usa React, TypeScript, Vite e Tailwind CSS; o repositório não contém backend, banco de dados ou autenticação de produção.

## Requisitos

- Node.js 22.12 ou superior.
- Corepack para executar a versão de pnpm fixada em `package.json` (`pnpm@10.34.3`).
- Navegador moderno. A entrada por voz depende do suporte à Web Speech API.

## Instalação e execução

Na raiz do repositório, execute:

```powershell
corepack pnpm@10.34.3 --dir src install --frozen-lockfile
corepack pnpm@10.34.3 --dir src dev
```

Ou, estando nesta pasta:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Abra `http://localhost:8443/`. Sem `VITE_API_BASE_URL`, a aplicação usa dados de demonstração em memória; alterações não persistem entre sessões.

## Configuração da API

Para conectar a um backend, crie `src/.env.local` na raiz do repositório (ou `.env.local` nesta pasta) com:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

O arquivo `.env.example` contém esse exemplo. O backend precisa implementar o [contrato da API](docs/frontend-api-contract.md), permitir a origem do frontend via CORS e configurar cookies quando forem usados. Não inclua credenciais ou segredos neste repositório.

## Build e verificação de tipos

```powershell
corepack pnpm build
corepack pnpm exec tsc --noEmit
```

Para servir o build localmente, execute `corepack pnpm preview` após o build. A porta padrão do Vite é `8443` e pode ser alterada pela variável `PORT`. Não há script `test` nem suíte de testes automatizados configurados.

## Estrutura

```text
src/
  frontend/
    components/       Telas e componentes da interface
      admin/          Administração de estoque e usuários
    data/             Tipos de domínio e dados de demonstração
    services/         Cliente REST
    App.tsx           Sessão, navegação e composição das telas
    index.css         Estilos globais e entrada do Tailwind
    main.tsx          Ponto de entrada do React
  docs/               Guia do frontend e contrato da API
  public/             Arquivos estáticos copiados para o build
  index.html          HTML de entrada do Vite
  vite.config.ts      Configuração do servidor e build
  tsconfig.json       Verificação TypeScript
```

Consulte [HANDOFF.md](HANDOFF.md) para arquitetura e transferência, e [docs/guia-do-frontend.md](docs/guia-do-frontend.md) para o comportamento das telas.
