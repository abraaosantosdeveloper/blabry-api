/* ============================================================
   Migração 001 — edição de posts, respostas a comentários e índices
   ------------------------------------------------------------
   Aplicar em bancos que já existem. Bancos criados do zero pelo
   database.sql já nascem com tudo isto.

   Rode uma vez. Reexecutar dá erro de "coluna já existe" — o MySQL
   não aceita ADD COLUMN IF NOT EXISTS.
   ============================================================ */

USE blabry_db;

/* ---- Edição de publicações ----
   Marcar o post como editado não é opcional: quem curtiu ou comentou
   endossou o texto que leu. A interface exibe "editado" a partir daqui. */
ALTER TABLE post
    ADD COLUMN edited_at datetime NULL DEFAULT NULL AFTER created_at;

/* ---- Busca no conteúdo dos posts ----
   Já aplicado. Mantido aqui como registro da migração.
   LIKE '%termo%' não usa índice; MATCH ... AGAINST usa. */
-- ALTER TABLE post ADD FULLTEXT INDEX idx_post_conteudo (content);

/* ---- Respostas a comentários (um nível, com menção) ----
   Referencia o comentário respondido, não o autor: dá para descobrir o
   autor a partir dele, e ainda saber a qual comentário a resposta se
   refere. A listagem continua plana — sem árvore recursiva.
   ON DELETE SET NULL: apagar o comentário original não apaga as
   respostas, elas apenas deixam de apontar para ele. */
ALTER TABLE comment
    ADD COLUMN reply_to char(36) NULL DEFAULT NULL AFTER post_id,
    ADD CONSTRAINT fk_comment_reply
        FOREIGN KEY (reply_to) REFERENCES comment(id) ON DELETE SET NULL;

/* ---- Índices de consulta ----
   Cobrem exatamente os acessos que as rotas fazem hoje. */

/* Feed: ORDER BY created_at DESC, id DESC */
ALTER TABLE post
    ADD INDEX idx_post_created (created_at DESC, id DESC);

/* Perfil: publicações de um usuário em ordem cronológica */
ALTER TABLE post
    ADD INDEX idx_post_autor (user_id, created_at DESC);

/* Comentários: WHERE post_id = ? ORDER BY created_at ASC
   e também o COUNT(*) por post usado no card */
ALTER TABLE comment
    ADD INDEX idx_comment_post (post_id, created_at);

/* Busca de usuários: LIKE 'termo%' em full_name
   (alias e email já têm índice por serem UNIQUE) */
ALTER TABLE user
    ADD INDEX idx_user_nome (full_name);
