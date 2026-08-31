const Post = require('../models/post');

class PostRepository {
  constructor(pool) {
    this.pool = pool;
  }

  /** Colunas do post e do autor, já com o JOIN. */
  static get COLUNAS() {
    return `p.id, p.user_id, p.content, p.created_at, p.edited_at,
            u.full_name, u.alias, u.pic_url, u.bio`;
  }

  /**
   * Agregados calculados na própria consulta.
   * Evita o padrão N+1: um SELECT de posts seguido de um COUNT por post
   * transformaria uma página de 10 itens em 21 idas ao banco.
   */
  static get AGREGADOS() {
    return `(SELECT COUNT(*) FROM like_post lp WHERE lp.post_id = p.id) AS curtidas,
            (SELECT COUNT(*) FROM comment  c  WHERE c.post_id  = p.id) AS comentarios,
            EXISTS(SELECT 1 FROM like_post lp
                    WHERE lp.post_id = p.id AND lp.user_id = ?) AS curtido`;
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
   * @param {string} termo texto digitado pelo usuário
   * @returns {string} expressão booleana, ou string vazia se nada sobrar
   */
  static expressaoBooleana(termo) {
    return String(termo ?? '')
      .split(/\s+/)
      .map((token) => token.replace(/[+\-><()~*"@]/g, ''))
      .filter((token) => token.length >= 3)
      .map((token) => `${token}*`)
      .join(' ');
  }

  /**
   * Feed e busca no mesmo método — a diferença é um WHERE e a ordenação.
   *
   * @param {{visitanteId: string, q?: string, limite?: number, offset?: number}} opcoes
   * @returns {Promise<{posts: Post[], total: number}>}
   */
  async listar({ visitanteId, q = null, limite = 10, offset = 0 }) {
    // LIMIT e OFFSET não podem ser placeholders em prepared statement no
    // MySQL. São interpolados — seguros porque a checagem abaixo garante
    // que são inteiros, e eles nunca chegam como texto do cliente.
    if (!Number.isInteger(limite) || !Number.isInteger(offset))
      throw new TypeError('limite e offset devem ser inteiros');

    // Traduz o texto digitado para a sintaxe do modo booleano. Se nada
    // sobrar — só palavras curtas demais —, a busca devolve vazio em vez de
    // consultar sem filtro, que retornaria o feed inteiro.
    const expressao = q ? PostRepository.expressaoBooleana(q) : '';

    if (q && !expressao) return { posts: [], total: 0 };

    const busca = Boolean(expressao);

    const relevancia = busca
      ? ', MATCH (p.content) AGAINST (? IN BOOLEAN MODE) AS relevancia'
      : '';

    const filtro = busca
      ? 'AND MATCH (p.content) AGAINST (? IN BOOLEAN MODE)'
      : '';

    const ordem = busca
      ? 'ORDER BY relevancia DESC, p.created_at DESC'
      : 'ORDER BY p.created_at DESC, p.id DESC';

    // A ordem dos parâmetros segue a ordem dos "?" no SQL montado.
    const parametros = busca
      ? [expressao, visitanteId, expressao]
      : [visitanteId];

    const [rows] = await this.pool.execute(
      `SELECT ${PostRepository.COLUNAS}${relevancia},
              ${PostRepository.AGREGADOS}
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE u.deleted_at IS NULL ${filtro}
        ${ordem}
        LIMIT ${limite} OFFSET ${offset}`,
      parametros
    );

    const [[{ total }]] = await this.pool.execute(
      `SELECT COUNT(*) AS total
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE u.deleted_at IS NULL ${filtro}`,
      busca ? [expressao] : []
    );

    return { posts: rows.map(Post.deLinha), total: Number(total) };
  }

  /** Um post específico, com os mesmos agregados da listagem. */
  async buscarPorId(id, visitanteId) {
    const [rows] = await this.pool.execute(
      `SELECT ${PostRepository.COLUNAS},
              ${PostRepository.AGREGADOS}
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE p.id = ? AND u.deleted_at IS NULL`,
      [visitanteId, id]
    );

    return rows[0] ? Post.deLinha(rows[0]) : null;
  }

  /**
   * Publicações de um autor específico, da mais recente para a mais antiga.
   *
   * É um método separado de `listar` de propósito. Poderia ser mais um
   * parâmetro opcional lá, mas `listar` já carrega dois modos (feed e
   * busca); um terceiro eixo tornaria o SQL montado condicionalmente em
   * três lugares diferentes, e é assim que nasce um método que ninguém
   * mais consegue ler. Aqui o WHERE é fixo e a consulta é direta.
   *
   * O autor é identificado por id, não por @: a tradução de @ para id é
   * responsabilidade do service, que já precisa dela para responder 404
   * quando o perfil não existe.
   *
   * @param {{autorId: string, visitanteId: string, limite?: number, offset?: number}} opcoes
   * @returns {Promise<{posts: Post[], total: number}>}
   */
  async listarDoAutor({ autorId, visitanteId, limite = 10, offset = 0 }) {
    // Mesma trava de `listar`: LIMIT/OFFSET são interpolados porque o MySQL
    // não os aceita como placeholder, então precisam ser inteiros provados.
    if (!Number.isInteger(limite) || !Number.isInteger(offset))
      throw new TypeError('limite e offset devem ser inteiros');

    const [rows] = await this.pool.execute(
      `SELECT ${PostRepository.COLUNAS},
              ${PostRepository.AGREGADOS}
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE p.user_id = ? AND u.deleted_at IS NULL
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${limite} OFFSET ${offset}`,
      // `visitanteId` vem primeiro porque o "?" dos AGREGADOS (o EXISTS que
      // diz se o visitante curtiu) aparece antes do "?" do WHERE no SQL.
      [visitanteId, autorId]
    );

    const [[{ total }]] = await this.pool.execute(
      `SELECT COUNT(*) AS total
         FROM post p
         JOIN user u ON u.id = p.user_id
        WHERE p.user_id = ? AND u.deleted_at IS NULL`,
      [autorId]
    );

    return { posts: rows.map(Post.deLinha), total: Number(total) };
  }

  /** Persiste um Post montado pelo service e o devolve já completo. */
  async criar(post, visitanteId) {
    const linha = post.paraLinha();

    await this.pool.execute(
      'INSERT INTO post (id, user_id, content) VALUES (?, ?, ?)',
      [linha.id, linha.user_id, linha.content]
    );

    return this.buscarPorId(linha.id, visitanteId);
  }

    /** Atualiza o conteúdo e marca a edição. Autoria no WHERE. */
  async atualizar(id, autorId, conteudo) {
    const [resultado] = await this.pool.execute(
      `UPDATE post
          SET content = ?, edited_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [conteudo, id, autorId]
    );
    return resultado.affectedRows;
  }

  /**
   * Exclusão restrita ao autor. A autoria é parte do WHERE, não uma
   * checagem anterior: assim não existe janela entre verificar e apagar.
   */
  async excluir(id, autorId) {
    const [resultado] = await this.pool.execute(
      'DELETE FROM post WHERE id = ? AND user_id = ?',
      [id, autorId]
    );
    return resultado.affectedRows;
  }
    /** Confere se o post existe, sem trazer dados. */
  async existe(id) {
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
  async curtir(id, postId, usuarioId) {
    await this.pool.execute(
      `INSERT INTO like_post (id, post_id, user_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE post_id = post_id`,
      [id, postId, usuarioId]
    );
  }

  /** Remove a curtida. Idempotente: descurtir o que não estava curtido não falha. */
  async descurtir(postId, usuarioId) {
    await this.pool.execute(
      'DELETE FROM like_post WHERE post_id = ? AND user_id = ?',
      [postId, usuarioId]
    );
  }

  /** Recontagem após a operação — o número devolvido vem do banco. */
  async contarCurtidas(postId) {
    const [[{ total }]] = await this.pool.execute(
      'SELECT COUNT(*) AS total FROM like_post WHERE post_id = ?',
      [postId]
    );
    return Number(total);
  }
}

module.exports = PostRepository;