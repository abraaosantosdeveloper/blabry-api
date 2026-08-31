/* ============================================================
   Migração 002 — edição de comentários
   ------------------------------------------------------------
   Mesma decisão tomada para `post`: registrar que houve edição,
   porque quem respondeu ou curtiu reagiu ao texto que leu.
   ============================================================ */

USE blabry_db;

ALTER TABLE comment
    ADD COLUMN edited_at datetime NULL DEFAULT NULL AFTER created_at;
