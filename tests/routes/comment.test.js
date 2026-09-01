const request = require('supertest');
const jwt = require('jsonwebtoken');

const AUTHOR_ID = '01927d4e-1111-7c21-9b44-2f8a1c6d5e91';
const POST_ID = '01927d4e-2222-7c21-9b44-2f8a1c6d5e92';
const COMMENT_ID = '01927d4e-3333-7c21-9b44-2f8a1c6d5e93';

/* O prefixo "mock" é obrigatório: a fábrica do jest.mock() é içada para o
   topo do arquivo e só variáveis com esse prefixo podem ser lidas lá. */
const mockState = {
  /* Os argumentos que cada método recebeu. É o coração destes testes: o
     controlador lia `req.params.comentarioId`, um nome que a rota deixou de
     declarar quando os parâmetros foram para o inglês. `undefined` chegava
     ao repositório, o mysql2 recusava o parâmetro e a resposta virava 500 —
     em vez do 204 de uma remoção que teria funcionado. */
  removeCalls: [],
  updateCalls: [],
  createCalls: [],
  findByIdCalls: [],
  comment: null,
  removed: 1,
  postExists: true,
};

jest.mock('../../repositories/comment_repository', () =>
  class CommentRepositoryFake {
    async create(comment) {
      mockState.createCalls.push(comment);
      return mockState.comment;
    }
    async findById(id) {
      mockState.findByIdCalls.push(id);
      return mockState.comment;
    }
    async remove(id, authorId) {
      mockState.removeCalls.push({ id, authorId });
      return mockState.removed;
    }
    async update(id, authorId, content) {
      mockState.updateCalls.push({ id, authorId, content });
      return 1;
    }
  }
);

jest.mock('../../repositories/post_repository', () =>
  class PostRepositoryFake {
    async exists() { return mockState.postExists; }
  }
);

/* Os demais existem apenas para que o require do server.js não abra
   conexão com o banco. */
jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFake {});
jest.mock('../../repositories/users_repository', () => class UsersRepositoryFake {});
jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake { async listAll() { return []; } }
);

const app = require('../../server');

const token = () =>
  jwt.sign({ id: AUTHOR_ID, name: 'Autor' }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Comentário no formato que o repositório devolveria. */
const fakeComment = (createdAt = new Date().toISOString()) => {
  const comment = {
    id: COMMENT_ID,
    text: 'comentário do autor',
    createdAt,
    editedAt: null,
    author: { name: 'Autor', alias: 'autor', photoUrl: null },
    belongsTo(userId) { return userId === AUTHOR_ID; },
    toJSON() {
      return {
        id: this.id, text: this.text, createdAt: this.createdAt,
        author: this.author, editedAt: this.editedAt,
      };
    },
  };
  return comment;
};

beforeEach(() => {
  mockState.removeCalls = [];
  mockState.updateCalls = [];
  mockState.createCalls = [];
  mockState.findByIdCalls = [];
  mockState.comment = fakeComment();
  mockState.removed = 1;
  mockState.postExists = true;
});

/* ---------------- POST /posts/:id/comments ---------------- */

describe('POST /posts/:id/comments', () => {
  /* Dado: uma publicação existente e um usuário autenticado;
     Quando: ele envia um comentário;
     Então: a resposta é 201 com o comentário criado — e não um erro. */
  it('cria o comentário e devolve 201 com o corpo', async () => {
    const resposta = await request(app)
      .post(`/posts/${POST_ID}/comments`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ text: 'comentário do autor' });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toMatchObject({ id: COMMENT_ID, text: 'comentário do autor' });
    expect(mockState.createCalls).toHaveLength(1);
  });

  /* Dado: uma publicação que não existe;
     Quando: alguém tenta comentar nela;
     Então: 404 — e nada é gravado. */
  it('recusa comentário em publicação inexistente', async () => {
    mockState.postExists = false;

    const resposta = await request(app)
      .post(`/posts/${POST_ID}/comments`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ text: 'oi' });

    expect(resposta.status).toBe(404);
    expect(mockState.createCalls).toHaveLength(0);
  });
});

/* ---------------- DELETE /posts/:id/comments/:commentId ---------------- */

describe('DELETE /posts/:id/comments/:commentId', () => {
  /* Dado: um comentário do próprio autor;
     Quando: ele pede a remoção;
     Então: a resposta é 204 e o repositório recebe o id que veio da URL.
     A asserção sobre o id é o ponto: o controlador lia um nome de
     parâmetro que a rota não declarava, e `undefined` chegava ao banco. */
  it('remove o comentário e repassa o id da URL', async () => {
    const resposta = await request(app)
      .delete(`/posts/${POST_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(resposta.status).toBe(204);
    expect(mockState.removeCalls).toEqual([{ id: COMMENT_ID, authorId: AUTHOR_ID }]);
  });

  /* Dado: um comentário que não existe;
     Quando: alguém pede a remoção;
     Então: 404. */
  it('responde 404 quando o comentário não existe', async () => {
    mockState.removed = 0;
    mockState.comment = null;

    const resposta = await request(app)
      .delete(`/posts/${POST_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(resposta.status).toBe(404);
  });

  /* Dado: um comentário de outra pessoa;
     Quando: alguém tenta removê-lo;
     Então: 403 — o DELETE com autoria no WHERE não afetou linha alguma, e
     a releitura mostra que o comentário existe, mas é de outro. */
  it('responde 403 quando o comentário é de outra pessoa', async () => {
    mockState.removed = 0;
    mockState.comment = { ...fakeComment(), belongsTo: () => false };

    const resposta = await request(app)
      .delete(`/posts/${POST_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(resposta.status).toBe(403);
  });

  /* Dado: uma requisição sem token;
     Quando: ela chega à rota;
     Então: 401 e nada é removido. */
  it('exige autenticação', async () => {
    const resposta = await request(app)
      .delete(`/posts/${POST_ID}/comments/${COMMENT_ID}`);

    expect(resposta.status).toBe(401);
    expect(mockState.removeCalls).toHaveLength(0);
  });
});

/* ---------------- PATCH /posts/:id/comments/:commentId ---------------- */

describe('PATCH /posts/:id/comments/:commentId', () => {
  /* Dado: um comentário recém-criado, do próprio autor;
     Quando: ele edita o texto;
     Então: 200, e o repositório recebe o id da URL — mesmo parâmetro que
     quebrava a remoção. */
  it('edita o comentário e repassa o id da URL', async () => {
    const resposta = await request(app)
      .patch(`/posts/${POST_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ text: 'texto corrigido' });

    expect(resposta.status).toBe(200);
    expect(mockState.updateCalls).toEqual([
      { id: COMMENT_ID, authorId: AUTHOR_ID, content: 'texto corrigido' },
    ]);
  });

  /* Dado: um comentário publicado há mais de quinze minutos;
     Quando: o autor tenta editá-lo;
     Então: 409, e nada é escrito. */
  it('recusa a edição fora da janela de quinze minutos', async () => {
    mockState.comment = fakeComment(new Date(Date.now() - 30 * 60 * 1000).toISOString());

    const resposta = await request(app)
      .patch(`/posts/${POST_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ text: 'tarde demais' });

    expect(resposta.status).toBe(409);
    expect(mockState.updateCalls).toHaveLength(0);
  });
});
