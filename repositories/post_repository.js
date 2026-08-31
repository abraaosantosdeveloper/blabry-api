const Post = require('../models/post');

class PostRepository {
  constructor(pool) {
    this.pool = pool;
  }

  /** Colunas do post e do autor, já com o JOIN. */
  static get COLUMNS() {
    return `p.id, p.user_id, p.content, p.created_at, p.edited_at,
            u.full_name, u.alias, u.pic_url, u.bio`;
  }

  /**
   * Agregados calculados na própria consulta.
   * Evita o padrão N+1: um SELECT de posts seguido de um COUNT por post
   * transformaria uma página de 10 itens em 21 idas ao banco.
   */
  static get AGGREGATES() {
    return `(SELECT COUNT(*) FROM like_post lp WHERE lp.post_id = p.id) AS likes,
            (SELECT COUNT(*) FROM comment  c  WHERE c.post_id  = p.id) AS comments,
            EXISTS(SELECT 1 FROM like_post lp
                    WHERE lp.post_id = p.id AND lp.user_id = ?) AS liked`;
  }

  /**
   * Converte o texto digitado na expressão que o modo booleano do MySQL
   * entende.
   *
   * Por que não usar o modo NATURAL LANGUAGE:
   *   - ele casa apenas palavras inteiras, então "gran" não acha "grande",
   *     que é justamente o que se espera de uma caixa de busca;
   *   - a frase inteira vai como está, e tokens muito curtos atrapalham.
   *
   * O que este método faz, por token:
   *   - remove os operadores do modo booleano (+ - > < ( ) ~ * " @), que o
   *     usuário pode ter digitado sem intenção e que causariam erro de
   *     sintaxe na consulta;
   *   - descarta tokens menores que o tamanho mínimo indexado pelo InnoDB
   *     (innodb_ft_min_token_size, padrão 3) — eles nunca casariam;
   *   - acrescenta "*" para casar por prefixo.
   *
   * Os tokens são unidos por espaço, o que no modo booleano significa "ou":
   * quem tiver mais deles aparece antes, pela relevância.
   *
   * @param {string} term texto digitado pelo usuário
   * @returns {string} expressão booleana, ou string vazia se nada sobrar
   */
  static booleanExpression(term) {
    return String(term ?? '')
      .split(/\s+/)
      .map((token) => token.replace(/[+\-><()~*"@]/g, ''))
      .filter((token) => token.length >= 3)
      .map((token) => `${token}*`)
      .join(' ');
  }

  /**
   * Feed e busca no mesmo método — a diferença é um WHERE e a ordenação.
   *
   * @param {{viewerId: string, q?: string, limit?: number, offset?: number}} options
   * @returns {Promise<{posts: Post[], total: number}>}
   */
  async list({ viewerId, q = null, limit = 10, offset = 0 }) {
    // LIMIT e OFFSET não podem ser placeholders em prepared statement no
    // MySQL. São interpolados — seguros porque a checagem abaixo garante
    // que são inteiros, e eles nunca chegam como texto do cliente.
    if (!Number.isInteger(limit) || !Number.isInteger(offset))
      throw new TypeError('limit e offset devem ser inteiros');

    // Traduz o texto digitado para a sintaxe do modo booleano. Se nada
    // sobrar — só palavras curtas demais —, a busca devolve vazio em vez de
    // consultar sem filtro, que retornaria o feed inteiro.
    const expression = q ? PostRepository.booleanExpression(q) : '';

    if (q && !expression) return { posts: [], total: 0 };

    const searching = Boolean(expression);

    const relevance = searching
      ? ', MATCH (p.content) AGAINST (? IN BOOLEAN MODE) AS relevance'
      : '';

    const filter = searching
      ? 'AND MATCH (p.content) AGAINST (? IN BOOLEAN MODE)'
      : '';

    const order = searching
      ? 'ORDER BY relevance DESC, p.created_at DESC'
      : 'ORDER BY p.created_at DESC, p.id DESC';

    // A ordem dos parâmetros segue a ordem dos "?" no SQL montado.
    const params = searching
      ? [expression, viewerId, expression]
      : [viewerId];

    const [rows] = await this.pool.execute(
      `SELECT ${PostRepository.COLUMNS}${relevance},
              ${PostRepository.AGGREGATES}
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE u.deleted_at IS NULL ${filter}
        ${order}
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [[{ total }]] = await this.pool.execute(
      `SELECT COUNT(*) AS total
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE u.deleted_at IS NULL ${filter}`,
      searching ? [expression] : []
    );

    return { posts: rows.map(Post.fromRow), total: Number(total) };
  }

  /**
   * Publicações de um autor específico, da mais recente para a mais antiga.
   *
   * É um método separado de `list` de propósito. Poderia ser mais um
   * parâmetro opcional lá, mas `list` já carrega dois modos (feed e
   * busca); um terceiro eixo tornaria o SQL montado condicionalmente em
   * três lugares diferentes, e é assim que nasce um método que ninguém
   * mais consegue ler. Aqui o WHERE é fixo e a consulta é direta.
   *
   * O autor é identificado por id, não por @: a tradução de @ para id é
   * responsabilidade do service, que já precisa dela para responder 404
   * quando o perfil não existe.
   *
   * @param {{authorId: string, viewerId: string, limit?: number, offset?: number}} options
   * @returns {Promise<{posts: Post[], total: number}>}
   */
  async listByAuthor({ authorId, viewerId, limit = 10, offset = 0 }) {
    // Mesma trava de `list`: LIMIT/OFFSET são interpolados porque o MySQL
    // não os aceita como placeholder, então precisam ser inteiros provados.
    if (!Number.isInteger(limit) || !Number.isInteger(offset))
      throw new TypeError('limit e offset devem ser inteiros');

    const [rows] = await this.pool.execute(
      `SELECT ${PostRepository.COLUMNS},
              ${PostRepository.AGGREGATES}
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE p.user_id = ? AND u.deleted_at IS NULL
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      // `viewerId` vem primeiro porque o "?" dos AGGREGATES (o EXISTS que
      // diz se o visitante curtiu) aparece antes do "?" do WHERE no SQL.
      [viewerId, authorId]
    );

    const [[{ total }]] = await this.pool.execute(
      `SELECT COUNT(*) AS total
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE p.user_id = ? AND u.deleted_at IS NULL`,
      [authorId]
    );

    return { posts: rows.map(Post.fromRow), total: Number(total) };
  }

  /** Um post específico, com os mesmos agregados da listagem. */
  async findById(id, viewerId) {
    const [rows] = await this.pool.execute(
      `SELECT ${PostRepository.COLUMNS},
              ${PostRepository.AGGREGATES}
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE p.id = ? AND u.deleted_at IS NULL`,
      [viewerId, id]
    );

    return rows[0] ? Post.fromRow(rows[0]) : null;
  }

  /** Persiste um Post montado pelo service e o devolve já completo. */
  async create(post, viewerId) {
    const row = post.toRow();

    await this.pool.execute(
      'INSERT INTO post (id, user_id, content) VALUES (?, ?, ?)',
      [row.id, row.user_id, row.content]
    );

    return this.findById(row.id, viewerId);
  }

  /** Atualiza o conteúdo e marca a edição. Autoria no WHERE. */
  async update(id, authorId, content) {
    const [result] = await this.pool.execute(
      `UPDATE post
          SET content = ?, edited_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [content, id, authorId]
    );
    return result.affectedRows;
  }

  /**
   * Exclusão restrita ao autor. A autoria é parte do WHERE, não uma
   * checagem anterior: assim não existe janela entre verificar e apagar.
   */
  async remove(id, authorId) {
    const [result] = await this.pool.execute(
      'DELETE FROM post WHERE id = ? AND user_id = ?',
      [id, authorId]
    );
    return result.affectedRows;
  }

  /** Confere se o post existe, sem trazer dados. */
  async exists(id) {
    const [rows] = await this.pool.execute(
      'SELECT 1 FROM post WHERE id = ? LIMIT 1',
      [id]
    );
    return rows.length > 0;
  }

  /**
   * Registra uma curtida. Idempotente: curtir duas vezes não duplica,
   * porque a tabela tem UNIQUE (post_id, user_id).
   */
  async like(id, postId, userId) {
    await this.pool.execute(
      `INSERT INTO like_post (id, post_id, user_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE post_id = post_id`,
      [id, postId, userId]
    );
  }

  /** Remove a curtida. Idempotente: descurtir o que não estava curtido não falha. */
  async unlike(postId, userId) {
    await this.pool.execute(
      'DELETE FROM like_post WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );
  }

  /** Recontagem após a operação — o número devolvido vem do banco. */
  async countLikes(postId) {
    const [[{ total }]] = await this.pool.execute(
      'SELECT COUNT(*) AS total FROM like_post WHERE post_id = ?',
      [postId]
    );
    return Number(total);
  }
}

module.exports = PostRepository;
