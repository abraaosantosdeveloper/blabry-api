const PostRepository = require('../../repositories/post_repository');

/**
 * Pool falso: registra cada consulta executada e devolve rows controladas.
 *
 * Permite verificar o SQL montado e — o que mais importa aqui — a ordem dos
 * parâmetros, sem banco algum. Ordem de parâmetro é o tipo de error que não
 * quebra nada: a consulta roda, só devolve a resposta errada.
 */
function fakePool(rows = [], total = 0) {
  const calls = [];
  let vez = 0;

  return {
    calls,
    async execute(sql, params) {
      // Normaliza os espaços para que a asserção não dependa da indentação.
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      vez += 1;
      // A primeira chamada é a listagem; a segunda é a contagem.
      return vez === 1 ? [rows] : [[{ total: String(total) }]];
    },
  };
}

/** Linha crua, no formato snake_case que vem do MySQL. */
const LINHA = {
  id: 'post-1',
  user_id: 'author-1',
  content: 'primeiro blab',
  created_at: '2026-08-30T12:00:00.000Z',
  edited_at: null,
  full_name: 'Abraão Santos',
  alias: 'abraaosantosdev',
  pic_url: null,
  likes: '2',
  comments: '0',
  liked: 1,
};

describe('PostRepository.listByAuthor', () => {
  /* Dado: uma listagem das publicações de um author;
     Quando: a consulta é montada;
     Então: o id do visitante vem antes do id do author, porque o "?" dos
     agregados (o EXISTS que diz se o visitante curtiu) aparece antes do "?"
     do WHERE no SQL. */
  it('passa os parâmetros na ordem dos placeholders', async () => {
    const pool = fakePool([LINHA], 1);

    await new PostRepository(pool).listByAuthor({
      autorId: 'author-1',
      viewerId: 'visitante-1',
    });

    expect(pool.calls[0].params).toEqual(['visitante-1', 'author-1']);
  });

  /* Dado: a mesma listagem;
     Quando: a contagem total é feita;
     Então: ela recebe apenas o author — a contagem não depende de quem olha. */
  it('conta o total usando apenas o id do author', async () => {
    const pool = fakePool([LINHA], 7);

    const { total } = await new PostRepository(pool).listByAuthor({
      autorId: 'author-1',
      viewerId: 'visitante-1',
    });

    expect(pool.calls[1].params).toEqual(['author-1']);
    // O MySQL devolve COUNT como string; o repositório precisa converter.
    expect(total).toBe(7);
  });

  /* Dado: uma conta de author excluída;
     Quando: a listagem é montada;
     Então: o filtro deleted_at IS NULL está presente nas duas consultas —
     publicação de conta apagada não reaparece pelo perfil. */
  it('exclui autores removidos nas duas consultas', async () => {
    const pool = fakePool([], 0);

    await new PostRepository(pool).listByAuthor({
      autorId: 'author-1',
      viewerId: 'visitante-1',
    });

    expect(pool.calls[0].sql).toContain('u.deleted_at IS NULL');
    expect(pool.calls[1].sql).toContain('u.deleted_at IS NULL');
  });

  /* Dado: LIMIT e OFFSET, que o MySQL não aceita como placeholder e por
     isso são interpolados no SQL;
     Quando: chega qualquer coisa que não seja inteiro;
     Então: o método falha antes de montar a consulta. É essa checagem que
     torna a interpolação segura. */
  it.each([
    ['limit não inteiro', { limit: '10; DROP TABLE post', offset: 0 }],
    ['offset não inteiro', { limit: 10, offset: 1.5 }],
  ])('recusa %s', async (_rotulo, range) => {
    const pool = fakePool();

    await expect(
      new PostRepository(pool).listByAuthor({
        autorId: 'author-1',
        viewerId: 'visitante-1',
        ...faixa,
      })
    ).rejects.toThrow(TypeError);

    // Nada chegou a ser executado: a barreira é anterior à consulta.
    expect(pool.calls).toHaveLength(0);
  });

  /* Dado: rows cruas do MySQL;
     Quando: elas voltam do banco;
     Então: são convertidas em instâncias de Post, com o author aninhado —
     o repositório é a fronteira onde snake_case vira camelCase. */
  it('converte as rows em objetos de domínio', async () => {
    const pool = fakePool([LINHA], 1);

    const { posts } = await new PostRepository(pool).listByAuthor({
      autorId: 'author-1',
      viewerId: 'visitante-1',
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].text).toBe('primeiro blab');
  });

  /* Dado: a ordenação da seção de publicações do perfil;
     Quando: a consulta é montada;
     Então: é cronológica decrescente, com o id como desempate — sem ele,
     dois posts do mesmo segundo poderiam trocar de lugar entre páginas e
     um deles sumiria da paginação. */
  it('ordena do mais recente para o mais antigo, com desempate estável', async () => {
    const pool = fakePool([], 0);

    await new PostRepository(pool).listByAuthor({
      autorId: 'author-1',
      viewerId: 'visitante-1',
    });

    expect(pool.calls[0].sql).toContain('ORDER BY p.created_at DESC, p.id DESC');
  });
});
