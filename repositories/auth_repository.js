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
    return 'id, full_name, alias, email, password_hash, nationality, birth_date, pic_url, created_at, deleted_at';
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
}

module.exports = AuthRepository;
