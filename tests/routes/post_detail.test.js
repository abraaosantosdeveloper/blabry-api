const request = require('supertest');
const jwt = require('jsonwebtoken');

/* Identidades fixas: o teste precisa distinguir "quem consulta" de "quem
   escreveu", porque o campo `liked` da resposta é relativo ao visitante. */
const VISITANTE_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const AUTHOR_ID = '01927d4e-1111-7c21-9b44-2f8a1c6d5e91';
const POST_ID = '01927d4e-2222-7c21-9b44-2f8a1c6d5e92';

/* O prefixo "mock" é obrigatório: a fábrica do jest.mock() é içada para o
   topo do arquivo, antes das declarações, e só variáveis com esse prefixo
   podem ser referenciadas lá dentro. */
const mockState = {
  // Argumentos que cada método do repositório recebeu — é assim que
  // verificamos a tradução de "página" em "offset" sem tocar no banco.
  findByIdCalls: [],
  listByAuthorCalls: [],
  post: null,       // o que buscarPorId devolve
  posts: [],        // o que listarDoAutor devolve
  total: 0,
  idByAlias: null, // o que usuariosRepository.findIdByAlias devolve
};

jest.mock('../../repositories/post_repository', () =>
  class PostRepositoryFake {
    async findById(id, viewerId) {
      mockState.findByIdCalls.push({ id, viewerId });
      return mockState.post;
    }
    async listByAuthor(argumentos) {
      mockState.listByAuthorCalls.push(argumentos);
      return { posts: mockState.posts, total: mockState.total };
    }
  }
);

jest.mock('../../repositories/users_repository', () =>
  class UsersRepositoryFake {
    async findIdByAlias() { return mockState.idByAlias; }
  }
);

/* Os demais repositórios são substituídos por classes vazias apenas para
   que o require do server.js não tente abrir conexão com o banco. */
jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFake {});
jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake { async listAll() { return []; } }
);
jest.mock('../../repositories/comment_repository', () => class CommentRepositoryFake {});

const app = require('../../server');

