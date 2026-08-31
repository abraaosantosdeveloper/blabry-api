const request = require('supertest');
const jwt = require('jsonwebtoken');

const USER_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const OUTRO_ID = '01927d4e-aaaa-7c21-9b44-2f8a1c6d5e91';

/* Prefixo "mock" obrigatório: a fábrica do jest.mock() é içada para o topo
   do arquivo e só enxerga variáveis com esse prefixo. */
const mockState = {
  idByAlias: { outrousuario: OUTRO_ID, eu: USER_ID },
  followers: 7,
  calls: [],
};

jest.mock('../../repositories/users_repository', () =>
  class UsersRepositoryFake {
    async findIdByAlias(alias) {
      return mockState.idPorAlias[alias] ?? null;
    }
    async follow(id, seguidorId, seguidoId) {
      mockState.chamadas.push({ acao: 'seguir', id, seguidorId, seguidoId });
    }
    async unfollow(seguidorId, seguidoId) {
      mockState.chamadas.push({ acao: 'deixarDeSeguir', seguidorId, seguidoId });
    }
    async countFollowers() {
      return mockState.followers;
    }
    async findProfile() { return null; }
    async search() { return { users: [], total: 0 }; }
  }
);

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake {
    async listAll() { return []; }
    async exists() { return true; }
  }
);

jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFake {});
jest.mock('../../repositories/post_repository', () => class PostRepositoryFake {});
jest.mock('../../repositories/comment_repository', () => class CommentRepositoryFake {});

const app = require('../../server');

const token = () =>
  jwt.sign({ id: USER_ID, name: 'Teste' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const seguir = (alias) =>
  request(app).post(`/users/${alias}/follow`).set('Authorization', `Bearer ${token()}`);

const deixarDeSeguir = (alias) =>
  request(app).delete(`/users/${alias}/follow`).set('Authorization', `Bearer ${token()}`);

beforeEach(() => {
  mockState.chamadas = [];
  mockState.followers = 7;
});

describe('POST /users/:alias/follow', () => {
  it('exige token', async () => {
    const res = await request(app).post('/users/outrousuario/follow');
    expect(res.status).toBe(401);
  });

  it('segue e devolve o total recontado', async () => {
    const res = await seguir('outrousuario');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: true, followers: 7 });
  });

  /* Quem segue vem do token; quem é seguido vem da URL. */
  it('usa o usuário do token como seguidor', async () => {
    await seguir('outrousuario');

    expect(mockState.chamadas[0]).toMatchObject({
      acao: 'seguir',
      seguidorId: USER_ID,
      seguidoId: OUTRO_ID,
    });
  });

  it('aceita o @ escrito com arroba na URL', async () => {
    const res = await seguir('%40outrousuario');   // "@outrousuario" codificado

    expect(res.status).toBe(200);
    expect(mockState.chamadas[0].seguidoId).toBe(OUTRO_ID);
  });

  it('responde 404 para alias inexistente', async () => {
    const res = await seguir('ninguem');

    expect(res.status).toBe(404);
    expect(mockState.chamadas).toHaveLength(0);
  });

  /* A restrição UNIQUE não pega este scenario: o par seria válido no banco. */
  it('responde 400 ao tentar seguir a si mesmo', async () => {
    const res = await seguir('eu');

    expect(res.status).toBe(400);
    expect(mockState.chamadas).toHaveLength(0);
  });

  it('gera um identificador para a row de relacionamento', async () => {
    await seguir('outrousuario');

    expect(mockState.chamadas[0].id).toEqual(expect.any(String));
    expect(mockState.chamadas[0].id.length).toBe(36);   // UUID
  });
});

describe('DELETE /users/:alias/follow', () => {
  it('deixa de seguir e devolve o total recontado', async () => {
    mockState.followers = 6;
    const res = await deixarDeSeguir('outrousuario');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ following: false, followers: 6 });
  });

  it('chama o repositório com seguidor e seguido na ordem correta', async () => {
    await deixarDeSeguir('outrousuario');

    expect(mockState.chamadas[0]).toMatchObject({
      acao: 'deixarDeSeguir',
      seguidorId: USER_ID,
      seguidoId: OUTRO_ID,
    });
  });

  it('responde 404 para alias inexistente', async () => {
    const res = await deixarDeSeguir('ninguem');
    expect(res.status).toBe(404);
  });
});
