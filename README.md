# TrayCheck

O TrayCheck é um sistema para conferência de kits cirúrgicos, controle de estoque e registro de divergências. O repositório tem três partes: o frontend React na pasta `src/` (com o manifesto de dependências e o lockfile), a API REST em `backend/` (Node.js, Express e TypeScript; veja [backend/README.md](backend/README.md)) e o banco MySQL em `db/` (veja [db/README.md](db/README.md)).

Primeira instalação no Windows (banco, API e primeiro administrador): siga o passo a passo de [backend/INSTALACAO_WINDOWS.md](backend/INSTALACAO_WINDOWS.md).

## Requisitos

- Node.js 22.22.2 ou superior (24.15+ e 26+ também são compatíveis).
- Corepack, incluído nas distribuições oficiais do Node.js, para disponibilizar a versão de pnpm fixada pelo projeto.
- Navegador moderno. A conferência por voz depende do suporte à Web Speech API.

## Executar localmente

Na raiz deste repositório, instale as dependências e inicie o frontend:

```powershell
corepack pnpm@10.34.3 --dir src install --frozen-lockfile
corepack pnpm@10.34.3 --dir src dev
```

Abra `http://localhost:8443/`. No PowerShell, também é possível entrar na pasta da aplicação primeiro:

```powershell
Set-Location src
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

O projeto inicia em modo de demonstração por padrão. As alterações ficam apenas em memória e não persistem após recarregar a página.

## Validar

```powershell
corepack pnpm@10.34.3 --dir src build
corepack pnpm@10.34.3 --dir src exec tsc --noEmit
```

Para visualizar o bundle de produção localmente, execute `corepack pnpm@10.34.3 --dir src preview` após o build. A porta padrão do Vite é `8443` e pode ser alterada pela variável `PORT`.

## Integração com backend

Para habilitar as chamadas à API, crie `src/.env.local` com `VITE_API_BASE_URL` apontando para a URL base do backend, por exemplo `http://localhost:3000/api/v1`. O exemplo está em [src/.env.example](src/.env.example); use-o somente quando houver um backend disponível. O backend deste repositório (`backend/`) implementa o contrato oficial [docs/api/openapi.yaml](docs/api/openapi.yaml) (versão 1.2.0). O frontend ainda segue partes do contrato antigo ([src/docs/frontend-api-contract.md](src/docs/frontend-api-contract.md)); os ajustes necessários estão em [docs/api/GUIA_FRONTEND.md](docs/api/GUIA_FRONTEND.md).

Consulte [src/README.md](src/README.md) para detalhes do frontend e [src/HANDOFF.md](src/HANDOFF.md) para o handoff técnico.