const token = () =>
  jwt.sign({ id: VISITANTE_ID, name: 'Visitante' }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Publicação no formato que o repositório devolveria. */
const fakePost = (id = POST_ID) => ({
  id,
  text: 'primeiro blab',
  author: { name: 'Autor', alias: 'author', photoUrl: null },
  createdAt: '2026-08-30T12:00:00.000Z',
  editedAt: null,
  likes: 3,
  comments: 1,
  liked: false,
});

beforeEach(() => {
  mockState.findByIdCalls = [];
  mockState.listByAuthorCalls = [];
  mockState.post = null;
  mockState.posts = [];
  mockState.total = 0;
  mockState.idByAlias = null;
});

/* ---------------- GET /posts/:id ---------------- */

describe('GET /posts/:id', () => {
  /* Dado: uma publicação existente;
     Quando: o usuário abre a página dedicada dela;
     Então: a API responde 200 com a publicação, author e agregados. */
  it('devolve a publicação com author e contadores', async () => {
    mockState.post = fakePost();

    const res = await request(app)
      .get(`/posts/${POST_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: POST_ID,
      text: 'primeiro blab',
      likes: 3,
      comments: 1,
    });
    expect(res.body.author).toMatchObject({ alias: 'author' });
  });

  /* Dado: um visitante autenticado;
     Quando: ele consulta uma publicação;
     Então: o id que chega ao repositório é o do token, não o da URL —
     é ele que decide o valor de `liked`. */
  it('usa a identidade do token para calcular "liked"', async () => {
    mockState.post = fakePost();

    await request(app)
      .get(`/posts/${POST_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(mockState.findByIdCalls).toEqual([
      { id: POST_ID, viewerId: VISITANTE_ID },
    ]);
  });

  /* Dado: um id que não corresponde a nenhuma publicação visível
     (inexistente ou de conta excluída);
     Quando: a página é aberta;
     Então: a API responde 404. */
  it('responde 404 quando a publicação não existe', async () => {
    mockState.post = null;

    const res = await request(app)
      .get(`/posts/${POST_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(404);
  });

  /* Dado: uma requisição sem token;
     Quando: ela chega à rota;
     Então: 401, e o repositório nem chega a ser consultado. */
  it('exige autenticação', async () => {
    const res = await request(app).get(`/posts/${POST_ID}`);

    expect(res.status).toBe(401);
    expect(mockState.findByIdCalls).toHaveLength(0);
  });
});

/* ---------------- GET /users/:alias/posts ---------------- */

describe('GET /users/:alias/posts', () => {
  /* Dado: um perfil existente com publicações;
     Quando: a seção de publicações do perfil é carregada;
     Então: a API responde 200 com a lista e os dados de paginação. */
  it('devolve as publicações do author com paginação', async () => {
    mockState.idByAlias = AUTHOR_ID;
    mockState.posts = [fakePost('a'), fakePost('b')];
    mockState.total = 2;

    const res = await request(app)
      .get('/users/author/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body).toMatchObject({ page: 1, totalPages: 1, total: 2 });
  });

  /* Dado: um cliente pedindo a segunda página com 5 por página;
     Quando: o service converte página em deslocamento;
     Então: o repositório recebe offset 5 — (2 - 1) × 5. */
  it('converte página em offset antes de chamar o repositório', async () => {
    mockState.idByAlias = AUTHOR_ID;

    await request(app)
      .get('/users/author/posts')
      .query({ page: 2, limit: 5 })
      .set('Authorization', `Bearer ${token()}`);

    expect(mockState.listByAuthorCalls[0]).toMatchObject({
      autorId: AUTHOR_ID,
      viewerId: VISITANTE_ID,
      limit: 5,
      offset: 5,
    });
  });

  /* Dado: um @ copiado com a arroba na frente;
     Quando: ele chega na URL;
     Então: a arroba é removida antes da consulta — ela nunca faz parte do
     valor armazenado. */
  it('aceita o @ com arroba na frente', async () => {
    mockState.idByAlias = AUTHOR_ID;

    const res = await request(app)
      .get('/users/@author/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });

  /* Dado: um @ que não corresponde a nenhum usuário;
     Quando: a seção é carregada;
     Então: 404 — e não uma lista vazia, que afirmaria algo diferente
     ("o usuário existe, mas não publicou nada"). */
  it('responde 404 quando o usuário não existe', async () => {
    mockState.idByAlias = null;

    const res = await request(app)
      .get('/users/fantasma/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(404);
    expect(mockState.listByAuthorCalls).toHaveLength(0);
  });

  /* Dado: um author sem nenhuma publicação;
     Quando: a seção é carregada;
     Então: lista vazia, mas totalPages 1 — "página 1 de 0" não faz
     sentido para quem lê a interface. */
  it('devolve lista vazia com totalPages 1', async () => {
    mockState.idByAlias = AUTHOR_ID;
    mockState.posts = [];
    mockState.total = 0;

    const res = await request(app)
      .get('/users/author/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.body).toMatchObject({ posts: [], page: 1, totalPages: 1, total: 0 });
  });

  /* Dado: um cliente pedindo 100000 itens por página;
     Quando: o valor é normalizado;
     Então: ele é puxado para o teto de 50 — a URL não derruba a instância. */
  it('limita o tamanho da página ao teto', async () => {
    mockState.idByAlias = AUTHOR_ID;

    await request(app)
      .get('/users/author/posts')
      .query({ limit: 100000 })
      .set('Authorization', `Bearer ${token()}`);

    expect(mockState.listByAuthorCalls[0].limit).toBe(50);
  });

  /* Dado: uma requisição sem token;
     Quando: ela chega à rota;
     Então: 401. */
  it('exige autenticação', async () => {
    const res = await request(app).get('/users/author/posts');
    expect(res.status).toBe(401);
  });
});
