# Equipamentos e tarefas de planos — v0.6

## TAG e número do equipamento

TAG é obrigatória nos novos cadastros e ao salvar uma edição. A mesma TAG pode existir em setores diferentes; dentro do setor, ela é única. O número do equipamento é opcional, tratado como texto para preservar zeros e reservado a um único cadastro quando informado. O identificador interno permanece estável quando a TAG, o setor ou o número mudam.

Os cadastros anteriores à separação desses campos mantêm seus identificadores e vínculos. A migration não presume que um código antigo seja uma TAG ou um número SAP: os novos campos começam sem preenchimento nesses registros. A tela destaca TAGs pendentes. Corrija em Editar ou reenvie a planilha na mesma origem: mapeie TAG na identificação, número no campo opcional e mantenha a chave externa usada anteriormente. Assim o vínculo existente atualiza o mesmo cadastro, sem recriar as ordens ou planos.

Sem chave externa mapeada ou quando ela estiver vazia, a importação de equipamentos usa TAG + setor. Se escolher uma chave externa própria, mantenha-a estável; quando usar TAG nessa chave e ela repetir entre setores, utilize também Setor como segunda parte da chave. Colunas opcionais vazias não apagam valores existentes durante a importação. O formulário permite limpar um número informado incorretamente.

Importações de atividades resolvem o equipamento pela TAG, número ou referência anterior. Uma TAG ambígua exige setor mapeado ou setor padrão. Cadastros excluídos precisam ser restaurados antes de receber novas atividades.

## Excluir, restaurar e auditar

Equipamentos → Excluir, ou selecione linhas e use Excluir selecionados. A seleção pode reunir páginas diferentes, até 500 registros por operação. Informe um motivo, digite EXCLUIR e confira antes de confirmar.

A exclusão é reversível: mantém o registro, os históricos e as referências; retira o equipamento dos seletores e dos indicadores ativos. A aba Excluídos permite restaurar com motivo. Histórico apresenta data, autor e motivo. TAGs e números continuam reservados nos excluídos para evitar outra identidade com o mesmo histórico.

Administrador, gestor e planejador podem excluir/restaurar. Técnico e visualizador podem consultar. A API verifica sessão, perfil, versão do registro e origem, independentemente da interface. Excluir um equipamento com OS aberta, plano ativo, interrupção aberta ou reserva aberta é bloqueado. A operação em lote é atômica: um conflito impede todas as exclusões daquele pedido. Nenhum registro de produção é excluído pela instalação desta atualização.

## Planos, preventivas, lubrificação e tarefas no mesmo arquivo

É possível importar os três conteúdos no mesmo CSV ou na mesma aba XLSX. A disponibilidade de exportação conjunta no SAP depende dos relatórios habilitados e das permissões da unidade; nenhum layout, transação específica ou integração oficial é presumido.

Selecione uma origem do tipo Planos preventivos / lubrificação e baixe o exemplo CSV/XLSX disponível na própria tela. O exemplo contém dois planos de tipos diferentes e três linhas de operações.

Mapeie número do plano, equipamento, setor quando necessário, tipo, periodicidade em dias, vencimento e técnico. Na coluna Tipo, mapeie os valores autorizados para PREVENTIVE (preventiva) e LUBRICATION (lubrificação). Não use um tipo padrão único quando o arquivo tiver os dois tipos.

Para importar a lista de tarefas junto:

1. Use uma linha por operação, repetindo os dados do plano.
2. Mapeie Código da tarefa / operação e Descrição da tarefa / operação. Os dois são necessários quando houver tarefa.
3. Opcionalmente mapeie Referência da lista de tarefas e Minutos estimados. Converta unidades de duração antes de importar; o campo representa minutos inteiros.
4. Se um plano SAP tiver vários itens diferentes, use Plano + Item na chave composta.
5. Revise a prévia: os planos aparecem como novos/atualizados e as demais linhas de operações como Tarefa agrupada no plano.

Dados de plano divergentes ou códigos de operação com conteúdos diferentes geram erro; não há escolha arbitrária de um deles. Uma operação inválida bloqueia a lista inteira daquele plano, mesmo ao autorizar somente linhas válidas de outros planos. A prévia armazena cada lista consolidada uma única vez para manter o tamanho limitado em arquivos com muitas operações. As tarefas são ordenadas por código, e a reimportação do mesmo conjunto não duplica nem incrementa versões sem alteração.

Quando tarefas são mapeadas e preenchidas, o conjunto do arquivo substitui a lista daquele plano após a revisão e confirmação. Arquivos sem tarefas preservam a lista já cadastrada. As diferenças aparecem legíveis na prévia; a reversão usa os registros antes/depois e é bloqueada se houver alterações posteriores. Listas independentes sem vínculo com planos e sincronização direta do SAP continuam futuras.

O detalhe do plano apresenta referência e tarefas, e o formulário permite incluir, corrigir ou remover operações manualmente. São tarefas planejadas; o apontamento de execução segue o fluxo de conclusão do plano ou da agenda.

## Qualidade do arquivo e validação

Colunas finais inteiramente vazias são ignoradas com aviso. Colunas sem título que contêm dados, cabeçalhos repetidos e arquivos acima dos limites continuam bloqueados com mensagens específicas. A validação preserva zeros no CSV UTF-8 e nos formatos numéricos de identificadores do XLSX. Máximo de 1.000 linhas, 60 colunas e 3 MB por arquivo.

A migration `202611180007_equipment_identity_and_plan_tasks` adiciona campos e índices; não aplica seed nem redefine senhas. Aplicá-la antes de publicar. Prévias antigas de equipamentos precisam ser geradas novamente para obedecer à nova regra de TAG.

Validação local: 139 testes com PostgreSQL isolado e build completo, incluindo identidade por setor, número opcional, exclusão/restauração, permissões, concorrência, preservação de histórico, chaves, tarefas agrupadas, duplicidades, reimportação e reversão. O manual e a Central de ajuda foram atualizados a partir de `training/guide.json`.
