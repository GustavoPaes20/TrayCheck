# ADR 0001 — Sessões em tabela, com o token guardado só como hash SHA-256

- **Status:** Aceita (18/11/2026)
- **Requisitos:** RF02, RNF01, RN05
- **Origem:** PRs #14 (login) e #15 (gestão de usuários); migração `V006__sessao.sql`

## Contexto

A ERS (RF02) exige que:

1. a sessão **expire após 8 horas sem atividade**;
2. ao **inativar** um usuário, todas as sessões dele sejam **invalidadas imediatamente**;
3. a senha seja guardada só como hash bcrypt, e nenhum dado pessoal ou token apareça em logs (RNF01).

O banco das migrações V001–V005 não tinha onde guardar sessões. O contrato (`openapi.yaml`) aceita um token `Bearer` ou o cookie `traycheck_session`.

## Decisão

Criar a tabela **`sessao`** (migração V006) e usar **tokens opacos**:

- O token é aleatório, com 256 bits (`crypto.randomBytes(32)`, em base64url). **Só o hash SHA-256 dele é gravado** (`token_hash`, único). Quem lê o banco não consegue usar uma sessão aberta.
- Cada requisição autenticada consulta `sessao` juntando `usuario` e `perfil`, e só aceita sessão **não revogada**, de usuário **ativo** e com `ultimo_uso_em` dentro do limite de ociosidade (`SESSAO_OCIOSA_HORAS`, padrão 8). Cada uso renova `ultimo_uso_em`, gravando no máximo **uma vez por minuto**.
- **Logout** revoga a sessão em uso (`revogada_em`). **Trocar a própria senha** revoga as *outras* sessões. **Inativar** o usuário ou **redefinir** a senha dele revoga **todas**, na mesma transação da alteração. Isso impede que reativar o usuário faça sessões antigas voltarem a valer.
- O token é aceito por `Authorization: Bearer` **ou** pelo cookie `HttpOnly; SameSite=Strict`. O cookie mantém a sessão após recarregar a página, pois o frontend guarda o token só em memória.
- O perfil vem da consulta a cada requisição: mudar o perfil de um usuário vale na hora, sem reemitir token.
- Todas as contas de tempo usam o relógio do banco (`NOW()`), para não misturar fusos.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
| --- | --- |
| **JWT sem estado** | Não permite encerrar a sessão no logout nem derrubar usuário inativado antes do vencimento; a expiração por **inatividade** exigiria reemitir token a cada uso |
| **Token assinado + `usuario.ultimo_acesso_em`** (sem nova tabela) | A atividade seria por usuário, não por sessão; o logout não revogaria o token. Cumpriria a ERS só em parte |
| **Sessões em memória do servidor** | Somem ao reiniciar e não funcionam com mais de uma instância (RNF05) |
| **Guardar o token em texto** | Um vazamento do banco daria acesso a todas as sessões abertas (RNF01) |

## Consequências

- **Positivas:** cumpre os três critérios de RF02; revogação imediata; vazamento do banco não expõe sessões; permissões sempre atuais.
- **Custo:** uma consulta ao banco por requisição autenticada (e, no máximo, uma gravação por minuto por sessão).
- A tabela cresce: ao fazer login, o sistema apaga as sessões **já encerradas ou expiradas daquele usuário**.
- O `bearerFormat: JWT` do `openapi.yaml` é apenas informativo; o token é opaco.
- **Não há limite de tentativas de login.** Nem a ERS nem o contrato pedem (o contrato não prevê o status 429); fica como melhoria futura.
- Mudança no contrato e no banco: registrada na RFC-02 (V006).
