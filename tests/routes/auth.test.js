const request = require('supertest');
const jwt = require('jsonwebtoken');

/* O prefixo "mock" é obrigatório: o jest.mock() é içado para o topo do
   arquivo, antes das declarações. Só variáveis com esse prefixo podem
   ser referenciadas dentro da fábrica do mock. */
const mockBanco = { usuarios: [] };

jest.mock('../../repositories/auth_repository', () =>
  class AuthRepositoryFalso {
    async buscarPorEmail(email) {
      return mockBanco.usuarios.find((u) => u.email === email) ?? null;
    }

    async buscarPorApelido(apelido) {
      return mockBanco.usuarios.find((u) => u.apelido === apelido) ?? null;
    }

    async criar(usuario) {
      mockBanco.usuarios.push(usuario);
      return usuario;
    }
  }
);

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso {
    async listarPaises() { return []; }
  }
);

const app = require('../../server');

const NOVA_CONTA = {
  nome: 'John Doe',
  apelido: 'john.doe',
  email: 'john@exemplo.com',
  senha: 'SenhaForte#1',
  nascimento: '1990-05-14',
  nacionalidade: 'BRA',
};

beforeEach(() => { mockBanco.usuarios = []; });

/* ---------------- RF01 · Cadastro ---------------- */

describe('POST /auth/cadastro', () => {
  it('cria a conta e devolve 201 com token e usuário', async () => {
    const res = await request(app).post('/auth/cadastro').send(NOVA_CONTA);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.usuario).toMatchObject({
      nome: 'John Doe',
      apelido: 'john.doe',
      email: 'john@exemplo.com',
    });
  });

  it('nunca expõe o hash da senha na resposta', async () => {
    const res = await request(app).post('/auth/cadastro').send(NOVA_CONTA);

    expect(JSON.stringify(res.body)).not.toContain('$2b$');
    expect(res.body.usuario).not.toHaveProperty('senhaHash');
    expect(res.body.usuario).not.toHaveProperty('password_hash');
  });

  it('recusa com 400 quando falta campo obrigatório', async () => {
    const { senha, ...semSenha } = NOVA_CONTA;
    const res = await request(app).post('/auth/cadastro').send(semSenha);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('erro');
  });

  it('recusa com 409 quando o email já existe', async () => {
    await request(app).post('/auth/cadastro').send(NOVA_CONTA);
    const res = await request(app)
      .post('/auth/cadastro')
      .send({ ...NOVA_CONTA, apelido: 'outro.alias' });

    expect(res.status).toBe(409);
  });

  it('recusa com 409 quando o @ já existe', async () => {
    await request(app).post('/auth/cadastro').send(NOVA_CONTA);
    const res = await request(app)
      .post('/auth/cadastro')
      .send({ ...NOVA_CONTA, email: 'outro@exemplo.com' });

    expect(res.status).toBe(409);
  });
});

/* ---------------- RF03 · Token JWT ---------------- */

describe('Token devolvido no cadastro', () => {
  it('é um JWT válido, com id e nome, expirando em 24h', async () => {
    const { body } = await request(app).post('/auth/cadastro').send(NOVA_CONTA);
    const payload = jwt.verify(body.token, process.env.JWT_SECRET);

    expect(payload).toHaveProperty('id');
    expect(payload.nome).toBe('John Doe');

    const horas = (payload.exp - payload.iat) / 3600;
    expect(horas).toBe(24);
  });
});

/* ---------------- RF02 · Login ---------------- */

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/cadastro').send(NOVA_CONTA);
  });

  it('autentica com email e senha', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: NOVA_CONTA.email, senha: NOVA_CONTA.senha });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('autentica com o @ do usuário no lugar do email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'john.doe', senha: NOVA_CONTA.senha });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('aceita o @ escrito com arroba', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '@john.doe', senha: NOVA_CONTA.senha });

    expect(res.status).toBe(200);
  });

  it('recusa senha incorreta com 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: NOVA_CONTA.email, senha: 'SenhaErrada#9' });

    expect(res.status).toBe(401);
  });

  /* RNF-B04 — a mensagem não pode revelar se o email existe */
  it('devolve a mesma mensagem para email inexistente e senha errada', async () => {
    const inexistente = await request(app)
      .post('/auth/login')
      .send({ email: 'ninguem@exemplo.com', senha: 'SenhaForte#1' });

    const senhaErrada = await request(app)
      .post('/auth/login')
      .send({ email: NOVA_CONTA.email, senha: 'SenhaErrada#9' });

    expect(inexistente.status).toBe(senhaErrada.status);
    expect(inexistente.body.erro).toBe(senhaErrada.body.erro);
  });
});