const PostRepository = require('../../repositories/post_repository');

/**
 * Pool falso: registra cada consulta executada e devolve linhas controladas.
 *
 * Permite verificar o SQL montado e — o que mais importa aqui — a ordem dos
 * parâmetros, sem banco algum. Ordem de parâmetro é o tipo de erro que não
 * quebra nada: a consulta roda, só devolve a resposta errada.
 */
function poolFalso(linhas = [], total = 0) {
  const chamadas = [];
  let vez = 0;

  return {
    chamadas,
    async execute(sql, params) {
      // Normaliza os espaços para que a asserção não dependa da indentação.
      chamadas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      vez += 1;
      // A primeira chamada é a listagem; a segunda é a contagem.
      return vez === 1 ? [linhas] : [[{ total: String(total) }]];
    },
  };
}

/** Linha crua, no formato snake_case que vem do MySQL. */
const LINHA = {
  id: 'post-1',
  user_id: 'autor-1',
  content: 'primeiro blab',
  created_at: '2026-08-30T12:00:00.000Z',
  edited_at: null,
  full_name: 'Abraão Santos',
  alias: 'abraaosantosdev',
  pic_url: null,
  curtidas: '2',
  comentarios: '0',
  curtido: 1,
};

describe('PostRepository.listarDoAutor', () => {
  /* Dado: uma listagem das publicações de um autor;
     Quando: a consulta é montada;
     Então: o id do visitante vem antes do id do autor, porque o "?" dos
     agregados (o EXISTS que diz se o visitante curtiu) aparece antes do "?"
     do WHERE no SQL. */
  it('passa os parâmetros na ordem dos placeholders', async () => {
    const pool = poolFalso([LINHA], 1);

    await new PostRepository(pool).listarDoAutor({
      autorId: 'autor-1',
      visitanteId: 'visitante-1',
    });

    expect(pool.chamadas[0].params).toEqual(['visitante-1', 'autor-1']);
  });

  /* Dado: a mesma listagem;
     Quando: a contagem total é feita;
     Então: ela recebe apenas o autor — a contagem não depende de quem olha. */
  it('conta o total usando apenas o id do autor', async () => {
    const pool = poolFalso([LINHA], 7);

    const { total } = await new PostRepository(pool).listarDoAutor({
      autorId: 'autor-1',
      visitanteId: 'visitante-1',
    });

    expect(pool.chamadas[1].params).toEqual(['autor-1']);
    // O MySQL devolve COUNT como string; o repositório precisa converter.
    expect(total).toBe(7);
  });

  /* Dado: uma conta de autor excluída;
     Quando: a listagem é montada;
     Então: o filtro deleted_at IS NULL está presente nas duas consultas —
     publicação de conta apagada não reaparece pelo perfil. */
  it('exclui autores removidos nas duas consultas', async () => {
    const pool = poolFalso([], 0);

    await new PostRepository(pool).listarDoAutor({
      autorId: 'autor-1',
      visitanteId: 'visitante-1',
    });

    expect(pool.chamadas[0].sql).toContain('u.deleted_at IS NULL');
    expect(pool.chamadas[1].sql).toContain('u.deleted_at IS NULL');
  });

  /* Dado: LIMIT e OFFSET, que o MySQL não aceita como placeholder e por
     isso são interpolados no SQL;
     Quando: chega qualquer coisa que não seja inteiro;
     Então: o método falha antes de montar a consulta. É essa checagem que
     torna a interpolação segura. */
  it.each([
    ['limite não inteiro', { limite: '10; DROP TABLE post', offset: 0 }],
    ['offset não inteiro', { limite: 10, offset: 1.5 }],
  ])('recusa %s', async (_rotulo, faixa) => {
    const pool = poolFalso();

    await expect(
      new PostRepository(pool).listarDoAutor({
        autorId: 'autor-1',
        visitanteId: 'visitante-1',
        ...faixa,
      })
    ).rejects.toThrow(TypeError);

    // Nada chegou a ser executado: a barreira é anterior à consulta.
    expect(pool.chamadas).toHaveLength(0);
  });

  /* Dado: linhas cruas do MySQL;
     Quando: elas voltam do banco;
     Então: são convertidas em instâncias de Post, com o autor aninhado —
     o repositório é a fronteira onde snake_case vira camelCase. */
  it('converte as linhas em objetos de domínio', async () => {
    const pool = poolFalso([LINHA], 1);

    const { posts } = await new PostRepository(pool).listarDoAutor({
      autorId: 'autor-1',
      visitanteId: 'visitante-1',
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].texto).toBe('primeiro blab');
  });

  /* Dado: a ordenação da seção de publicações do perfil;
     Quando: a consulta é montada;
     Então: é cronológica decrescente, com o id como desempate — sem ele,
     dois posts do mesmo segundo poderiam trocar de lugar entre páginas e
     um deles sumiria da paginação. */
  it('ordena do mais recente para o mais antigo, com desempate estável', async () => {
    const pool = poolFalso([], 0);

    await new PostRepository(pool).listarDoAutor({
      autorId: 'autor-1',
      visitanteId: 'visitante-1',
    });

    expect(pool.chamadas[0].sql).toContain('ORDER BY p.created_at DESC, p.id DESC');
  });
});
