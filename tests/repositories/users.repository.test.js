const UsersRepository = require('../../repositories/users_repository');

/** Pool falso: registra o que foi chamado e devolve rows controladas. */
function fakePool(rows = []) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [rows];
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
  followers: '12',
  following: '7',
  is_following: 1,
};

describe('UsersRepository.findProfile', () => {
  it('devolve null quando o usuário não existe', async () => {
    const repo = new UsersRepository(fakePool([]));
    expect(await repo.findProfile('alias', 'ninguem')).toBeNull();
  });

  it('passa os parâmetros na ordem dos placeholders', async () => {
    const pool = fakePool([LINHA]);
    await new UsersRepository(pool).findProfile('alias', 'john.doe', 'uuid-visitante');

    // São três "?": is_following, follows_you e o valor do WHERE. O visitante
    // aparece duas vezes porque as duas verificações de relacionamento
    // partem dele, em direções opostas.
    expect(pool.calls[0].params).toEqual([
      'uuid-visitante', 'uuid-visitante', 'john.doe',
    ]);
  });

  /* As duas verificações usam as mesmas colunas com os lados trocados.
     Inverter uma delas não gera error de SQL, só devolve a resposta errada —
     "você segue" viraria "te segue". Daí o teste ler a consulta. */
  it('verifica as duas direções do relacionamento', async () => {
    const pool = fakePool([LINHA]);
    await new UsersRepository(pool).findProfile('alias', 'john.doe', 'uuid-visitante');

    const sql = pool.calls[0].sql.replace(/\s+/g, ' ');

    // o visitante segue o dono do perfil
    expect(sql).toMatch(/f\.follower_id = \? AND f\.following_id = u\.id\) AS is_following/);
    // o dono do perfil segue o visitante
    expect(sql).toMatch(/f\.follower_id = u\.id AND f\.following_id = \?\) AS follows_you/);
  });

  it('converte as duas direções em booleano', async () => {
    const repo = new UsersRepository(fakePool([{ ...LINHA, is_following: 1, follows_you: 0 }]));
    const { isFollowing, followsYou } = await repo.findProfile('id', 'uuid-1', 'uuid-visitante');

    expect(isFollowing).toBe(true);   // e não 1
    expect(followsYou).toBe(false);       // e não 0
  });

  it('filtra por alias ou por id conforme o campo', async () => {
    const pool = fakePool([LINHA]);
    const repo = new UsersRepository(pool);

    await repo.findProfile('alias', 'john.doe');
    expect(pool.calls[0].sql).toContain('u.alias =');

    await repo.findProfile('id', 'uuid-1');
    expect(pool.calls[1].sql).toContain('u.id =');
  });

  it('ignora usuários excluídos por soft delete', async () => {
    const pool = fakePool([LINHA]);
    await new UsersRepository(pool).findProfile('id', 'uuid-1');

    expect(pool.calls[0].sql).toContain('deleted_at IS NULL');
  });

  it('conta followers por following_id e following por follower_id', async () => {
    const pool = fakePool([LINHA]);
    await new UsersRepository(pool).findProfile('id', 'uuid-1');

    const sql = pool.calls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toMatch(/f\.following_id = u\.id\) AS followers/);
    expect(sql).toMatch(/f\.follower_id\s+= u\.id\) AS following/);
  });

  it('converte os contadores em número e a existência em booleano', async () => {
    const repo = new UsersRepository(fakePool([LINHA]));
    const { followers, following, isFollowing, user } = await repo.findProfile('id', 'uuid-1');

    expect(followers).toBe(12);
    expect(following).toBe(7);
    expect(isFollowing).toBe(true);
    expect(user.name).toBe('John Doe');
  });
});