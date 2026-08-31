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
   * Exclusão lógica da conta.
   *
   * `deleted_at` em vez de DELETE, por três razões:
   *
   *   1. Todas as consultas do sistema já filtram por `deleted_at IS NULL`,
   *      então a conta some da aplicação no mesmo instante.
   *   2. Um DELETE arrastaria em cascata publicações, comentários e curtidas
   *      — inclusive comentários de terceiros em publicações do usuário, o
   *      que apagaria conteúdo de quem não pediu nada.
   *   3. Chaves estrangeiras apontando para o usuário continuam íntegras;
   *      um DELETE exigiria decidir o destino de cada uma sob pressão.
   *
   *   `AND deleted_at IS NULL` garante idempotência: excluir de novo devolve
   *   0 linhas em vez de mover a data para frente.
   */
  async deleteAccount(userId) {
    const [result] = await this.pool.execute(
      'UPDATE user SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    return result.affectedRows;
  }
}

module.exports = AuthRepository;
