const request = require('supertest');
const jwt = require('jsonwebtoken');

/* Identidades fixas: o teste precisa distinguir "quem consulta" de "quem
   escreveu", porque o campo `curtido` da resposta é relativo ao visitante. */
const VISITANTE_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const AUTOR_ID = '01927d4e-1111-7c21-9b44-2f8a1c6d5e91';
const POST_ID = '01927d4e-2222-7c21-9b44-2f8a1c6d5e92';

/* O prefixo "mock" é obrigatório: a fábrica do jest.mock() é içada para o
   topo do arquivo, antes das declarações, e só variáveis com esse prefixo
   podem ser referenciadas lá dentro. */
const mockEstado = {
  // Argumentos que cada método do repositório recebeu — é assim que
  // verificamos a tradução de "página" em "offset" sem tocar no banco.
  chamadasBuscarPorId: [],
  chamadasListarDoAutor: [],
  post: null,       // o que buscarPorId devolve
  posts: [],        // o que listarDoAutor devolve
  total: 0,
  idPorAlias: null, // o que usuariosRepository.buscarIdPorAlias devolve
};

jest.mock('../../repositories/post_repository', () =>
  class PostRepositoryFalso {
    async buscarPorId(id, visitanteId) {
      mockEstado.chamadasBuscarPorId.push({ id, visitanteId });
      return mockEstado.post;
    }
    async listarDoAutor(argumentos) {
      mockEstado.chamadasListarDoAutor.push(argumentos);
      return { posts: mockEstado.posts, total: mockEstado.total };
    }
  }
);

jest.mock('../../repositories/usuarios_repository', () =>
  class UsuariosRepositoryFalso {
    async buscarIdPorAlias() { return mockEstado.idPorAlias; }
  }
);

/* Os demais repositórios são substituídos por classes vazias apenas para
   que o require do server.js não tente abrir conexão com o banco. */
jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFalso {});
jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso { async listarPaises() { return []; } }
);
jest.mock('../../repositories/comment_repository', () => class CommentRepositoryFalso {});

const app = require('../../server');

