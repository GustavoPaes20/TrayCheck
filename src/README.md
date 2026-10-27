# TrayCheck

O TrayCheck é um frontend React para conferência de kits cirúrgicos e fluxos relacionados ao centro cirúrgico. Inclui telas de kits, conferência assistida por voz, estoque, relatórios, perfil e administração. O projeto contém apenas o frontend; não fornece backend, banco de dados ou autenticação de produção.

## Requisitos

- Node.js 22, conforme declarado em `.mise.toml`.
- pnpm 10.34.3, conforme declarado em `.mise.toml`.
- Navegador moderno. A entrada por voz depende do suporte do navegador à Web Speech API.

Instale as versões de Node.js e pnpm declaradas usando o gerenciador de versões adotado pela equipe. Depois, instale as dependências travadas no lockfile:

```sh
pnpm install --frozen-lockfile
```

## Configuração

O modo de demonstração local não exige variáveis de ambiente. Sem `VITE_API_BASE_URL`, a aplicação usa dados de demonstração em memória; as alterações não persistem entre sessões.

Para conectar a um backend, crie um arquivo local a partir do exemplo e configure a URL:

```sh
cp .env.example .env.local
```

Defina `VITE_API_BASE_URL` em `.env.local`, por exemplo `http://localhost:3000/api/v1`. Não coloque credenciais reais ou segredos neste repositório frontend. O backend deve permitir requisições da origem do frontend e configurar CORS e cookies conforme necessário. Consulte [docs/frontend-api-contract.md](docs/frontend-api-contract.md) para os endpoints e payloads esperados.

## Executar e validar

Inicie o servidor de desenvolvimento:

```sh
pnpm dev
```

Abra `http://localhost:8443/`. A porta pode ser alterada pela variável de ambiente `PORT`.

Gere o bundle de produção e verifique o TypeScript:

```sh
pnpm build
pnpm exec tsc --noEmit
```

Para servir o bundle compilado localmente, execute `pnpm preview` depois de `pnpm build`; por padrão, ele usa a porta `8443`.

Atualmente não há suíte de testes automatizados nem script `test` em `package.json`.

## Estrutura do projeto

```text
src/
  components/       Telas da aplicação e interface compartilhada
    admin/           Administração de estoque e usuários
  data/              Tipos de domínio e dados de demonstração
  imports/           Recursos estáticos usados pela interface
  services/          Cliente da API REST
  App.tsx            Sessão, navegação e composição das telas
  index.css          Estilos globais e entrada do Tailwind
  main.tsx           Ponto de entrada do React
docs/                 Guia do frontend e contrato da API
public/               Arquivos estáticos copiados para o build
```

A configuração do Vite e do TypeScript fica na raiz. Consulte [HANDOFF.md](HANDOFF.md) para arquitetura e transferência; o comportamento detalhado do frontend está em [docs/guia-do-frontend.md](docs/guia-do-frontend.md).