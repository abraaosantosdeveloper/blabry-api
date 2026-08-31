const User = require('../models/user');

class AuthRepository {
  /**
   * @param {import('mysql2/promise').Pool} pool conexão injetada por quem instancia
   */
  constructor(pool) {
    this.pool = pool;
  }

  /** Colunas devolvidas ao montar um User. */
  static get COLUMNS() {
    return 'id, full_name, alias, email, email_verified_at, password_hash, nationality, birth_date, pic_url, created_at, deleted_at';
  }

  /** Busca por email. Retorna um User ou null. */
  async findByEmail(email) {
    const [rows] = await this.pool.execute(
      `SELECT ${AuthRepository.COLUMNS} FROM user WHERE email = ? AND deleted_at IS NULL`,
      [email]
    );
    return rows[0] ? User.fromRow(rows[0]) : null;
  }

  /** Busca pelo @ do usuário. Retorna um User ou null. */
  async findByAlias(alias) {
    const [rows] = await this.pool.execute(
      `SELECT ${AuthRepository.COLUMNS} FROM user WHERE alias = ? AND deleted_at IS NULL`,
      [alias]
    );
    return rows[0] ? User.fromRow(rows[0]) : null;
  }

  /**
   * Busca pelo id. Retorna um User ou null.
   *
   * Usado pelos fluxos que partem do token (exclusão de conta), onde a
   * identidade já está provada e o e-mail precisa ser lido do banco — nunca
   * aceito do corpo da requisição, que o cliente controla.
   */
  async findById(id) {
    const [rows] = await this.pool.execute(
      `SELECT ${AuthRepository.COLUMNS} FROM user WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? User.fromRow(rows[0]) : null;
  }

  /**
   * Persiste um User já montado pelo service.
   * @param {User} user
   */
  async create(user) {
    const row = user.toRow();
    await this.pool.execute(
      'INSERT INTO user (id, full_name, alias, email, password_hash, nationality, birth_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        row.id, row.full_name, row.alias, row.email,
        row.password_hash, row.nationality, row.birth_date,
      ]
    );
    return user;
  }

  /**
   * Marca o e-mail como confirmado.
   *
   * `AND email_verified_at IS NULL` no WHERE: confirmar duas vezes não deve
   * reescrever a data original. A primeira confirmação é a que vale — é ela
   * que a política de privacidade promete registrar.
   *
   * @returns {Promise<number>} linhas afetadas
   */
  async confirmEmail(userId) {
    const [result] = await this.pool.execute(
      'UPDATE user SET email_verified_at = NOW() WHERE id = ? AND email_verified_at IS NULL',
      [userId]
    );
    return result.affectedRows;
  }

  /**
   * Troca o hash da senha.
   *
   * Recebe o hash pronto: o repositório nunca vê a senha em texto, e a
   * política de hashing continua sendo do modelo `User`.
   */
  async updatePassword(userId, passwordHash) {
    const [result] = await this.pool.execute(
      'UPDATE user SET password_hash = ? WHERE id = ? AND deleted_at IS NULL',
      [passwordHash, userId]
    );
    return result.affectedRows;
  }

  /**
   * Encerra a conta anonimizando-a.
   *
   * **Não apaga a linha.** Duas razões, e a segunda é a decisiva:
   *
   *   1. O artigo 12 da LGPD coloca dado anonimizado fora do alcance da lei.
   *      Anonimizar cumpre a obrigação de eliminação.
   *   2. `DELETE` na linha dispararia `ON DELETE CASCADE` sobre `like_post`,
   *      removendo as curtidas que a pessoa deu em publicações de OUTRAS
   *      pessoas. Os contadores alheios cairiam retroativamente. Encerrar a
   *      própria conta não pode alterar o conteúdo de terceiros.
   *
   * O que é feito com cada campo:
   *
   *   - `email` e `alias` recebem valores derivados do id. Eles são UNIQUE,
   *     então não podem simplesmente virar NULL nem string vazia — duas
   *     contas encerradas colidiriam. Derivar do id garante unicidade e
   *     **libera o e-mail e o @ originais**, que é o que permite à pessoa se
   *     cadastrar de novo depois. O domínio `.invalid` é reservado pela
   *     RFC 2606 justamente para isto: nunca resolve, então o endereço não
   *     pode receber e-mail por acidente.
   *   - `password_hash` vira string vazia. Nenhuma senha gera hash vazio em
   *     bcrypt, então `verifyPassword` sempre falha — o login fica impossível
   *     mesmo que algum dia uma consulta esqueça o filtro `deleted_at`.
   *   - nome, bio, foto, nascimento e nacionalidade são esvaziados.
   *   - `deleted_at` continua sendo preenchido: é ele que as consultas do
   *     sistema já filtram, e é o que mantém a conta fora do feed, da busca,
   *     dos perfis e das listas de seguidores.
   *
   * `AND deleted_at IS NULL` garante idempotência: encerrar duas vezes
   * devolve 0 linhas em vez de reescrever a data.
   *
   * @returns {Promise<number>} linhas afetadas
   */
  async deleteAccount(userId) {
    const [result] = await this.pool.execute(
      `UPDATE user
          SET email = CONCAT('excluido-', id, '@blabry.invalid'),
              alias = CONCAT('excluido_', LEFT(REPLACE(id, '-', ''), 16)),
              full_name = 'Conta encerrada',
              password_hash = '',
              bio = NULL,
              pic_url = NULL,
              birth_date = NULL,
              nationality = NULL,
              email_verified_at = NULL,
              deleted_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );
    return result.affectedRows;
  }

  /**
   * Apaga o conteúdo publicado pela conta.
   *
   * Aqui o `DELETE` é físico, e é o correto: a política promete que o
   * conteúdo publicado é removido, e essas linhas pertencem a quem pediu a
   * exclusão.
   *
   * A ordem importa. Curtidas e comentários que a pessoa deixou em
   * publicações de outros saem primeiro, individualmente. Só depois as
   * publicações dela — cujo `ON DELETE CASCADE` leva junto as curtidas e os
   * comentários que terceiros fizeram nelas, o que é aceitável: um
   * comentário cuja publicação deixou de existir não tem onde ser lido.
   *
   * Não é transacional de propósito neste momento: cada passo é idempotente
   * e a falha no meio deixa a conta em estado consistente (encerrada, com
   * parte do conteúdo já removido), que a chamada seguinte termina de
   * limpar. Envolver em transação exigiria uma conexão dedicada do pool, e
   * é a melhoria natural quando houver mais o que apagar.
   */
  async purgeContent(userId) {
    await this.pool.execute('DELETE FROM like_post WHERE user_id = ?', [userId]);
    await this.pool.execute('DELETE FROM comment   WHERE user_id = ?', [userId]);
    await this.pool.execute('DELETE FROM follow    WHERE follower_id = ? OR following_id = ?', [userId, userId]);
    await this.pool.execute('DELETE FROM post      WHERE user_id = ?', [userId]);
    // Códigos pendentes não fazem sentido para uma conta encerrada.
    await this.pool.execute('DELETE FROM verification_code WHERE user_id = ?', [userId]);
  }
}

module.exports = AuthRepository;
