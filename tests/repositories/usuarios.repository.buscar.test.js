const UsuariosRepository = require('../../repositories/usuarios_repository');

/**
 * Pool falso: registra cada consulta executada e devolve linhas controladas.
 * Permite verificar o SQL montado e a ordem dos parâmetros sem banco algum.
 */
function poolFalso(linhas = [], total = 0) {
  const chamadas = [];
  let vez = 0;

  return {
    chamadas,
    async execute(sql, params) {
      chamadas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      // A primeira chamada é a listagem; a segunda é a contagem.
      vez += 1;
      return vez === 1 ? [linhas] : [[{ total: String(total) }]];
    },
  };
}

const LINHA = {
  id: 'uuid-2',
  full_name: 'Abraão Santos',
  alias: 'abraaosantosdev',
  pic_url: null,
  bio: 'Desenvolvedor Node.js',
};

describe('UsuariosRepository.buscar — montagem da consulta', () => {
  it('passa os parâmetros na mesma ordem dos placeholders', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'abra', visitanteId: 'uuid-1' });

    // visitante, alias LIKE prefixo, nome LIKE conteúdo, alias exato, alias LIKE prefixo
    expect(pool.chamadas[0].params).toEqual([
      'uuid-1', 'abra%', '%abra%', 'abra', 'abra%',
    ]);
  });

  /* Com SQL montado condicionalmente, errar a ordem não gera erro de sintaxe:
     gera resultado errado em silêncio. Por isso conferimos a contagem. */
  it('tem tantos parâmetros quantos placeholders, nas duas consultas', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'abra', visitanteId: 'uuid-1' });

    for (const { sql, params } of pool.chamadas) {
      expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
    }
  });

  it('exclui o próprio usuário dos resultados', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'abra', visitanteId: 'uuid-1' });

    expect(pool.chamadas[0].sql).toContain('u.id <> ?');
    expect(pool.chamadas[0].params[0]).toBe('uuid-1');
  });

  it('ignora contas excluídas por soft delete', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'abra', visitanteId: 'uuid-1' });

    expect(pool.chamadas[0].sql).toContain('deleted_at IS NULL');
    expect(pool.chamadas[1].sql).toContain('deleted_at IS NULL');
  });

  /* A contagem precisa das mesmas condições da listagem: se divergirem, a
     paginação anuncia páginas que não existem. */
  it('conta com o mesmo filtro da listagem', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'abra', visitanteId: 'uuid-1' });

    const [busca, contagem] = pool.chamadas;
    for (const condicao of ['deleted_at IS NULL', 'u.id <> ?', 'u.alias LIKE ?', 'u.full_name LIKE ?']) {
      expect(busca.sql).toContain(condicao);
      expect(contagem.sql).toContain(condicao);
    }
  });

  it('busca o @ por prefixo e o nome por conteúdo', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'santos', visitanteId: 'uuid-1' });

    const [, prefixoAlias, conteudoNome] = pool.chamadas[0].params;
    expect(prefixoAlias).toBe('santos%');   // índice funciona: curinga só no fim
    expect(conteudoNome).toBe('%santos%');  // acha "Santos" em "Abraão Santos"
  });

  it('ordena o @ exato antes dos demais', async () => {
    const pool = poolFalso([LINHA], 1);
    await new UsuariosRepository(pool).buscar({ q: 'abra', visitanteId: 'uuid-1' });

    expect(pool.chamadas[0].sql).toMatch(/ORDER BY CASE/);
    expect(pool.chamadas[0].sql).toContain('WHEN u.alias = ? THEN 0');
  });

  it('aplica limite e deslocamento recebidos', async () => {
    const pool = poolFalso([LINHA], 30);
    await new UsuariosRepository(pool).buscar({
      q: 'abra', visitanteId: 'uuid-1', limite: 8, offset: 16,
    });

    expect(pool.chamadas[0].sql).toContain('LIMIT 8 OFFSET 16');
  });

  /* LIMIT e OFFSET são interpolados na string porque o MySQL não os aceita
     como placeholder. Esta checagem é o que impede qualquer coisa que não
     seja inteiro de chegar ao SQL. */
  it('recusa limite ou deslocamento não inteiros', async () => {
    const repo = new UsuariosRepository(poolFalso());

    await expect(repo.buscar({ q: 'a', visitanteId: 'u', limite: '8; DROP TABLE user' }))
      .rejects.toThrow(TypeError);

    await expect(repo.buscar({ q: 'a', visitanteId: 'u', offset: 1.5 }))
      .rejects.toThrow(TypeError);
  });
});

describe('UsuariosRepository.buscar — formato do retorno', () => {
  it('devolve apenas os campos que a listagem precisa', async () => {
    const repo = new UsuariosRepository(poolFalso([LINHA], 1));
    const { usuarios, total } = await repo.buscar({ q: 'abra', visitanteId: 'uuid-1' });

    expect(usuarios).toEqual([{
      nome: 'Abraão Santos',
      alias: 'abraaosantosdev',
      fotoUrl: null,
      bio: 'Desenvolvedor Node.js',
    }]);
    expect(total).toBe(1);
  });

  it('não expõe o identificador interno do usuário', async () => {
    const repo = new UsuariosRepository(poolFalso([LINHA], 1));
    const { usuarios } = await repo.buscar({ q: 'abra', visitanteId: 'uuid-1' });

    expect(usuarios[0]).not.toHaveProperty('id');
  });

  it('converte o total em número', async () => {
    const repo = new UsuariosRepository(poolFalso([LINHA], 42));
    const { total } = await repo.buscar({ q: 'abra', visitanteId: 'uuid-1' });

    expect(total).toBe(42);          // e não "42"
    expect(typeof total).toBe('number');
  });
});
