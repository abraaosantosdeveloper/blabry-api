const Comment = require('../models/comment');

class CommentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  static get COLUMNS() {
    return `c.id, c.post_id, c.user_id, c.content, c.created_at, c.edited_at,
            u.full_name, u.alias, u.pic_url`;
  }

  /**
   * Comentários de um post, do mais antigo para o mais recente.
   *
   * Ordem crescente porque comentário é conversa: lê-se de cima para baixo,
   * e as páginas seguintes trazem o que veio depois. É o oposto do feed,
   * onde o mais novo vem primeiro.
   */
  async listByPost(postId, { limit = 10, offset = 0 } = {}) {
    if (!Number.isInteger(limit) || !Number.isInteger(offset))
      throw new TypeError('limit e offset devem ser inteiros');

    const [rows] = await this.pool.execute(
      `SELECT ${CommentRepository.COLUMNS}
         FROM comment c
         JOIN user u ON u.id = c.user_id
        WHERE c.post_id = ? AND u.deleted_at IS NULL
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ${limit} OFFSET ${offset}`,
      [postId]
    );

    const [[{ total }]] = await this.pool.execute(
      `SELECT COUNT(*) AS total
         FROM comment c
         JOIN user u ON u.id = c.user_id
        WHERE c.post_id = ? AND u.deleted_at IS NULL`,
      [postId]
    );

    return { comments: rows.map(Comment.fromRow), total: Number(total) };
  }

  async create(comment) {
    const row = comment.toRow();

    await this.pool.execute(
      'INSERT INTO comment (id, post_id, user_id, content) VALUES (?, ?, ?, ?)',
      [row.id, row.post_id, row.user_id, row.content]
    );

    return this.buscarPorId(row.id);
  }

  async findById(id) {
    const [rows] = await this.pool.execute(
      `SELECT ${CommentRepository.COLUMNS}
         FROM comment c
         JOIN user u ON u.id = c.user_id
        WHERE c.id = ?`,
      [id]
    );
    return rows[0] ? Comment.fromRow(rows[0]) : null;
  }

  /** Autoria no WHERE, como no post: sem janela entre checar e apagar. */
  async remove(id, authorId) {
    const [result] = await this.pool.execute(
      'DELETE FROM comment WHERE id = ? AND user_id = ?',
      [id, authorId]
    );
    return result.affectedRows;
  }
    /**
   * Atualiza o conteúdo e marca a edição.
   * A autoria está no WHERE: sem janela entre verificar e escrever.
   */
  async update(id, authorId, content) {
    const [result] = await this.pool.execute(
      `UPDATE comment
          SET content = ?, edited_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [content, id, authorId]
    );
    return result.affectedRows;
  }
}



module.exports = CommentRepository;