# Contrato de API do frontend

O frontend espera uma API REST JSON versionada em `/api/v1`. Configure `VITE_API_BASE_URL` conforme `.env.example` para ativar a integração; sem essa variável, a aplicação permanece no modo de demonstração. Requisições incluem cookies (`credentials: include`) e, se o login devolver `accessToken`, também enviam `Authorization: Bearer` enquanto a aplicação estiver aberta. A resposta de erro pode conter `{ "message": "..." }`.

## Endpoints

| Método | Caminho | Contrato esperado |
| --- | --- | --- |
| `POST` | `/auth/login` | Entrada `{ email, password }`; saída `{ user: AuthUser, accessToken? }` |
| `POST` | `/auth/logout` | Encerra a sessão; sem corpo de resposta |
| `GET` | `/auth/me` | Retorna `AuthUser` da sessão atual |
| `GET` | `/dashboard` | Retorna `DashboardSummary`, incluindo a programação do dia e tendência opcional de cirurgias |
| `GET` | `/surgeries` | Lista `SurgeryType[]` |
| `GET` | `/surgeries/{id}/kit` | Lista `EquipmentItem[]` do kit |
| `GET` | `/stock` | Lista `StockItem[]` |
| `POST` | `/stock` | Cria item com `StockInput`; retorna `StockItem` persistido |
| `PUT` | `/stock/{id}` | Atualiza item com `StockInput`; retorna `StockItem` persistido |
| `DELETE` | `/stock/{id}` | Exclui item; retorna `204 No Content` |
| `POST` | `/stock/{id}/adjustments` | Entrada `{ delta }`; retorna o estoque atualizado |
| `GET` | `/reports` | Lista `ChecklistReport[]` |
| `POST` | `/reports` | Persiste relatório sem `id`; retorna o relatório criado |
| `GET` | `/users` | Lista `AppUser[]` |
| `POST` | `/users` | Cria usuário com `UserInput`; retorna `AppUser` |
| `PUT` | `/users/{id}` | Atualiza usuário com `UserInput`; retorna `AppUser` |
| `PATCH` | `/users/{id}/status` | Entrada `{ status: "active" | "inactive" }`; retorna `AppUser` |
| `GET` | `/profile` | Retorna `AuthUser` |
| `PATCH` | `/profile` | Atualiza `{ name, phone }`; retorna `AuthUser` atualizado |
| `GET` | `/profile/notifications` | Retorna as preferências de notificação do usuário atual |
| `PUT` | `/profile/notifications` | Salva preferências de notificação; retorna as preferências persistidas |
| `PUT` | `/profile/password` | Entrada `{ currentPassword, newPassword }`; sem corpo de resposta |

## Tipos compartilhados

Os DTOs e tipos de domínio estão definidos em `src/data/mockData.ts`; tipos específicos das operações ficam em `src/services/api.ts`. IDs são strings. Datas exibidas pela interface usam `dd/MM/yyyy`; timestamps de itens usam o formato `HH:mm:ss`. A API deve validar autorização por papel no servidor, independentemente das restrições de navegação do cliente.

O frontend não deve enviar nem persistir hashes de senha. Credenciais são enviadas somente ao endpoint de login e a senha atual/nova somente ao endpoint de troca de senha. O backend é responsável por autenticação, autorização, validação, auditoria, transações e persistência.