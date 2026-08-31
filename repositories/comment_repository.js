const Comment = require('../models/comment');

class CommentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  static get COLUNAS() {
    return `c.id, c.post_id, c.user_id, c.content, c.created_at,
            u.full_name, u.alias, u.pic_url`;
  }

  /**
   * Comentários de um post, do mais antigo para o mais recente.
   *
   * Ordem crescente porque comentário é conversa: lê-se de cima para baixo,
   * e as páginas seguintes trazem o que veio depois. É o oposto do feed,
   * onde o mais novo vem primeiro.
   */
  async listarPorPost(postId, { limite = 10, offset = 0 } = {}) {
    if (!Number.isInteger(limite) || !Number.isInteger(offset))
      throw new TypeError('limite e offset devem ser inteiros');

    const [rows] = await this.pool.execute(
      `SELECT ${CommentRepository.COLUNAS}
         FROM comment c
         JOIN user u ON u.id = c.user_id
        WHERE c.post_id = ? AND u.deleted_at IS NULL
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ${limite} OFFSET ${offset}`,
      [postId]
    );

    const [[{ total }]] = await this.pool.execute(
      `SELECT COUNT(*) AS total
         FROM comment c
         JOIN user u ON u.id = c.user_id
        WHERE c.post_id = ? AND u.deleted_at IS NULL`,
      [postId]
    );

    return { comentarios: rows.map(Comment.deLinha), total: Number(total) };
  }

  async criar(comentario) {
    const linha = comentario.paraLinha();

    await this.pool.execute(
      'INSERT INTO comment (id, post_id, user_id, content) VALUES (?, ?, ?, ?)',
      [linha.id, linha.post_id, linha.user_id, linha.content]
    );

    return this.buscarPorId(linha.id);
  }

  async buscarPorId(id) {
    const [rows] = await this.pool.execute(
      `SELECT ${CommentRepository.COLUNAS}
         FROM comment c
         JOIN user u ON u.id = c.user_id
        WHERE c.id = ?`,
      [id]
    );
    return rows[0] ? Comment.deLinha(rows[0]) : null;
  }

  /** Autoria no WHERE, como no post: sem janela entre checar e apagar. */
  async excluir(id, autorId) {
    const [resultado] = await this.pool.execute(
      'DELETE FROM comment WHERE id = ? AND user_id = ?',
      [id, autorId]
    );
    return resultado.affectedRows;
  }
    /**
   * Atualiza o conteúdo e marca a edição.
   * A autoria está no WHERE: sem janela entre verificar e escrever.
   */
  async atualizar(id, autorId, conteudo) {
    const [resultado] = await this.pool.execute(
      `UPDATE comment
          SET content = ?, edited_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [conteudo, id, autorId]
    );
    return resultado.affectedRows;
  }
}



module.exports = CommentRepository;