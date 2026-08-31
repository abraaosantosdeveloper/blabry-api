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

    /* A confirmação de e-mail preenche a data no próprio objeto guardado,
       porque o getter `emailVerificado` do modelo deriva dela. Assim o
       teste exercita a mesma regra que a produção usa, em vez de um
       booleano paralelo que poderia divergir. */
    async confirmarEmail(id) {
      const usuario = mockBanco.usuarios.find((u) => u.id === id);
      if (usuario) usuario.emailVerificadoEm = new Date();
      return 1;
    }
  }
);

/* Emissão de código e envio de e-mail são substituídos: este arquivo testa
   cadastro e login, não o fluxo de verificação — que tem suíte própria em
   verificacao.test.js. Sem os mocks, o cadastro tentaria abrir conexão com
   o banco e chamar o provedor de e-mail. */
jest.mock('../../repositories/verificacao_repository', () =>
  class VerificacaoRepositoryFalso {
    async criar() { }
    async segundosDesdeUltimo() { return null; }
    async buscarAtivo() { return null; }
    async registrarTentativa() { }
    async consumir() { return 1; }
    async invalidarPendentes() { }
  }
);

jest.mock('../../config/email', () => ({
  MODO_CONSOLE: true,
  REMETENTE: 'Blabry <teste@exemplo.com>',
  enviarEmail: jest.fn(async () => { }),
}));

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
  // O aceite da política faz parte do payload mínimo desde que a validação
  // entrou no serviço: sem ele, todo cadastro é recusado com 400.
  aceitouPolitica: true,
};

beforeEach(() => { mockBanco.usuarios = []; });

/* ---------------- RF01 · Cadastro ---------------- */

describe('POST /auth/cadastro', () => {
  /* Dado: dados de cadastro válidos;
     Quando: a conta é criada;
     Então: 201 com o usuário, mas SEM token — a conta nasce pendente de
     confirmação de e-mail, e devolver token aqui contornaria essa regra. */
  it('cria a conta e devolve 201 sem token, com verificação pendente', async () => {
    const res = await request(app).post('/auth/cadastro').send(NOVA_CONTA);

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body.verificacaoPendente).toBe(true);
    expect(res.body.usuario).toMatchObject({
      nome: 'John Doe',
      apelido: 'john.doe',
      email: 'john@exemplo.com',
    });
  });

  /* ---- Aceite da política de privacidade ----
     Dado: um cliente que envia o cadastro direto na API, sem passar pelo
     formulário; Quando: o campo aceitouPolitica não é exatamente `true`;
     Então: a conta não é criada e a API responde 400. */
  describe('aceite da política de privacidade', () => {
    // Cada caso é uma forma diferente de "não aceitou". A string 'true' está
    // aqui de propósito: é o que chega quando um formulário serializa um
    // booleano sem cuidado, e em JavaScript toda string não vazia é truthy —
    // uma checagem frouxa deixaria passar.
    const recusados = [
      ['ausente', {}],
      ['false', { aceitouPolitica: false }],
      ['string "true"', { aceitouPolitica: 'true' }],
      ['string "false"', { aceitouPolitica: 'false' }],
      ['null', { aceitouPolitica: null }],
      ['1', { aceitouPolitica: 1 }],
    ];

    it.each(recusados)('recusa quando o aceite vem %s', async (_rotulo, sobrescrita) => {
      const payload = { ...NOVA_CONTA, ...sobrescrita };
      // 'ausente' é o único caso em que o campo precisa sumir do objeto.
      if (!('aceitouPolitica' in sobrescrita)) delete payload.aceitouPolitica;

      const res = await request(app).post('/auth/cadastro').send(payload);

      expect(res.status).toBe(400);
      // Nenhum usuário chega ao repositório: a barreira é anterior à escrita.
      expect(mockBanco.usuarios).toHaveLength(0);
    });

    it('aceita quando o campo é o booleano true', async () => {
      const res = await request(app).post('/auth/cadastro').send(NOVA_CONTA);
      expect(res.status).toBe(201);
    });

    it('não devolve o aceite na resposta', async () => {
      const res = await request(app).post('/auth/cadastro').send(NOVA_CONTA);
      // O aceite é uma condição de entrada, não um atributo do usuário:
      // não existe coluna para ele e ele não faz parte da forma pública.
      expect(res.body.usuario).not.toHaveProperty('aceitouPolitica');
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

describe('Token devolvido no login', () => {
  /* O token deixou de sair do cadastro quando a confirmação por e-mail
     passou a bloquear o acesso. O formato continua o mesmo — só o momento
     de emissão mudou —, então o teste passou a partir do login. */
  it('é um JWT válido, com id e nome, expirando em 24h', async () => {
    await request(app).post('/auth/cadastro').send(NOVA_CONTA);
    // Conta confirmada à mão: este teste é sobre o formato do token.
    mockBanco.usuarios[0].emailVerificadoEm = new Date();

    const { body } = await request(app)
      .post('/auth/login')
      .send({ email: NOVA_CONTA.email, senha: NOVA_CONTA.senha });

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
    /* A conta nasce pendente de confirmação e o login é recusado com 403
       nesse estado. Os testes desta seção são sobre credenciais, não sobre
       o fluxo de verificação — que tem suíte própria —, então a conta é
       confirmada aqui. */
    mockBanco.usuarios[0].emailVerificadoEm = new Date();
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