/* ============================================================
   Migração 003 — índice de texto completo em `post`
   ------------------------------------------------------------
   Corrige uma omissão da migração 001, onde este comando ficou
   comentado sob a suposição de já ter sido aplicado. Isso era
   verdade no ambiente local, onde o ALTER havia sido executado à
   mão, mas não em produção.

   Sem o índice, MATCH ... AGAINST não fica apenas lento: falha com
   "Can't find FULLTEXT index matching the column list", e a busca
   por publicações responde com erro.

   Antes de rodar, verifique se ele já existe:
       SHOW INDEX FROM post WHERE Key_name = 'idx_post_conteudo';
   Se retornar alguma linha, pule esta migração — o MySQL não aceita
   CREATE INDEX IF NOT EXISTS.

   O comando reconstrói a tabela para criar a coluna oculta
   FTS_DOC_ID, exigida pelo InnoDB. Com poucas linhas leva frações de
   segundo; com volume, exige janela de manutenção.
   ============================================================ */

USE blabry_db;

ALTER TABLE post ADD FULLTEXT INDEX idx_post_conteudo (content);
