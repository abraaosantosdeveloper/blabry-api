const request = require('supertest');
const jwt = require('jsonwebtoken');

/* O prefixo "mock" é obrigatório: o jest.mock() é içado para o topo do
   arquivo, antes das declarações. Só variáveis com esse prefixo podem
   ser referenciadas dentro da fábrica do mock. */
const mockDb = { users: [] };

jest.mock('../../repositories/auth_repository', () =>
  class AuthRepositoryFake {
    async findByEmail(email) {
      return mockDb.users.find((u) => u.email === email) ?? null;
    }

    async findByAlias(alias) {
      return mockDb.users.find((u) => u.alias === alias) ?? null;
    }

    async create(user) {
      mockDb.users.push(user);
      return user;
    }

    /* A confirmação de e-mail preenche a data no próprio objeto guardado,
       porque o getter `emailVerified` do modelo deriva dela. Assim o
       teste exercita a mesma regra que a produção usa, em vez de um
       booleano paralelo que poderia divergir. */
    async confirmEmail(id) {
      const user = mockDb.users.find((u) => u.id === id);
      if (user) user.emailVerifiedAt = new Date();
      return 1;
    }
  }
);

/* Emissão de código e envio de e-mail são substituídos: este arquivo testa
   cadastro e login, não o fluxo de verificação — que tem suíte própria em
   verificacao.test.js. Sem os mocks, o cadastro tentaria abrir conexão com
   o banco e chamar o provedor de e-mail. */
jest.mock('../../repositories/verification_repository', () =>
  class VerificationRepositoryFake {
    async create() { }
    async secondsSinceLast() { return null; }
    async findActive() { return null; }
    async registerAttempt() { }
    async consume() { return 1; }
    async invalidatePending() { }
  }
);

jest.mock('../../config/email', () => ({
  MODO_CONSOLE: true,
  REMETENTE: 'Blabry <teste@exemplo.com>',
  enviarEmail: jest.fn(async () => { }),
}));

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake {
    async listAll() { return []; }
  }
);

const app = require('../../server');

const NEW_ACCOUNT = {
  name: 'John Doe',
  alias: 'john.doe',
  email: 'john@exemplo.com',
  password: 'SenhaForte#1',
  birthDate: '1990-05-14',
  nationality: 'BRA',
  // O aceite da política faz parte do payload mínimo memberSince que a validação
  // entrou no serviço: sem ele, todo cadastro é recusado com 400.
  acceptedPolicy: true,
};

beforeEach(() => { mockDb.users = []; });

/* ---------------- RF01 · Cadastro ---------------- */

