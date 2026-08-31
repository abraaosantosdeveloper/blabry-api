const UsuariosRepository = require('../../repositories/users_repository');

/** Pool falso: registra o que foi chamado e devolve linhas controladas. */
function poolFalso(linhas = []) {
  const chamadas = [];
  return {
    chamadas,
    async execute(sql, params) {
      chamadas.push({ sql, params });
      return [linhas];
    },
  };
}

const LINHA = {
  id: 'uuid-1',
  full_name: 'John Doe',
  alias: 'john.doe',
  email: 'john@exemplo.com',
  password_hash: '$2b$12$hash',
  nationality: 'BRA',
  birth_date: '1990-05-14',
  bio: null,
  pic_url: null,
  created_at: '2026-02-01T10:00:00Z',
  deleted_at: null,
  seguidores: '12',
  seguindo: '7',
  seguindo_este: 1,
};

describe('UsuariosRepository.buscarPerfil', () => {
  it('devolve null quando o usuário não existe', async () => {
    const repo = new UsuariosRepository(poolFalso([]));
    expect(await repo.buscarPerfil('alias', 'ninguem')).toBeNull();
  });

  it('passa os parâmetros na ordem dos placeholders', async () => {
    const pool = poolFalso([LINHA]);
    await new UsuariosRepository(pool).buscarPerfil('alias', 'john.doe', 'uuid-visitante');

    // São três "?": seguindo_este, te_segue e o valor do WHERE. O visitante
    // aparece duas vezes porque as duas verificações de relacionamento
    // partem dele, em direções opostas.
    expect(pool.chamadas[0].params).toEqual([
      'uuid-visitante', 'uuid-visitante', 'john.doe',
    ]);
  });

  /* As duas verificações usam as mesmas colunas com os lados trocados.
     Inverter uma delas não gera erro de SQL, só devolve a resposta errada —
     "você segue" viraria "te segue". Daí o teste ler a consulta. */
  it('verifica as duas direções do relacionamento', async () => {
    const pool = poolFalso([LINHA]);
    await new UsuariosRepository(pool).buscarPerfil('alias', 'john.doe', 'uuid-visitante');

    const sql = pool.chamadas[0].sql.replace(/\s+/g, ' ');

    // o visitante segue o dono do perfil
    expect(sql).toMatch(/f\.follower_id = \? AND f\.following_id = u\.id\) AS seguindo_este/);
    // o dono do perfil segue o visitante
    expect(sql).toMatch(/f\.follower_id = u\.id AND f\.following_id = \?\) AS te_segue/);
  });

  it('converte as duas direções em booleano', async () => {
    const repo = new UsuariosRepository(poolFalso([{ ...LINHA, seguindo_este: 1, te_segue: 0 }]));
    const { seguindoEste, teSegue } = await repo.buscarPerfil('id', 'uuid-1', 'uuid-visitante');

    expect(seguindoEste).toBe(true);   // e não 1
    expect(teSegue).toBe(false);       // e não 0
  });

  it('filtra por alias ou por id conforme o campo', async () => {
    const pool = poolFalso([LINHA]);
    const repo = new UsuariosRepository(pool);

    await repo.buscarPerfil('alias', 'john.doe');
    expect(pool.chamadas[0].sql).toContain('u.alias =');

    await repo.buscarPerfil('id', 'uuid-1');
    expect(pool.chamadas[1].sql).toContain('u.id =');
  });

  it('ignora usuários excluídos por soft delete', async () => {
    const pool = poolFalso([LINHA]);
    await new UsuariosRepository(pool).buscarPerfil('id', 'uuid-1');

    expect(pool.chamadas[0].sql).toContain('deleted_at IS NULL');
  });

  it('conta seguidores por following_id e seguindo por follower_id', async () => {
    const pool = poolFalso([LINHA]);
    await new UsuariosRepository(pool).buscarPerfil('id', 'uuid-1');

    const sql = pool.chamadas[0].sql.replace(/\s+/g, ' ');
    expect(sql).toMatch(/f\.following_id = u\.id\) AS seguidores/);
    expect(sql).toMatch(/f\.follower_id\s+= u\.id\) AS seguindo/);
  });

  it('converte os contadores em número e a existência em booleano', async () => {
    const repo = new UsuariosRepository(poolFalso([LINHA]));
    const { seguidores, seguindo, seguindoEste, usuario } = await repo.buscarPerfil('id', 'uuid-1');

    expect(seguidores).toBe(12);
    expect(seguindo).toBe(7);
    expect(seguindoEste).toBe(true);
    expect(usuario.nome).toBe('John Doe');
  });
});