const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const USER_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const EMAIL = 'abraao@exemplo.com';
const CODE = '048213';

/* O prefixo "mock" é obrigatório: a fábrica do jest.mock() é içada para o
   topo do arquivo, antes das declarações, e só variáveis com esse prefixo
   podem ser referenciadas lá dentro. */
const mockState = {
  user: null,        // o que o AuthRepository devolve
  activeCode: null,    // o que VerificacaoRepository.findActive devolve
  secondsSinceLast: null,
  sentEmails: [],   // { para, purpose }
  confirmed: [],      // ids passados a confirmarEmail
  changedPasswords: [],   // { userId, hash }
  deleted: [],        // ids passados a excluirConta
  attempts: [],       // ids de códigos com tentativa registrada
  consumed: [],       // ids de códigos consumed
  created: [],          // códigos emitidos
  consumeReturns: 1,   // rows afetadas por consumir()
};

jest.mock('../../repositories/auth_repository', () =>
  class AuthRepositoryFake {
    async findByEmail(email) {
      return mockState.user?.email === email ? mockState.user : null;
    }
    async findById(id) {
      return mockState.user?.id === id ? mockState.user : null;
    }
    async findByAlias() { return null; }
    async confirmEmail(id) { mockState.confirmados.push(id); return 1; }
    async updatePassword(userId, hash) { mockState.senhasTrocadas.push({ userId, hash }); return 1; }
    async deleteAccount(id) { mockState.excluidos.push(id); return 1; }
  }
);

jest.mock('../../repositories/verification_repository', () =>
  class VerificationRepositoryFake {
    async create(dados) { mockState.criados.push(dados); }
    async findActive() { return mockState.codigoAtivo; }
    async secondsSinceLast() { return mockState.segundosDesdeUltimo; }
    async registerAttempt(id) { mockState.attempts.push(id); }
    async consume(id) { mockState.consumidos.push(id); return mockState.consumirRetorna; }
    async invalidatePending() { }
  }
);

/* O envio de e-mail é substituído: o teste verifica que a intenção de
   enviar existiu, não que a rede funcionou. Chamar o provedor de verdade
   tornaria a suíte lenta, cara e dependente de internet. */
jest.mock('../../config/email', () => ({
  MODO_CONSOLE: true,
  REMETENTE: 'Blabry <teste@exemplo.com>',
  enviarEmail: jest.fn(async ({ para }) => { mockState.emailsEnviados.push({ para }); }),
}));

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake { async listAll() { return []; } }
);
jest.mock('../../repositories/post_repository', () => class PostRepositoryFake {});
jest.mock('../../repositories/comment_repository', () => class CommentRepositoryFake {});
jest.mock('../../repositories/users_repository', () => class UsersRepositoryFake {});

const app = require('../../server');

const token = () =>
  jwt.sign({ id: USER_ID, name: 'Abraão' }, process.env.JWT_SECRET, { expiresIn: '1h' });

/**
 * Usuário falso com a mesma interface que o serviço consome.
 *
 * `emailVerified` é um getter no modelo real; aqui é um valor simples,
 * porque o que importa ao teste é a resposta, não a derivação.
 */
const fakeUser = ({ verificado = false } = {}) => ({
  id: USER_ID,
  name: 'Abraão Santos',
  email: EMAIL,
  emailVerified: verificado,
  async verifyPassword(password) { return password === 'SenhaForte#1'; },
});

/** Código ativo com o hash do CODE conhecido pelo teste. */
const fakeActiveCode = async () => ({
  id: 'code-1',
  codeHash: await bcrypt.hash(CODE, 8),
  attempts: 0,
});

beforeEach(() => {
  mockState.user = null;
  mockState.codigoAtivo = null;
  mockState.segundosDesdeUltimo = null;
  mockState.emailsEnviados = [];
  mockState.confirmados = [];
  mockState.senhasTrocadas = [];
  mockState.excluidos = [];
  mockState.attempts = [];
  mockState.consumidos = [];
  mockState.criados = [];
  mockState.consumirRetorna = 1;
});

