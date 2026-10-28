# Handoff

## Arquitetura

O TrayCheck é uma aplicação React de página única, construída com TypeScript, Vite e Tailwind CSS. A pasta `src/` do repositório é a raiz da aplicação; nela, `frontend/main.tsx` monta a aplicação. `frontend/App.tsx` mantém a sessão do usuário em memória, a navegação e a composição das telas em `frontend/components/`. Os tipos de domínio e dados de demonstração ficam em `frontend/data/mockData.ts`; `frontend/services/api.ts` é o cliente REST. Os estilos globais ficam em `frontend/index.css`.

## Decisões importantes

- O projeto contém apenas o frontend. Não implementa servidor, banco de dados ou autenticação de produção.
- Sem `VITE_API_BASE_URL`, as telas usam dados de demonstração e as alterações não persistem entre sessões. Configurá-la habilita chamadas conforme o contrato em `docs/frontend-api-contract.md`.
- O cliente da API envia credenciais do navegador e mantém um token bearer opcional em memória. Não persiste o token no armazenamento local.
- As restrições de navegação administrativa são apenas comportamento de interface. O backend deve aplicar autorização independentemente.
- `package.json` e `pnpm-lock.yaml` ficam na pasta `src/` do repositório. O manifesto fixa `pnpm@10.34.3` por Corepack e requer Node.js 22.12 ou superior.
- `public/robots.txt` e os metadados da página desencorajam indexação; confirme os requisitos de implantação antes de alterá-los.

## Serviços externos e acessos

- A operação conectada requer um backend que implemente os endpoints de `docs/frontend-api-contract.md`. Configure a URL base por `VITE_API_BASE_URL` em um arquivo de ambiente local.
- O backend deve configurar CORS para a origem do frontend e permitir credenciais/cookies quando necessários. A equipe responsável pelo backend administra URLs, contas e autorização; credenciais não devem ser incluídas neste repositório.
- A entrada por voz depende do suporte e das permissões da Web Speech API no navegador. Disponibilidade e comportamento variam entre navegadores.
- Este handoff não contém credenciais de APIs externas nem URL de produção.

## Limitações e pontos de atenção

- Não há framework, diretório ou script `test` para testes automatizados neste momento. Build e verificação TypeScript estão disponíveis; novos testes devem ser adicionados em mudança separada e revisada.
- Os dados de demonstração são ilustrativos e ficam no frontend. Não são fonte de verdade adequada para dados clínicos ou de estoque reais.
- Verificação de rota ou papel no frontend não é uma fronteira de segurança. Autenticação, autorização, validação e persistência devem ser aplicadas no backend.
- O comportamento de demonstração e a integração com backend estão descritos em `docs/guia-do-frontend.md`; mantenha o contrato da API sincronizado com mudanças no backend.

## Pendências

- Confirmar com a equipe que receberá o projeto quem mantém o backend, a URL de implantação, a política CORS e o provisionamento de acessos.
- Decidir se serão necessários testes unitários/de componentes e workflow de CI; nenhum dos dois está configurado neste repositório.
- Revisar os requisitos de suporte a navegadores para entrada por voz antes de definir os navegadores de produção.
- Não foram identificados marcadores TODO/FIXME nem logs de depuração no código TypeScript durante esta revisão de handoff.

## Comandos úteis

Na raiz do repositório, instale dependências e inicie a aplicação com:

```sh
corepack pnpm@10.34.3 --dir src install --frozen-lockfile
corepack pnpm@10.34.3 --dir src dev
```

O Vite fica disponível em `http://localhost:8443/`. Para validar o projeto, execute `corepack pnpm@10.34.3 --dir src build` e `corepack pnpm@10.34.3 --dir src exec tsc --noEmit`. `corepack pnpm@10.34.3 --dir src preview` serve o build de produção após a compilação. Não existe o comando `test`.