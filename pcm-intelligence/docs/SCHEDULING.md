# Agenda inteligente — versão 0.4

## Primeiro uso

1. Cadastre os técnicos em **Cadastros e acessos**. Para permitir apontamento por um técnico, crie um usuário com perfil Técnico e vínculo ao cadastro correspondente.
2. Abra **Agenda inteligente → Jornadas** e configure as janelas semanais de cada técnico. Não existem horários de trabalho presumidos. Para pausas, crie janelas separadas; para turno noturno, divida na meia-noite entre os dois dias. `24:00` é aceito como término.
3. Registre ausências ou treinamentos em **Indisponibilidades**. Se o período atingir reservas abertas, reprograme ou cancele essas reservas antes de confirmar a ausência.
4. Cadastre ou importe OS/planos. Uma data de programação ou vencimento **não reserva capacidade automaticamente**: a exportação pode não informar duração ou disponibilidade real.
5. Em **Reservar atividade**, escolha o registro, o técnico, início e término, verifique disponibilidade e registre a justificativa. Revise qualificação, disponibilidade atual e dependências de peças/terceiros antes de confirmar.

Todos os horários da agenda usam **America/Sao_Paulo**, inclusive em aparelhos configurados em outro fuso. O calendário tem visões semanal e mensal, filtros e histórico. No celular, a semana fica em uma lista vertical de dias e o mês permite rolagem horizontal dentro do calendário.

## Reservas e conflitos

- Reservas duram de cinco minutos a 24 horas e precisam terminar após o momento da confirmação. Atividades longas podem ser divididas em etapas, com mais de uma reserva para a mesma OS ou vencimento do plano.
- Não é permitida sobreposição de reservas abertas para o mesmo técnico ou equipamento. Intervalos adjacentes são permitidos. O MVP trabalha com um técnico por reserva; equipes trabalhando simultaneamente no mesmo equipamento ainda não são modeladas.
- Jornadas, ausências e todas as reservas do técnico são verificadas, inclusive em outros setores. Filtrar um setor não torna livres os horários reservados em outro.
- Criar, reprogramar, iniciar e cancelar passa por lock transacional e verificação de versão no servidor. Duas confirmações simultâneas não podem reservar o mesmo intervalo. A prévia não é uma garantia permanente: tudo é verificado novamente na confirmação.
- O nome do responsável e a programação principal da OS acompanham a próxima reserva aberta; o vencimento de um plano não muda por ele ter sido reservado em outra data. A agenda mantém separadas a data de vencimento e a janela de execução.
- Alterar equipamento, responsável, data ou ativação de um plano por outro módulo/importação é bloqueado quando afetar reservas ativas. Reprograme ou cancele na agenda primeiro. A prévia de importação mostra esse caso como conflito, mesmo quando uma substituição de edição local foi autorizada.
- Não é possível reduzir uma jornada ou desativar um técnico sem resolver as reservas futuras afetadas. Indisponibilidades e jornadas podem ser desativadas com histórico; não são apagadas pela interface.
- Capacidade é calculada pelas janelas cadastradas menos ausências. Horas livres incluem apenas o tempo ainda disponível a partir da consulta, descontando reservas abertas. São valores de planejamento, não horas de produtividade ou uma medição da presença física.
- OS em execução sem duração reservada geram orientação para confirmar disponibilidade real; o sistema não inventa duração restante. Uma reserva que ultrapassou seu término continua identificada como pendente. Uma atividade ainda em execução impede iniciar outra para o mesmo técnico/equipamento, mesmo se seu término previsto já passou.

## Execução e histórico

Os estados são Programada, Em execução, Bloqueada, Concluída e Cancelada. O início só pode ocorrer durante a janela reservada; se ela ainda não começou ou já terminou, o planejador deve reprogramar. Uma atividade iniciada permite ajustar término e observações, mantendo técnico e início.

**Concluir etapa** registra o apontamento no momento da confirmação. Por padrão, conclui somente a etapa e mantém a manutenção aberta. A opção explícita permite também encerrar a OS ou registrar a execução do plano. Nesse caso, as outras reservas da mesma OS/vencimento são canceladas com histórico, sem serem apresentadas como etapas executadas.