/* ---------------- Login bloqueado até a confirmação ---------------- */

describe('POST /auth/login — bloqueio por e-mail não confirmado', () => {
  /* Dado: uma conta criada mas com o e-mail ainda não confirmado;
     Quando: o usuário tenta entrar com a password correta;
     Então: a API responde 403, e não 401 — a interface precisa distinguir
     "password errada" de "falta confirmar" para levá-lo à tela de código. */
  it('recusa com 403 quando o e-mail não foi confirmado', async () => {
    mockState.user = fakeUser({ verificado: false });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, password: 'SenhaForte#1' });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('token');
  });

  /* Dado: a mesma conta não confirmada;
     Quando: a password informada está errada;
     Então: a resposta é 401, e não 403. A ordem das checagens importa: se
     a confirmação fosse checada antes da password, bastaria digitar um e-mail
     qualquer para descobrir se ele tem conta aqui. */
  it('prioriza 401 quando a password está errada', async () => {
    mockState.user = fakeUser({ verificado: false });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, password: 'errada' });

    expect(res.status).toBe(401);
  });

  /* Dado: uma conta com e-mail confirmado;
     Quando: as credenciais estão corretas;
     Então: 200 com token. */
  it('autentica quando o e-mail está confirmado', async () => {
    mockState.user = fakeUser({ verificado: true });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, password: 'SenhaForte#1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});

/* ---------------- Confirmação de e-mail ---------------- */

describe('POST /auth/verify-email', () => {
  /* Dado: um código válido recebido por e-mail;
     Quando: o usuário o informa;
     Então: o e-mail é marcado como confirmado e a API devolve o token —
     pedir login logo após digitar o código seria um obstáculo sem função. */
  it('confirma o e-mail e devolve o token', async () => {
    mockState.user = fakeUser({ verificado: false });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: EMAIL, code: CODE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(mockState.confirmados).toEqual([USER_ID]);
  });

  /* Dado: um código errado;
     Quando: informado;
     Então: 400, o e-mail não é confirmado, e a tentativa é contabilizada —
     é ela que torna o chute caro. */
  it('recusa código errado e registra a tentativa', async () => {
    mockState.user = fakeUser({ verificado: false });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: EMAIL, code: '999999' });

    expect(res.status).toBe(400);
    expect(mockState.confirmados).toHaveLength(0);
    expect(mockState.attempts).toEqual(['code-1']);
  });

  /* Dado: um código com formato inválido (letras, tamanho errado);
     Quando: informado;
     Então: 400 sem nem consultar o banco — recusar lixo cedo evita gastar
     uma comparação bcrypt e uma das attempts do usuário. */
  it.each([['curto', '1234'], ['letras', 'abcdef'], ['vazio', '']])(
    'recusa código %s sem consultar o repositório',
    async (_rotulo, code) => {
      mockState.user = fakeUser({ verificado: false });
      mockState.codigoAtivo = await fakeActiveCode();

      const res = await request(app)
        .post('/auth/verify-email')
        .send({ email: EMAIL, code });

      expect(res.status).toBe(400);
      expect(mockState.attempts).toHaveLength(0);
    }
  );

  /* Dado: nenhum código ativo (expirou, já foi usado ou estourou as
     attempts);
     Quando: um código é informado;
     Então: 400 com a mesma mensagem dos demais casos. Detalhar qual dos
     três é diria a um atacante se vale a pena continuar. */
  it('responde 400 quando não há código ativo', async () => {
    mockState.user = fakeUser({ verificado: false });
    mockState.codigoAtivo = null;

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: EMAIL, code: CODE });

    expect(res.status).toBe(400);
  });

  /* Dado: duas requisições simultâneas com o mesmo código;
     Quando: a segunda tenta consumir um código já consumido (o UPDATE
     afeta 0 rows);
     Então: ela é recusada. Sem essa checagem haveria uma janela entre
     verificar e marcar, e as duas passariam. */
  it('recusa quando o código já foi consumido em paralelo', async () => {
    mockState.user = fakeUser({ verificado: false });
    mockState.codigoAtivo = await fakeActiveCode();
    mockState.consumirRetorna = 0;

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: EMAIL, code: CODE });

    expect(res.status).toBe(400);
    expect(mockState.confirmados).toHaveLength(0);
  });

  /* Dado: um e-mail que não tem conta;
     Quando: um código é informado;
     Então: a mesma resposta 400 de código errado — a rota não pode virar
     um verificador de quem está cadastrado aqui. */
  it('não revela se o e-mail existe', async () => {
    mockState.user = null;

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: 'ninguem@exemplo.com', code: CODE });

    expect(res.status).toBe(400);
  });
});

