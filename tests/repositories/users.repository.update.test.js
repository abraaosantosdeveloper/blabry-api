const UsersRepository = require('../../repositories/users_repository');

function fakePool(resultado = { affectedRows: 1 }) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [resultado];
    },
  };
}

describe('UsersRepository.update — lista branca de colunas', () => {
  it('traduz os campos da API para as colunas do banco', async () => {
    const pool = fakePool();
    await new UsersRepository(pool).update('uuid-1', {
      name: 'Novo Nome',
      bio: 'Uma bio.',
    });

    const { sql, params } = pool.chamadas[0];
    expect(sql).toContain('full_name = ?');
    expect(sql).toContain('bio = ?');
    expect(params).toEqual(['Novo Nome', 'Uma bio.', 'uuid-1']);
  });

  /* Atribuição em massa — o teste mais importante deste arquivo */
  it('descarta campos que não estão na lista branca', async () => {
    const pool = fakePool();
    await new UsersRepository(pool).update('uuid-1', {
      name: 'Legítimo',
      password_hash: '$2b$12$invasor',
      id: 'outro-uuid',
      deleted_at: '2020-01-01',
    });

    const { sql, params } = pool.chamadas[0];
    expect(sql).not.toContain('password_hash');
    expect(sql).not.toContain('deleted_at = ');
    expect(sql).not.toContain('id = ?,');
    expect(params).toEqual(['Legítimo', 'uuid-1']);
  });

  it('ignora propriedades herdadas do protótipo', async () => {
    const pool = fakePool();
    await new UsersRepository(pool).update('uuid-1', {
      name: 'Legítimo',
      constructor: 'x',
      toString: 'y',
    });

    expect(pool.chamadas[0].params).toEqual(['Legítimo', 'uuid-1']);
  });

  it('não executa consulta quando nenhum campo é válido', async () => {
    const pool = fakePool();
    const rows = await new UsersRepository(pool).update('uuid-1', { hackeado: true });

    expect(rows).toBe(0);
    expect(pool.chamadas).toHaveLength(0);
  });

  it('restringe a atualização ao próprio usuário e ignora contas excluídas', async () => {
    const pool = fakePool();
    await new UsersRepository(pool).update('uuid-1', { bio: 'x' });

    const sql = pool.chamadas[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain('WHERE id = ?');
    expect(sql).toContain('deleted_at IS NULL');
  });
});

describe('UsersRepository.emailInUse', () => {
  it('exclui o próprio usuário da checagem', async () => {
    const pool = fakePool([]);
    await new UsersRepository(pool).emailInUse('a@b.c', 'uuid-1');

    expect(pool.chamadas[0].sql).toContain('id <> ?');
    expect(pool.chamadas[0].params).toEqual(['a@b.c', 'uuid-1']);
  });
});