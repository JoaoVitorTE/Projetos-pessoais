# Arquitetura atual

Monorepo npm: React/TypeScript/Vite no frontend; Express/TypeScript, Zod e Prisma no backend; PostgreSQL local por Docker Compose ou Neon na publicação. O navegador usa `/api` no mesmo domínio (proxy no desenvolvimento, função Node na Vercel). Banco, sessões, autorização e auditoria ficam no servidor. Não há serviço de IA pago obrigatório.

As páginas são carregadas sob demanda, inclusive gráficos Recharts. A interface mantém CSS próprio responsivo, temas claro/escuro e Lucide. Não há necessidade de adicionar Python ou outra infraestrutura para consultas estruturadas e indicadores descritivos.

## Módulos

- `operations`: equipamentos, interrupções, recorrências, OS, planos/calendário, serviços de terceiros e indicadores calculados. Histórico e auditoria na mesma transação. Versões impedem sobrescrita concorrente.
- `imports`: adaptadores independentes de fornecedor, parser CSV/ExcelJS, validação, prévia, confirmação, processamento em trechos e reversão. `ImportSource` guarda layout/base; `ExternalRecord` identifica registros já importados; `ImportBatch` e `ImportChange` mantêm processamento, diferenças e rastreabilidade. Lock transacional serializa aplicação/reversão; cada alteração usa versão esperada.
- `administration`: usuários, perfis, senhas temporárias, técnicos, setores e auditoria filtrada/paginada. Campos públicos de conta não incluem hash. Mudanças de acesso revogam sessões.
- `intelligence`: relatório preventivo JSON/PDF/Excel, fatos de atraso e Assistente PCM de leitura com templates. Não infere causas mecânicas, probabilidades ou economia.

## Autenticação e autorização

Senhas usam bcrypt, sessão opaca em cookie HttpOnly/SameSite Strict (Secure em produção), digest da sessão no banco e verificação de Origin nas mutações. `LoginThrottle` limita tentativas entre instâncias. Primeiro acesso com senha temporária exige troca; troca/redefinição revoga sessões. Usuários inativos e sessões expiradas são recusados.

As permissões são verificadas no backend. Ver [matriz operacional](PHASE2.md) e [matriz de importação/administração](IMPORTS-AND-CONTROL.md). Não existe cadastro público ou envio automático de e-mail. Nenhuma função pode comandar máquinas, enviar alterações ao SAP, aprovar pagamentos ou transmitir dados a um modelo externo.

## Banco e ambientes

Prisma mantém migrations versionadas, relações e índices. `DATA_MODE=demo` permite o seed fictício idempotente; `operational` serve a base limpa e impede seed. Cada origem de importação tem classificação explícita. O seed cria os cenários fictícios somente por execução deliberada e não sobrescreve usuários existentes. Builds e inicialização do servidor nunca executam migrations, seed ou limpeza.

Testes só iniciam com `.env.test`, modo demo e banco cujo nome termina em `_test`. A mesma suíte usa PostgreSQL real isolado. Mudanças de schema são verificadas em branch de validação antes da base publicada. A limpeza de dados exige autorização específica, backup verificado e operação administrativa fora da API; preserva contas/auditoria e não redefine senha.

A API usa Prisma singleton na função Vercel e conexão Neon com pool. A URL direta é reservada às ferramentas de schema. Segredos ficam em `.env` ignorado ou variáveis sensíveis do provedor e nunca usam prefixo `VITE_`. Anexos ainda são referências textuais; armazenamento de arquivos é uma evolução futura.

Limites e fluxos completos em [IMPORTS-AND-CONTROL.md](IMPORTS-AND-CONTROL.md). Monitoramento de ar comprimido na interface, agendamento com disponibilidade/conflitos e sincronização oficial automática permanecem futuros.
