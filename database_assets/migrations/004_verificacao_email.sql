/* ============================================================
   Migração 004 — verificação por código enviado ao e-mail
   ------------------------------------------------------------
   Cria a infraestrutura para três fluxos que precisam provar que
   quem age é o dono do e-mail cadastrado:

     1. confirmação de conta recém-criada;
     2. troca de senha;
     3. exclusão de conta.

   Duas mudanças:

   (a) user.email_verified_at — quando o e-mail foi confirmado.
       É datetime, e não booleano, porque a data responde a mais
       perguntas pelo mesmo preço: além de "confirmou?", responde
       "quando?". NULL significa não confirmado.

       Contas que já existiam são marcadas como confirmadas no fim
       deste arquivo. Elas foram criadas antes da regra existir, e
       trancar todo mundo para fora por causa de uma regra nova
       seria punir o usuário por uma decisão nossa.

   (b) verification_code — os códigos emitidos.

       O código é gravado como HASH, nunca em texto puro. Se a
       tabela vazar, os hashes não permitem entrar em conta alguma;
       o texto puro permitiria. É o mesmo raciocínio da senha, e
       vale mesmo o código durando poucos minutos.

       `attempts` conta as tentativas erradas. Um código de 6
       dígitos tem um milhão de combinações — chutável em minutos
       por um script sem um limite. Com o limite, o código morre
       antes de ser adivinhado.

       `used_at` marca o consumo. Sem essa coluna, o mesmo código
       serviria duas vezes, e um código reutilizável equivale a uma
       senha permanente enviada por e-mail.

       ON DELETE CASCADE: se o usuário for removido de vez, os
       códigos vão junto — não fazem sentido órfãos.
   ============================================================ */

USE blabry_db;

/* ---------- (a) marca de confirmação no usuário ---------- */

ALTER TABLE user
  ADD COLUMN email_verified_at datetime NULL DEFAULT NULL AFTER email;

/* ---------- (b) códigos de verificação ---------- */

CREATE TABLE IF NOT EXISTS verification_code (
    id          char(36)    NOT NULL,
    user_id     char(36)    NOT NULL,

    /* ENUM em vez de varchar: o banco recusa um propósito que o
       código não conheça, em vez de aceitar um erro de digitação
       que só apareceria como "nenhum código encontrado". */
    purpose     ENUM('signup', 'password_reset', 'account_deletion') NOT NULL,

    code_hash   char(60)    NOT NULL,
    expires_at  datetime    NOT NULL,
    used_at     datetime    NULL DEFAULT NULL,
    attempts    int         NOT NULL DEFAULT 0,
    created_at  datetime    DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,

    /* A consulta quente é sempre "o último código deste usuário
       para este propósito". O índice cobre exatamente ela, e
       created_at DESC evita ordenar em memória. */
    INDEX idx_verificacao_usuario_proposito (user_id, purpose, created_at)
);

/* ---------- Contas anteriores à regra ---------- */

UPDATE user
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL;