const token = () =>
  jwt.sign({ id: VISITANTE_ID, nome: 'Visitante' }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Publicação no formato que o repositório devolveria. */
const postFalso = (id = POST_ID) => ({
  id,
  texto: 'primeiro blab',
  autor: { nome: 'Autor', alias: 'autor', fotoUrl: null },
  criadoEm: '2026-08-30T12:00:00.000Z',
  editadoEm: null,
  curtidas: 3,
  comentarios: 1,
  curtido: false,
});

beforeEach(() => {
  mockEstado.chamadasBuscarPorId = [];
  mockEstado.chamadasListarDoAutor = [];
  mockEstado.post = null;
  mockEstado.posts = [];
  mockEstado.total = 0;
  mockEstado.idPorAlias = null;
});

/* ---------------- GET /posts/:id ---------------- */

describe('GET /posts/:id', () => {
  /* Dado: uma publicação existente;
     Quando: o usuário abre a página dedicada dela;
     Então: a API responde 200 com a publicação, autor e agregados. */
  it('devolve a publicação com autor e contadores', async () => {
    mockEstado.post = postFalso();

    const res = await request(app)
      .get(`/posts/${POST_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: POST_ID,
      texto: 'primeiro blab',
      curtidas: 3,
      comentarios: 1,
    });
    expect(res.body.autor).toMatchObject({ alias: 'autor' });
  });

  /* Dado: um visitante autenticado;
     Quando: ele consulta uma publicação;
     Então: o id que chega ao repositório é o do token, não o da URL —
     é ele que decide o valor de `curtido`. */
  it('usa a identidade do token para calcular "curtido"', async () => {
    mockEstado.post = postFalso();

    await request(app)
      .get(`/posts/${POST_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(mockEstado.chamadasBuscarPorId).toEqual([
      { id: POST_ID, visitanteId: VISITANTE_ID },
    ]);
  });

  /* Dado: um id que não corresponde a nenhuma publicação visível
     (inexistente ou de conta excluída);
     Quando: a página é aberta;
     Então: a API responde 404. */
  it('responde 404 quando a publicação não existe', async () => {
    mockEstado.post = null;

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
    expect(mockEstado.chamadasBuscarPorId).toHaveLength(0);
  });
});

/* ---------------- GET /users/:alias/posts ---------------- */

describe('GET /users/:alias/posts', () => {
  /* Dado: um perfil existente com publicações;
     Quando: a seção de publicações do perfil é carregada;
     Então: a API responde 200 com a lista e os dados de paginação. */
  it('devolve as publicações do autor com paginação', async () => {
    mockEstado.idPorAlias = AUTOR_ID;
    mockEstado.posts = [postFalso('a'), postFalso('b')];
    mockEstado.total = 2;

    const res = await request(app)
      .get('/users/autor/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body).toMatchObject({ pagina: 1, totalPaginas: 1, total: 2 });
  });

  /* Dado: um cliente pedindo a segunda página com 5 por página;
     Quando: o service converte página em deslocamento;
     Então: o repositório recebe offset 5 — (2 - 1) × 5. */
  it('converte página em offset antes de chamar o repositório', async () => {
    mockEstado.idPorAlias = AUTOR_ID;

    await request(app)
      .get('/users/autor/posts')
      .query({ pagina: 2, limite: 5 })
      .set('Authorization', `Bearer ${token()}`);

    expect(mockEstado.chamadasListarDoAutor[0]).toMatchObject({
      autorId: AUTOR_ID,
      visitanteId: VISITANTE_ID,
      limite: 5,
      offset: 5,
    });
  });

  /* Dado: um @ copiado com a arroba na frente;
     Quando: ele chega na URL;
     Então: a arroba é removida antes da consulta — ela nunca faz parte do
     valor armazenado. */
  it('aceita o @ com arroba na frente', async () => {
    mockEstado.idPorAlias = AUTOR_ID;

    const res = await request(app)
      .get('/users/@autor/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });

  /* Dado: um @ que não corresponde a nenhum usuário;
     Quando: a seção é carregada;
     Então: 404 — e não uma lista vazia, que afirmaria algo diferente
     ("o usuário existe, mas não publicou nada"). */
  it('responde 404 quando o usuário não existe', async () => {
    mockEstado.idPorAlias = null;

    const res = await request(app)
      .get('/users/fantasma/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(404);
    expect(mockEstado.chamadasListarDoAutor).toHaveLength(0);
  });

  /* Dado: um autor sem nenhuma publicação;
     Quando: a seção é carregada;
     Então: lista vazia, mas totalPaginas 1 — "página 1 de 0" não faz
     sentido para quem lê a interface. */
  it('devolve lista vazia com totalPaginas 1', async () => {
    mockEstado.idPorAlias = AUTOR_ID;
    mockEstado.posts = [];
    mockEstado.total = 0;

    const res = await request(app)
      .get('/users/autor/posts')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.body).toMatchObject({ posts: [], pagina: 1, totalPaginas: 1, total: 0 });
  });

  /* Dado: um cliente pedindo 100000 itens por página;
     Quando: o valor é normalizado;
     Então: ele é puxado para o teto de 50 — a URL não derruba a instância. */
  it('limita o tamanho da página ao teto', async () => {
    mockEstado.idPorAlias = AUTOR_ID;

    await request(app)
      .get('/users/autor/posts')
      .query({ limite: 100000 })
      .set('Authorization', `Bearer ${token()}`);

    expect(mockEstado.chamadasListarDoAutor[0].limite).toBe(50);
  });

  /* Dado: uma requisição sem token;
     Quando: ela chega à rota;
     Então: 401. */
  it('exige autenticação', async () => {
    const res = await request(app).get('/users/autor/posts');
    expect(res.status).toBe(401);
  });
});