Ao executar o plano, o vencimento original e o técnico efetivo ficam no histórico, e o próximo vencimento avança pela periodicidade até ficar após a execução. Cancelar uma reserva libera o horário e preserva a OS/plano. Registros e movimentos permanecem na auditoria.

Mudanças de status da OS feitas pelo módulo de ordens ou por importação revisada sincronizam a agenda: espera por peça/terceiro bloqueia reservas, e encerramento libera reservas futuras. Um status importado de conclusão sem data real de execução não cria um horário de conclusão fictício. A reversão de um lote não reativa automaticamente reservas canceladas; o responsável precisa revisar a agenda novamente.

## Propostas de prioridade

Em **Pendências e sugestões**, o planejador escolhe período, equipamentos e duração de cada etapa. As propostas usam somente dados locais:

| Fator | Pontos |
|---|---|
| Criticidade cadastrada | Criticidade × 10 |
| Prioridade informada na OS | Prioridade × 10; planos não recebem uma prioridade inventada |
| Atraso | Um por dia completo, limitado a 30 |
| Tempo de parada observado nos últimos 30 dias | Um por hora completa, limitado a 20 |
| Ocorrências com sobreposição nos últimos 30 dias | Um por ocorrência, limitado a 10 |

O tempo de parada une intervalos sobrepostos do mesmo equipamento. Cada proposta mostra seus dados, o período histórico e o motivo. A pontuação é uma regra de ordenação explicável, **não uma probabilidade de falha nem um diagnóstico mecânico**. Não identifica causas desconhecidas nem qualificação técnica a partir do nome da especialidade.

A duração é fornecida pelo usuário, não prevista por um modelo. São sugeridas até dez atividades ainda sem reserva, com janelas livres de jornada, ausência, equipamento e técnico. A simulação considera as demais propostas para não propor o mesmo horário duas vezes. OS aguardando peças/terceiros não recebem horário. Sem janela livre, o sistema informa a limitação.

**Gerar sugestões não grava nada.** Cada proposta precisa de revisão e confirmação individual. Depois de uma confirmação, gere as sugestões novamente: o banco mudou e a disponibilidade precisa ser recalculada. Não há API paga de IA ou alteração automática no SAP.

## Permissões

| Operação | Administrador / Gestor / Planejador | Técnico | Visualizador |
|---|---|---|---|
| Ler calendário, disponibilidade e histórico | Sim | Sim | Sim |
| Configurar jornadas e indisponibilidades | Sim | Não | Não |
| Criar, reprogramar ou cancelar reservas | Sim | Não | Não |
| Gerar e revisar propostas | Sim | Não | Não |
| Iniciar/concluir atividade | Sim | Apenas suas atribuições | Não |

O Assistente PCM consulta as reservas confirmadas de amanhã com horários e técnico. Os alertas também mostram reservas abertas cujo término previsto passou. O dashboard e o fluxo de terceiros mantêm seu funcionamento.

## Limites e validação

- Períodos de até 42 dias para exibir semanas completas do mês; até 500 reservas ou atividades por consulta. Use filtros se exceder.
- A análise de sugestões pede filtro mais restrito se houver mais de 10.000 interrupções no histórico selecionado, em vez de calcular com uma amostra truncada sem avisar.
- Os 106 testes automatizados usam PostgreSQL local isolado. A migration é versionada e verificada primeiro no branch de validação Neon. Não executa seed, limpeza de dados ou redefinição de senha.
- Validação cobre conflitos simultâneos, jornadas noturnas/pausas, permissões, bloqueios por ausência/peça, execução parcial/final, histórico, importação e integração com os módulos anteriores.
- Chromium percorreu o fluxo com gravações apenas na base local fictícia, incluindo confirmação, reprogramação, indisponibilidade, sugestão revisada, execução de OS e telas de 390 × 844. Os registros foram removidos ao final.

A agenda entrega esta etapa do projeto. Análises estatísticas avançadas de interrupções, ar comprimido, relatórios gerenciais adicionais e sincronização SAP/SKA automática continuam para as próximas etapas.