describe('POST /auth/signup', () => {
  /* Dado: dados de cadastro válidos;
     Quando: a conta é criada;
     Então: 201 com o usuário, mas SEM token — a conta nasce pendente de
     confirmação de e-mail, e devolver token aqui contornaria essa regra. */
  it('cria a conta e devolve 201 sem token, com verificação pendente', async () => {
    const res = await request(app).post('/auth/signup').send(NEW_ACCOUNT);

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body.verificationPending).toBe(true);
    expect(res.body.user).toMatchObject({
      name: 'John Doe',
      alias: 'john.doe',
      email: 'john@exemplo.com',
    });
  });

  /* ---- Aceite da política de privacidade ----
     Dado: um cliente que envia o cadastro direto na API, sem passar pelo
     formulário; Quando: o campo acceptedPolicy não é exatamente `true`;
     Então: a conta não é criada e a API responde 400. */
  describe('aceite da política de privacidade', () => {
    // Cada scenario é uma forma diferente de "não aceitou". A string 'true' está
    // aqui de propósito: é o que chega quando um formulário serializa um
    // booleano sem cuidado, e em JavaScript toda string não vazia é truthy —
    // uma checagem frouxa deixaria passar.
    const rejected = [
      ['ausente', {}],
      ['false', { acceptedPolicy: false }],
      ['string "true"', { acceptedPolicy: 'true' }],
      ['string "false"', { acceptedPolicy: 'false' }],
      ['null', { acceptedPolicy: null }],
      ['1', { acceptedPolicy: 1 }],
    ];

    it.each(rejected)('recusa quando o aceite vem %s', async (_rotulo, override) => {
      const payload = { ...NOVA_CONTA, ...sobrescrita };
      // 'ausente' é o único scenario em que o campo precisa sumir do objeto.
      if (!('acceptedPolicy' in override)) delete payload.acceptedPolicy;

      const res = await request(app).post('/auth/signup').send(payload);

      expect(res.status).toBe(400);
      // Nenhum usuário chega ao repositório: a barreira é anterior à escrita.
      expect(mockDb.users).toHaveLength(0);
    });

    it('aceita quando o campo é o booleano true', async () => {
      const res = await request(app).post('/auth/signup').send(NEW_ACCOUNT);
      expect(res.status).toBe(201);
    });

    it('não devolve o aceite na resposta', async () => {
      const res = await request(app).post('/auth/signup').send(NEW_ACCOUNT);
      // O aceite é uma condição de entrada, não um atributo do usuário:
      // não existe coluna para ele e ele não faz parte da forma pública.
      expect(res.body.user).not.toHaveProperty('acceptedPolicy');
    });
  });

  it('nunca expõe o hash da password na resposta', async () => {
    const res = await request(app).post('/auth/signup').send(NEW_ACCOUNT);

    expect(JSON.stringify(res.body)).not.toContain('$2b$');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('recusa com 400 quando falta campo obrigatório', async () => {
    const { password, ...semSenha } = NEW_ACCOUNT;
    const res = await request(app).post('/auth/signup').send(withoutPassword);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('recusa com 409 quando o email já existe', async () => {
    await request(app).post('/auth/signup').send(NEW_ACCOUNT);
    const res = await request(app)
      .post('/auth/signup')
      .send({ ...NOVA_CONTA, alias: 'outro.alias' });

    expect(res.status).toBe(409);
  });

  it('recusa com 409 quando o @ já existe', async () => {
    await request(app).post('/auth/signup').send(NEW_ACCOUNT);
    const res = await request(app)
      .post('/auth/signup')
      .send({ ...NOVA_CONTA, email: 'outro@exemplo.com' });

    expect(res.status).toBe(409);
  });
});

/* ---------------- RF03 · Token JWT ---------------- */

describe('Token devolvido no login', () => {
  /* O token deixou de sair do cadastro quando a confirmação por e-mail
     passou a bloquear o acesso. O formato continua o mesmo — só o momento
     de emissão mudou —, então o teste passou a partir do login. */
  it('é um JWT válido, com id e name, expirando em 24h', async () => {
    await request(app).post('/auth/signup').send(NEW_ACCOUNT);
    // Conta confirmada à mão: este teste é sobre o formato do token.
    mockDb.users[0].emailVerifiedAt = new Date();

    const { body } = await request(app)
      .post('/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: NEW_ACCOUNT.password });

    const payload = jwt.verify(body.token, process.env.JWT_SECRET);

    expect(payload).toHaveProperty('id');
    expect(payload.name).toBe('John Doe');

    const horas = (payload.exp - payload.iat) / 3600;
    expect(horas).toBe(24);
  });
});

/* ---------------- RF02 · Login ---------------- */

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/signup').send(NEW_ACCOUNT);
    /* A conta nasce pendente de confirmação e o login é recusado com 403
       nesse estado. Os testes desta seção são sobre credenciais, não sobre
       o fluxo de verificação — que tem suíte própria —, então a conta é
       confirmada aqui. */
    mockDb.users[0].emailVerifiedAt = new Date();
  });

  it('autentica com email e password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: NEW_ACCOUNT.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('autentica com o @ do usuário no lugar do email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'john.doe', password: NEW_ACCOUNT.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('aceita o @ escrito com arroba', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '@john.doe', password: NEW_ACCOUNT.password });

    expect(res.status).toBe(200);
  });

  it('recusa password incorreta com 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: 'SenhaErrada#9' });

    expect(res.status).toBe(401);
  });

  /* RNF-B04 — a mensagem não pode revelar se o email existe */
  it('devolve a mesma mensagem para email inexistente e password errada', async () => {
    const inexistente = await request(app)
      .post('/auth/login')
      .send({ email: 'ninguem@exemplo.com', password: 'SenhaForte#1' });

    const senhaErrada = await request(app)
      .post('/auth/login')
      .send({ email: NEW_ACCOUNT.email, password: 'SenhaErrada#9' });

    expect(inexistente.status).toBe(senhaErrada.status);
    expect(inexistente.body.error).toBe(senhaErrada.body.error);
  });
});