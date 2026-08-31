/**
 * Acesso à tabela `verification_code`.
 *
 * Como todo repositório do projeto, recebe o pool por injeção no construtor:
 * é o que permite testar a montagem do SQL e a ordem dos parâmetros com um
 * pool falso, sem banco algum.
 */
class VerificationRepository {
  /**
   * @param {import('mysql2/promise').Pool} pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Grava um código emitido.
   *
   * Recebe o hash pronto, nunca o código em texto. Quem gera o hash é o
   * serviço; o repositório não conhece a política de hashing, apenas persiste
   * o que recebe — a mesma divisão usada com a senha do usuário.
   *
   * @param {{id: string, userId: string, purpose: string, codeHash: string, expiresAt: Date}} dados
   */
  async create({ id, userId, purpose, codeHash, expiresAt }) {
    await this.pool.execute(
      `INSERT INTO verification_code (id, user_id, purpose, code_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, purpose, codeHash, expiresAt]
    );
  }

  /**
   * O código mais recente ainda utilizável de um usuário para um propósito.
   *
   * "Utilizável" tem três condições, todas no WHERE:
   *   - não foi consumido (`used_at IS NULL`);
   *   - não expirou (`expires_at > NOW()`);
   *   - ainda tem attempts (`attempts < ?`).
   *
   * Filtrar no banco, e não em JavaScript depois, importa: um código expirado
   * que chegasse até aqui poderia ser comparado por engano em alguma
   * refatoração futura. O que não serve não sai da consulta.
   *
   * `LIMIT 1` com `ORDER BY created_at DESC` porque só o último vale — pedir
   * um novo código invalida na prática os anteriores.
   *
   * @returns {Promise<{id: string, codeHash: string, attempts: number}|null>}
   */
  async findActive(userId, purpose, maxAttempts) {
    const [rows] = await this.pool.execute(
      `SELECT id, code_hash, attempts
         FROM verification_code
        WHERE user_id = ?
          AND purpose = ?
          AND used_at IS NULL
          AND expires_at > NOW()
          AND attempts < ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, purpose, maxAttempts]
    );

    if (!rows[0]) return null;

    // Tradução snake_case → camelCase: o repositório é a fronteira onde os
    // nomes do banco param e os nomes do domínio começam.
    return {
      id: rows[0].id,
      codeHash: rows[0].code_hash,
      attempts: Number(rows[0].attempts),
    };
  }

  /**
   * Segundos desde o último código emitido para este propósito.
   *
   * Serve ao limite de reenvio. Devolve `null` quando nunca houve um —
   * distinto de 0, que significaria "acabou de ser emitido".
   *
   * @returns {Promise<number|null>}
   */
  async secondsSinceLast(userId, purpose) {
    const [rows] = await this.pool.execute(
      `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS seconds
         FROM verification_code
        WHERE user_id = ? AND purpose = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, purpose]
    );

    return rows[0] ? Number(rows[0].segundos) : null;
  }

  /** Incrementa o contador de attempts erradas de um código. */
  async registerAttempt(id) {
    await this.pool.execute(
      'UPDATE verification_code SET attempts = attempts + 1 WHERE id = ?',
      [id]
    );
  }

  /**
   * Marca o código como consumido.
   *
   * `AND used_at IS NULL` no WHERE, e não uma checagem anterior: se duas
   * requisições chegarem com o mesmo código ao mesmo tempo, apenas uma
   * afetará uma linha. O retorno diz qual delas ganhou — e o serviço só
   * prossegue se ganhou. Sem isso existiria uma janela entre verificar e
   * marcar, e as duas passariam.
   *
   * @returns {Promise<number>} linhas afetadas (1 = consumido agora, 0 = já era)
   */
  async consume(id) {
    const [result] = await this.pool.execute(
      'UPDATE verification_code SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
      [id]
    );
    return result.affectedRows;
  }

  /**
   * Invalida os códigos pendentes de um propósito.
   *
   * Chamado depois de um uso bem-sucedido: trocada a senha, nenhum código
   * antigo de troca de senha deve continuar valendo.
   */
  async invalidatePending(userId, purpose) {
    await this.pool.execute(
      `UPDATE verification_code
          SET used_at = NOW()
        WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
      [userId, purpose]
    );
  }
}

module.exports = VerificationRepository;
