# Instalação no Windows (PowerShell + MySQL no Docker)

Guia para quem vai instalar o TrayCheck pela primeira vez num computador com Windows. Ao final, o banco estará
criado, a API estará no ar e existirá o **primeiro administrador**, que cadastra os demais usuários (RF01, ERS 2.5).

Rode **um comando por vez** no PowerShell. Onde aparecer `SUA_SENHA`, use a senha que você escolher para o MySQL;
ela precisa ser a mesma em todos os passos.

## 1. O que precisa estar instalado

| Programa | Para quê | Onde baixar |
| --- | --- | --- |
| Git | Baixar o projeto | https://git-scm.com/download/win |
| Node.js 22 ou superior | Rodar a API | https://nodejs.org (versão LTS) |
| Docker Desktop | Rodar o MySQL 8 sem instalá-lo no Windows | https://www.docker.com/products/docker-desktop |

Confira se estão instalados (cada um deve mostrar uma versão):

```powershell
git --version
```
```powershell
node --version
```
```powershell
docker --version
```

## 2. Baixar o projeto

Escolha a pasta onde o projeto vai ficar (o exemplo usa a sua pasta de usuário):

```powershell
cd $HOME
```
```powershell
git clone https://github.com/GustavoPaes20/TrayCheck.git
```
```powershell
cd TrayCheck
```

Todos os passos seguintes partem da pasta `TrayCheck`.

## 3. Ligar o MySQL no Docker

Abra o **Docker Desktop** pelo menu Iniciar e espere aparecer **Engine running** no canto inferior esquerdo.

**Primeira vez** — cria o contêiner `traycheck-mysql`, com o MySQL na porta **3307** do computador:

```powershell
docker run -d --name traycheck-mysql -e MYSQL_ROOT_PASSWORD=SUA_SENHA -p 3307:3306 mysql:8.0
```

**Nas próximas vezes** o contêiner já existe; basta ligá-lo:

```powershell
docker start traycheck-mysql
```

Espere o MySQL terminar de subir (uns 30 segundos na primeira vez). Este comando deve responder `mysqld is alive`;
se der erro, espere mais um pouco e repita:

```powershell
docker exec -e MYSQL_PWD=SUA_SENHA traycheck-mysql mysqladmin ping -uroot
```

Esqueceu a senha? Ela aparece na linha `MYSQL_ROOT_PASSWORD=` deste comando:

```powershell
docker inspect traycheck-mysql --format "{{range .Config.Env}}{{println .}}{{end}}"
```

## 4. Criar as tabelas do banco

Copie a pasta `db` para dentro do contêiner (o primeiro comando apaga uma cópia antiga, se houver):

```powershell
docker exec traycheck-mysql rm -rf /tmp/db
```
```powershell
docker cp db traycheck-mysql:/tmp/db
```

Agora escolha **um** dos dois:

**a) Instalação real** (banco vazio, sem usuários — o primeiro administrador é criado no passo 6):

```powershell
docker exec -e DB_NAME=traycheck -e MYSQL_PWD=SUA_SENHA traycheck-mysql bash -c "sed -i 's/\r$//' /tmp/db/aplicar.sh && bash /tmp/db/aplicar.sh"
```

**b) Demonstração** (com usuários e dados de exemplo; o administrador já vem pronto: `admin@hospitalcentral.br`,
senha `admin123`; **pule o passo 6**):

```powershell
docker exec -e DB_NAME=traycheck -e MYSQL_PWD=SUA_SENHA traycheck-mysql bash -c "sed -i 's/\r$//' /tmp/db/aplicar.sh && bash /tmp/db/aplicar.sh --seed"
```

O resultado deve listar as migrações (`+ V001__...` até `+ V007__...`) e terminar com `Concluído.`. Rodar de novo não
causa problema: as migrações já aplicadas aparecem como `= (já aplicada)`.

> O `sed` só garante que o script esteja com quebras de linha do Linux, caso o Git do Windows as tenha convertido.

## 5. Configurar e instalar a API

```powershell
cd backend
```
```powershell
Copy-Item .env.example .env
```
```powershell
notepad .env
```

No Bloco de Notas, deixe as linhas do banco assim e salve:

```
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=SUA_SENHA
DB_NAME=traycheck
```

Instale as dependências (só na primeira vez e quando o projeto for atualizado):

```powershell
npm install
```

## 6. Criar o primeiro administrador

Use o nome e o e-mail de quem vai administrar o sistema. O e-mail é o login.

```powershell
npm run criar-admin -- --nome "Nome Completo do Administrador" --email admin@seuhospital.br
```

- O script pede a senha duas vezes. Cada caractere aparece como `*`. Mínimo de 8 caracteres.
- No final deve aparecer `Administrador criado no banco traycheck`.
- Se preferir que o sistema sorteie a senha, acrescente `--gerar-senha` ao comando. A senha aparece **uma única
  vez**: anote-a na hora.
- Se o banco já tiver um administrador, o script responde `Nada a fazer` e não pede senha. Isso é proposital: ele só
  serve para o primeiro acesso.

## 7. Ligar a API e testar o login

```powershell
npm run dev
```

Deve aparecer `[api] TrayCheck ouvindo em http://localhost:3000/api/v1`. Deixe esta janela aberta e, em **outra**
janela do PowerShell, teste o login com o e-mail e a senha do passo 6:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/auth/login -ContentType "application/json" -Body '{"email":"admin@seuhospital.br","password":"SUA_SENHA_DO_ADMINISTRADOR"}'
```

A resposta mostra o usuário com `role` igual a `admin` e um `accessToken`: a instalação está pronta.

Para desligar: `Ctrl+C` na janela da API e, se quiser, `docker stop traycheck-mysql`.

## 8. Próximos passos

- **Cadastrar os demais usuários** (enfermeiros(as), circulantes e outros administradores): pelo administrador, na tela
  de usuários do sistema ou pela rota `POST /users` (ver "Gestão de usuários (RF01)" no [README do backend](README.md)).
- **Usar pelo navegador**: o frontend fica em `src/`; veja "Conectar o frontend" no [README do backend](README.md).

## Problemas comuns

| Mensagem | Causa | O que fazer |
| --- | --- | --- |
| `failed to connect to the docker API` | Docker Desktop fechado | Abra o Docker Desktop e espere `Engine running` |
| `No such container: traycheck-mysql` | Contêiner ainda não criado | Rode o `docker run` do passo 3 |
| `port is already allocated` (3307) | Outro programa usa a porta | Troque `-p 3307:3306` por `-p 3308:3306` no `docker run` e use `DB_PORT=3308` no `.env` |
| `Access denied for user 'root'` | Senha do `.env` diferente da do contêiner | Confira a senha com o `docker inspect` do passo 3 |
| `Unknown database 'traycheck'` | Tabelas não criadas | Rode o passo 4 |
| `$'\r': command not found` | Script com quebras de linha do Windows | Use o comando do passo 4 com o `sed` |
| `EADDRINUSE ... 3000` | Outro programa usa a porta 3000 | Feche o outro programa ou mude `PORT=3001` no `.env` |
| `Nada a fazer: o banco ... já tem administrador` | Já existe administrador | Entre com ele; os novos usuários são cadastrados pelo sistema |
