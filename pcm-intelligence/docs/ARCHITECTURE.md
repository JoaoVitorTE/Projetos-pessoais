# Arquitetura e evolução

Monorepo npm com dois processos. O navegador acessa /api através do proxy Vite; Express é a única camada que acessa o PostgreSQL. Prisma fornece tipos e migrations. PostgreSQL roda em volume persistente no Compose. A API escuta somente em loopback. Não existe serviço externo obrigatório.

A Fase 1 usa CSS próprio e Lucide: Tailwind, shadcn e Recharts serão avaliados quando houver telas operacionais e gráficos. Não há necessidade de Python antes da implementação de análises estatísticas. O assistente futuro consultará dados locais via serviços, sem LLM obrigatório.

Modelo: Role/User/Session, Sector/Equipment, Technician, Interruption, MaintenanceOrder/TechnicianAssignment, MaintenancePlan/MaintenanceExecution, ThirdPartyService/Document/Movement, DocumentRequirement, CompressedAirReading/LeakInspection, Alert, ImportBatch e AuditLog. Índices cobrem datas, equipamento, status e alocações. Requisitos documentais começam vazios: não se presumem obrigações. Tipos e status operacionais ainda são strings; enums e validações de transição serão adicionados com seus fluxos na Fase 2.

## Permissões vigentes

| Recurso | Administrador | Gestor | Planejador | Técnico | Visualizador |
|---|---|---|---|---|---|
| Sessão própria e contagens fictícias | Sim | Sim | Sim | Sim | Sim |
| Lista de usuários (sem hashes) | Sim | Não | Não | Não | Não |
| Últimos 50 eventos de auditoria | Sim | Sim | Não | Não | Não |

Nenhum perfil pode alterar programação, aprovar pagamentos ou enviar comandos a máquinas nesta versão. Login, falha de login e logout são auditados. Logs não registram senhas/cookies; dados de demonstração são explícitos. Cookie SameSite Strict e verificação de Origin protegem mutações do navegador. Sessão expirada ou usuário desativado são rejeitados. HTTPS é necessário para cookies Secure em NODE_ENV=production.

Seed: 30 equipamentos/5 setores/12 técnicos, 200 interrupções, 100 OS, 40 planos preventivos + 30 lubrificações, 25 terceiros e 336 leituras. Datas relativas à primeira execução. EQ-014 tem maior recorrência recente fictícia. Reexecução não atualiza datas existentes. A inicialização é transacional; usuários não são sobrescritos. Não misturar com ambiente real; utilizar outro banco e futura política de ingestão.

## Sequência de entrega

1. Validar infraestrutura, migrations, seed, build, autenticação, RBAC e auditoria.
2. Equipamentos e interrupções; OS com regras de estado; preventivas e calendário; terceiros com requisitos configuráveis, transições e histórico; dashboard com fórmulas documentadas.
3. Recorrência e alertas com amostra mínima; assistente estruturado e relatórios.
4. CSV/XLSX com prévia, mapeamento, erros e reversão; adaptadores SKA/SAP independentes de formato presumido; ar comprimido simulado.
5. Ampliar testes, demonstrar cenários, revisar segurança e documentação.

Limites atuais: sem gestão de usuários/senhas pela interface, MFA, renovação/limpeza de sessões, paginação da auditoria, backup automático ou implantação industrial. Não é uma certificação para produção. Não avançar para Fase 2 enquanto a validação da Fase 1 estiver pendente.

## Atualização da publicação

A API também roda como função Node na Vercel, em `api/[...path].ts`, compartilhando domínio com a SPA. Prisma usa singleton por processo e pool Neon. Sessões e `LoginThrottle` são persistidos no PostgreSQL. `User.mustChangePassword` bloqueia rotas de dados até a troca da senha temporária. A rota de troca verifica a senha atual, valida limites do bcrypt, faz atualização condicional contra concorrência, invalida sessões e audita. A interface possui o fluxo obrigatório e a opção Minha senha. A senha inicial do administrador fica somente no processo de seed; os outros perfis recebem senhas aleatórias independentes. Não há recuperação de senha ou gestão de usuários ainda.

Os dados fictícios agora são produzidos por `backend/prisma/demo-data.ts`, compartilhado com o seed. O seed usa inserções em lote e preserva registros existentes. Testes exigem arquivo `.env.test` e nome de banco terminado em `_test` para impedir uso acidental do banco publicado.
