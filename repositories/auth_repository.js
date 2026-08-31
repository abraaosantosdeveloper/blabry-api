const User = require('../models/user');

class AuthRepository {
  /**
   * @param {import('mysql2/promise').Pool} pool conexão injetada por quem instancia
   */
  constructor(pool) {
    this.pool = pool;
  }

  /** Colunas devolvidas ao montar um User. */
  static get COLUNAS() {
    return 'id, full_name, alias, email, email_verified_at, password_hash, nationality, birth_date, pic_url, created_at, deleted_at';
  }

  /** Busca por email. Retorna um User ou null. */
  async buscarPorEmail(email) {
    const [rows] = await this.pool.execute(
      `SELECT ${AuthRepository.COLUNAS} FROM user WHERE email = ? AND deleted_at IS NULL`,
      [email]
    );
    return rows[0] ? User.deLinha(rows[0]) : null;
  }

  /** Busca pelo @ do usuário. Retorna um User ou null. */
  async buscarPorApelido(apelido) {
    const [rows] = await this.pool.execute(
      `SELECT ${AuthRepository.COLUNAS} FROM user WHERE alias = ? AND deleted_at IS NULL`,
      [apelido]
    );
    return rows[0] ? User.deLinha(rows[0]) : null;
  }

  /**
   * Busca pelo id. Retorna um User ou null.
   *
   * Usado pelos fluxos que partem do token (exclusão de conta), onde a
   * identidade já está provada e o e-mail precisa ser lido do banco — nunca
   * aceito do corpo da requisição, que o cliente controla.
   */
  async buscarPorId(id) {
    const [rows] = await this.pool.execute(
      `SELECT ${AuthRepository.COLUNAS} FROM user WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? User.deLinha(rows[0]) : null;
  }

  /**
   * Persiste um User já montado pelo service.
   * @param {User} usuario
   */
  async criar(usuario) {
    const linha = usuario.paraLinha();
    await this.pool.execute(
      'INSERT INTO user (id, full_name, alias, email, password_hash, nationality, birth_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        linha.id, linha.full_name, linha.alias, linha.email,
        linha.password_hash, linha.nationality, linha.birth_date,
      ]
    );
    return usuario;
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
  async confirmarEmail(usuarioId) {
    const [resultado] = await this.pool.execute(
      'UPDATE user SET email_verified_at = NOW() WHERE id = ? AND email_verified_at IS NULL',
      [usuarioId]
    );
    return resultado.affectedRows;
  }

  /**
   * Troca o hash da senha.
   *
   * Recebe o hash pronto: o repositório nunca vê a senha em texto, e a
   * política de hashing continua sendo do modelo `User`.
   */
  async atualizarSenha(usuarioId, senhaHash) {
    const [resultado] = await this.pool.execute(
      'UPDATE user SET password_hash = ? WHERE id = ? AND deleted_at IS NULL',
      [senhaHash, usuarioId]
    );
    return resultado.affectedRows;
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
  async excluirConta(usuarioId) {
    const [resultado] = await this.pool.execute(
      'UPDATE user SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [usuarioId]
    );
    return resultado.affectedRows;
  }
}

module.exports = AuthRepository;
