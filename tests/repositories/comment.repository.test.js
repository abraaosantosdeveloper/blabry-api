const CommentRepository = require('../../repositories/comment_repository');
const Comment = require('../../models/comment');

/**
 * Pool falso: registra cada consulta e devolve rows controladas.
 *
 * A sequência importa. `create` faz duas idas ao banco — o INSERT e, logo
 * depois, a releitura do comentário gravado —, e é justamente a segunda que
 * um dia deixou de existir: o método chamava `this.buscarPorId`, nome que a
 * tradução da API para o inglês aposentou. O INSERT passava, a releitura
 * estourava, e o usuário recebia "erro interno do servidor" com o comentário
 * já gravado no banco.
 */
function fakePool(rowsPorChamada = []) {
  const calls = [];
  let vez = 0;

  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const resposta = rowsPorChamada[vez] ?? [];
      vez += 1;
      return [resposta];
    },
  };
}

/** Linha crua, no formato snake_case que vem do MySQL. */
const LINHA = {
  id: 'comment-1',
  post_id: 'post-1',
  user_id: 'author-1',
  content: 'primeiro comentário',
  created_at: '2026-08-30T12:00:00.000Z',
  edited_at: null,
  full_name: 'Abraão Santos',
  alias: 'abraaosantosdev',
  pic_url: null,
};

describe('CommentRepository.create', () => {
  /* Dado: um comentário novo;
     Quando: ele é gravado;
     Então: o repositório devolve o comentário já montado, e não apenas o
     resultado do INSERT — a interface precisa do autor e da data para
     renderizar a linha sem recarregar a lista. */
  it('devolve o comentário gravado, relendo-o do banco', async () => {
    const pool = fakePool([[], [LINHA]]);
    const repositorio = new CommentRepository(pool);

    const comentario = await repositorio.create(new Comment({
      id: 'comment-1',
      text: 'primeiro comentário',
      postId: 'post-1',
      authorId: 'author-1',
    }));

    expect(pool.calls).toHaveLength(2);
    expect(pool.calls[0].sql).toMatch(/^INSERT INTO comment/);
    expect(pool.calls[1].sql).toMatch(/^SELECT/);
    expect(pool.calls[1].params).toEqual(['comment-1']);

    expect(comentario).toBeInstanceOf(Comment);
    expect(comentario.author.alias).toBe('abraaosantosdev');
    expect(comentario.toJSON()).toMatchObject({
      id: 'comment-1',
      text: 'primeiro comentário',
    });
  });

  /* Dado: o mesmo comentário;
     Quando: o INSERT é montado;
     Então: os parâmetros seguem a ordem das colunas declaradas. Ordem
     trocada é o erro que não quebra nada: a consulta roda e grava o
     conteúdo na coluna errada. */
  it('envia os parâmetros do INSERT na ordem das colunas', async () => {
    const pool = fakePool([[], [LINHA]]);
    const repositorio = new CommentRepository(pool);

    await repositorio.create(new Comment({
      id: 'comment-1',
      text: 'primeiro comentário',
      postId: 'post-1',
      authorId: 'author-1',
    }));

    expect(pool.calls[0].params).toEqual([
      'comment-1', 'post-1', 'author-1', 'primeiro comentário',
    ]);
  });
});

describe('CommentRepository.remove', () => {
  /* Dado: um pedido de remoção;
     Quando: a consulta é montada;
     Então: a autoria vai no WHERE, junto com o id. Verificar antes e
     apagar depois abriria uma janela entre as duas operações. */
  it('exige id e autor no WHERE', async () => {
    const pool = {
      calls: [],
      async execute(sql, params) {
        this.calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return [{ affectedRows: 1 }];
      },
    };

    const removidos = await new CommentRepository(pool).remove('comment-1', 'author-1');

    expect(removidos).toBe(1);
    expect(pool.calls[0].sql).toBe(
      'DELETE FROM comment WHERE id = ? AND user_id = ?'
    );
    expect(pool.calls[0].params).toEqual(['comment-1', 'author-1']);
  });
});