/* ---------------- Reenvio ---------------- */

describe('POST /auth/verify-email/resend', () => {
  /* Dado: uma conta não confirmada;
     Quando: o usuário pede um novo código;
     Então: um código é gravado e um e-mail sai. */
  it('emite um novo código', async () => {
    mockState.user = fakeUser({ verificado: false });

    const res = await request(app)
      .post('/auth/verify-email/resend')
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(mockState.criados).toHaveLength(1);
    expect(mockState.emailsEnviados).toEqual([{ para: EMAIL }]);
  });

  /* Dado: um código pedido há menos de 60 segundos;
     Quando: outro é pedido;
     Então: 429 — o limit impede que a caixa de entrada de alguém seja
     usada como alvo de spam por quem conhece o e-mail. */
  it('recusa reenvio antes do intervalo mínimo', async () => {
    mockState.user = fakeUser({ verificado: false });
    mockState.segundosDesdeUltimo = 10;

    const res = await request(app)
      .post('/auth/verify-email/resend')
      .send({ email: EMAIL });

    expect(res.status).toBe(429);
    expect(mockState.criados).toHaveLength(0);
  });

  /* Dado: um e-mail sem conta, ou já confirmado;
     Quando: o reenvio é pedido;
     Então: 200 mesmo assim, e nenhum e-mail sai. A resposta uniforme é o
     que impede a rota de virar um verificador de cadastro. */
  it.each([
    ['inexistente', null],
    ['já confirmado', 'verificado'],
  ])('responde 200 sem enviar nada para e-mail %s', async (_rotulo, scenario) => {
    mockState.user = scenario === 'verificado' ? fakeUser({ verificado: true }) : null;

    const res = await request(app)
      .post('/auth/verify-email/resend')
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(mockState.emailsEnviados).toHaveLength(0);
  });
});

/* ---------------- Troca de password ---------------- */

describe('POST /auth/password', () => {
  /* Dado: um código válido e uma password forte;
     Quando: a troca é pedida;
     Então: o hash é gravado — e nunca a password em text. */
  it('troca a password e grava um hash', async () => {
    mockState.user = fakeUser({ verificado: true });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .post('/auth/password')
      .send({ email: EMAIL, code: CODE, newPassword: 'NovaSenha#1' });

    expect(res.status).toBe(200);
    expect(mockState.senhasTrocadas).toHaveLength(1);
    expect(mockState.senhasTrocadas[0].hash).not.toBe('NovaSenha#1');
    // bcrypt produz 60 caracteres começando por $2.
    expect(mockState.senhasTrocadas[0].hash).toMatch(/^\$2[aby]\$/);
  });

  /* Dado: uma password que não atende à regra de força;
     Quando: a troca é pedida;
     Então: 400 e nada é gravado. A regra vale na API, não só na interface. */
  it.each([
    ['curta', 'Ab#1'],
    ['sem maiúscula', 'senhafraca#1'],
    ['sem caractere especial', 'SenhaFraca11'],
  ])('recusa password %s', async (_rotulo, newPassword) => {
    mockState.user = fakeUser({ verificado: true });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .post('/auth/password')
      .send({ email: EMAIL, code: CODE, newPassword });

    expect(res.status).toBe(400);
    expect(mockState.senhasTrocadas).toHaveLength(0);
  });

  /* Dado: uma conta ainda não confirmada;
     Quando: a password é trocada com código válido;
     Então: o e-mail também passa a confirmado — o usuário acabou de provar
     que tem acesso a ele, e exigir a mesma prova duas vezes não acrescenta
     segurança. */
  it('confirma o e-mail junto com a troca de password', async () => {
    mockState.user = fakeUser({ verificado: false });
    mockState.codigoAtivo = await fakeActiveCode();

    await request(app)
      .post('/auth/password')
      .send({ email: EMAIL, code: CODE, newPassword: 'NovaSenha#1' });

    expect(mockState.confirmados).toEqual([USER_ID]);
  });

  /* Dado: um código errado;
     Quando: a troca é pedida;
     Então: 400 e a password permanece. */
  it('recusa código errado', async () => {
    mockState.user = fakeUser({ verificado: true });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .post('/auth/password')
      .send({ email: EMAIL, code: '111111', newPassword: 'NovaSenha#1' });

    expect(res.status).toBe(400);
    expect(mockState.senhasTrocadas).toHaveLength(0);
  });
});

