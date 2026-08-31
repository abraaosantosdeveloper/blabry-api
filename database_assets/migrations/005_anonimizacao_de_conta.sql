/* ============================================================
   Migração 005 — permitir anonimizar a conta excluída
   ------------------------------------------------------------
   A exclusão de conta preenchia `deleted_at` e parava aí. Todos
   os dados pessoais continuavam no banco indefinidamente:
   e-mail, nome completo, data de nascimento, nacionalidade, bio,
   foto e o hash da senha.

   Dois problemas concretos:

   1. A política de privacidade promete que os dados são
      "removidos dos nossos registros ativos". Não eram.

   2. `email` e `alias` são UNIQUE. Quem excluísse a conta nunca
      mais conseguiria se cadastrar com o mesmo e-mail, porque a
      linha antiga continuava ocupando o valor.

   Por que anonimizar em vez de apagar a linha: o artigo 12 da
   LGPD coloca dado anonimizado fora do alcance da lei, então a
   anonimização cumpre a obrigação de eliminação. E apagar a
   linha dispararia ON DELETE CASCADE sobre `like_post`, o que
   removeria as curtidas que a pessoa deu em publicações de
   OUTROS — os contadores alheios cairiam retroativamente, sem
   que ninguém tivesse pedido nada.

   Esta migração só torna as colunas anuláveis. A anonimização em
   si é feita pela aplicação, em `AuthRepository.deleteAccount`.

   `birth_date` e `nationality` eram NOT NULL porque são
   obrigatórias no cadastro. A obrigatoriedade continua valendo
   na criação — ela é do serviço, não da coluna. O banco passa a
   permitir NULL apenas para que a conta encerrada possa deixar
   de guardá-las.
   ============================================================ */

USE blabry_db;

ALTER TABLE user
  MODIFY COLUMN birth_date date NULL DEFAULT NULL,
  MODIFY COLUMN nationality char(3) NULL DEFAULT NULL;