/* ---------------- Exclusão de conta ---------------- */

describe('Exclusão de conta', () => {
  /* Dado: um usuário autenticado;
     Quando: pede o código de exclusão;
     Então: o código sai para o e-mail do banco, e a resposta traz o
     endereço mascarado — confirma o destino sem escrever o endereço
     inteiro em uma tela que outra pessoa pode estar vendo. */
  it('envia o código e devolve o e-mail mascarado', async () => {
    mockState.user = fakeUser({ verificado: true });

    const res = await request(app)
      .post('/users/me/exclusao/code')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('a*****@exemplo.com');
    expect(mockState.emailsEnviados).toEqual([{ para: EMAIL }]);
  });

  /* Dado: uma requisição sem token;
     Quando: o código de exclusão é pedido;
     Então: 401 e nenhum e-mail sai. Excluir é ação do dono da sessão, não
     de quem conhece um endereço. */
  it('exige autenticação para pedir o código', async () => {
    const res = await request(app).post('/users/me/exclusao/code');

    expect(res.status).toBe(401);
    expect(mockState.emailsEnviados).toHaveLength(0);
  });

  /* Dado: token válido e código válido;
     Quando: a exclusão é confirmada;
     Então: 204 e a conta é marcada como excluída. */
  it('exclui a conta com token e código válidos', async () => {
    mockState.user = fakeUser({ verificado: true });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .delete('/users/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ code: CODE });

    expect(res.status).toBe(204);
    expect(mockState.excluidos).toEqual([USER_ID]);
  });

  /* Dado: um cliente HTTP que não envia corpo em DELETE;
     Quando: o código vai na query;
     Então: funciona igual — a rota aceita as duas formas. */
  it('aceita o código pela query string', async () => {
    mockState.user = fakeUser({ verificado: true });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .delete(`/users/me?code=${CODE}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(204);
    expect(mockState.excluidos).toEqual([USER_ID]);
  });

  /* Dado: token válido mas nenhum código, ou um código errado;
     Quando: a exclusão é tentada;
     Então: 400 e a conta continua. Para uma ação irreversível, o token
     sozinho é pouco: ele não distingue o dono de alguém que encontrou o
     computador aberto. */
  it.each([
    ['sem código', undefined],
    ['código errado', '999999'],
  ])('recusa a exclusão %s', async (_rotulo, code) => {
    mockState.user = fakeUser({ verificado: true });
    mockState.codigoAtivo = await fakeActiveCode();

    const res = await request(app)
      .delete('/users/me')
      .set('Authorization', `Bearer ${token()}`)
      .send(code ? { code } : {});

    expect(res.status).toBe(400);
    expect(mockState.excluidos).toHaveLength(0);
  });

  /* Dado: uma requisição sem token;
     Quando: a exclusão é tentada;
     Então: 401. */
  it('exige autenticação para excluir', async () => {
    const res = await request(app).delete('/users/me').send({ code: CODE });

    expect(res.status).toBe(401);
    expect(mockState.excluidos).toHaveLength(0);
  });
});
