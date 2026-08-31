const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const USUARIO_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const EMAIL = 'abraao@exemplo.com';
const CODIGO = '048213';

/* O prefixo "mock" é obrigatório: a fábrica do jest.mock() é içada para o
   topo do arquivo, antes das declarações, e só variáveis com esse prefixo
   podem ser referenciadas lá dentro. */
const mockEstado = {
  usuario: null,        // o que o AuthRepository devolve
  codigoAtivo: null,    // o que VerificacaoRepository.buscarAtivo devolve
  segundosDesdeUltimo: null,
  emailsEnviados: [],   // { para, proposito }
  confirmados: [],      // ids passados a confirmarEmail
  senhasTrocadas: [],   // { usuarioId, hash }
  excluidos: [],        // ids passados a excluirConta
  tentativas: [],       // ids de códigos com tentativa registrada
  consumidos: [],       // ids de códigos consumidos
  criados: [],          // códigos emitidos
  consumirRetorna: 1,   // linhas afetadas por consumir()
};

jest.mock('../../repositories/auth_repository', () =>
  class AuthRepositoryFalso {
    async buscarPorEmail(email) {
      return mockEstado.usuario?.email === email ? mockEstado.usuario : null;
    }
    async buscarPorId(id) {
      return mockEstado.usuario?.id === id ? mockEstado.usuario : null;
    }
    async buscarPorApelido() { return null; }
    async confirmarEmail(id) { mockEstado.confirmados.push(id); return 1; }
    async atualizarSenha(usuarioId, hash) { mockEstado.senhasTrocadas.push({ usuarioId, hash }); return 1; }
    async excluirConta(id) { mockEstado.excluidos.push(id); return 1; }
  }
);

jest.mock('../../repositories/verificacao_repository', () =>
  class VerificacaoRepositoryFalso {
    async criar(dados) { mockEstado.criados.push(dados); }
    async buscarAtivo() { return mockEstado.codigoAtivo; }
    async segundosDesdeUltimo() { return mockEstado.segundosDesdeUltimo; }
    async registrarTentativa(id) { mockEstado.tentativas.push(id); }
    async consumir(id) { mockEstado.consumidos.push(id); return mockEstado.consumirRetorna; }
    async invalidarPendentes() { }
  }
);

/* O envio de e-mail é substituído: o teste verifica que a intenção de
   enviar existiu, não que a rede funcionou. Chamar o provedor de verdade
   tornaria a suíte lenta, cara e dependente de internet. */
jest.mock('../../config/email', () => ({
  MODO_CONSOLE: true,
  REMETENTE: 'Blabry <teste@exemplo.com>',
  enviarEmail: jest.fn(async ({ para }) => { mockEstado.emailsEnviados.push({ para }); }),
}));

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso { async listarPaises() { return []; } }
);
jest.mock('../../repositories/post_repository', () => class PostRepositoryFalso {});
jest.mock('../../repositories/comment_repository', () => class CommentRepositoryFalso {});
jest.mock('../../repositories/usuarios_repository', () => class UsuariosRepositoryFalso {});

const app = require('../../server');

const token = () =>
  jwt.sign({ id: USUARIO_ID, nome: 'Abraão' }, process.env.JWT_SECRET, { expiresIn: '1h' });

/**
 * Usuário falso com a mesma interface que o serviço consome.
 *
 * `emailVerificado` é um getter no modelo real; aqui é um valor simples,
 * porque o que importa ao teste é a resposta, não a derivação.
 */
const usuarioFalso = ({ verificado = false } = {}) => ({
  id: USUARIO_ID,
  nome: 'Abraão Santos',
  email: EMAIL,
  emailVerificado: verificado,
  async verificarSenha(senha) { return senha === 'SenhaForte#1'; },
});

/** Código ativo com o hash do CODIGO conhecido pelo teste. */
const codigoAtivoFalso = async () => ({
  id: 'codigo-1',
  codigoHash: await bcrypt.hash(CODIGO, 8),
  tentativas: 0,
});

beforeEach(() => {
  mockEstado.usuario = null;
  mockEstado.codigoAtivo = null;
  mockEstado.segundosDesdeUltimo = null;
  mockEstado.emailsEnviados = [];
  mockEstado.confirmados = [];
  mockEstado.senhasTrocadas = [];
  mockEstado.excluidos = [];
  mockEstado.tentativas = [];
  mockEstado.consumidos = [];
  mockEstado.criados = [];
  mockEstado.consumirRetorna = 1;
});

/* ---------------- Login bloqueado até a confirmação ---------------- */

describe('POST /auth/login — bloqueio por e-mail não confirmado', () => {
  /* Dado: uma conta criada mas com o e-mail ainda não confirmado;
     Quando: o usuário tenta entrar com a senha correta;
     Então: a API responde 403, e não 401 — a interface precisa distinguir
     "senha errada" de "falta confirmar" para levá-lo à tela de código. */
  it('recusa com 403 quando o e-mail não foi confirmado', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, senha: 'SenhaForte#1' });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('token');
  });

  /* Dado: a mesma conta não confirmada;
     Quando: a senha informada está errada;
     Então: a resposta é 401, e não 403. A ordem das checagens importa: se
     a confirmação fosse checada antes da senha, bastaria digitar um e-mail
     qualquer para descobrir se ele tem conta aqui. */
  it('prioriza 401 quando a senha está errada', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, senha: 'errada' });

    expect(res.status).toBe(401);
  });

  /* Dado: uma conta com e-mail confirmado;
     Quando: as credenciais estão corretas;
     Então: 200 com token. */
  it('autentica quando o e-mail está confirmado', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: true });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: EMAIL, senha: 'SenhaForte#1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});

/* ---------------- Confirmação de e-mail ---------------- */

describe('POST /auth/verificar-email', () => {
  /* Dado: um código válido recebido por e-mail;
     Quando: o usuário o informa;
     Então: o e-mail é marcado como confirmado e a API devolve o token —
     pedir login logo após digitar o código seria um obstáculo sem função. */
  it('confirma o e-mail e devolve o token', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .post('/auth/verificar-email')
      .send({ email: EMAIL, codigo: CODIGO });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(mockEstado.confirmados).toEqual([USUARIO_ID]);
  });

  /* Dado: um código errado;
     Quando: informado;
     Então: 400, o e-mail não é confirmado, e a tentativa é contabilizada —
     é ela que torna o chute caro. */
  it('recusa código errado e registra a tentativa', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .post('/auth/verificar-email')
      .send({ email: EMAIL, codigo: '999999' });

    expect(res.status).toBe(400);
    expect(mockEstado.confirmados).toHaveLength(0);
    expect(mockEstado.tentativas).toEqual(['codigo-1']);
  });

  /* Dado: um código com formato inválido (letras, tamanho errado);
     Quando: informado;
     Então: 400 sem nem consultar o banco — recusar lixo cedo evita gastar
     uma comparação bcrypt e uma das tentativas do usuário. */
  it.each([['curto', '1234'], ['letras', 'abcdef'], ['vazio', '']])(
    'recusa código %s sem consultar o repositório',
    async (_rotulo, codigo) => {
      mockEstado.usuario = usuarioFalso({ verificado: false });
      mockEstado.codigoAtivo = await codigoAtivoFalso();

      const res = await request(app)
        .post('/auth/verificar-email')
        .send({ email: EMAIL, codigo });

      expect(res.status).toBe(400);
      expect(mockEstado.tentativas).toHaveLength(0);
    }
  );

  /* Dado: nenhum código ativo (expirou, já foi usado ou estourou as
     tentativas);
     Quando: um código é informado;
     Então: 400 com a mesma mensagem dos demais casos. Detalhar qual dos
     três é diria a um atacante se vale a pena continuar. */
  it('responde 400 quando não há código ativo', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });
    mockEstado.codigoAtivo = null;

    const res = await request(app)
      .post('/auth/verificar-email')
      .send({ email: EMAIL, codigo: CODIGO });

    expect(res.status).toBe(400);
  });

  /* Dado: duas requisições simultâneas com o mesmo código;
     Quando: a segunda tenta consumir um código já consumido (o UPDATE
     afeta 0 linhas);
     Então: ela é recusada. Sem essa checagem haveria uma janela entre
     verificar e marcar, e as duas passariam. */
  it('recusa quando o código já foi consumido em paralelo', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });
    mockEstado.codigoAtivo = await codigoAtivoFalso();
    mockEstado.consumirRetorna = 0;

    const res = await request(app)
      .post('/auth/verificar-email')
      .send({ email: EMAIL, codigo: CODIGO });

    expect(res.status).toBe(400);
    expect(mockEstado.confirmados).toHaveLength(0);
  });

  /* Dado: um e-mail que não tem conta;
     Quando: um código é informado;
     Então: a mesma resposta 400 de código errado — a rota não pode virar
     um verificador de quem está cadastrado aqui. */
  it('não revela se o e-mail existe', async () => {
    mockEstado.usuario = null;

    const res = await request(app)
      .post('/auth/verificar-email')
      .send({ email: 'ninguem@exemplo.com', codigo: CODIGO });

    expect(res.status).toBe(400);
  });
});

/* ---------------- Reenvio ---------------- */

describe('POST /auth/verificar-email/reenviar', () => {
  /* Dado: uma conta não confirmada;
     Quando: o usuário pede um novo código;
     Então: um código é gravado e um e-mail sai. */
  it('emite um novo código', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });

    const res = await request(app)
      .post('/auth/verificar-email/reenviar')
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(mockEstado.criados).toHaveLength(1);
    expect(mockEstado.emailsEnviados).toEqual([{ para: EMAIL }]);
  });

  /* Dado: um código pedido há menos de 60 segundos;
     Quando: outro é pedido;
     Então: 429 — o limite impede que a caixa de entrada de alguém seja
     usada como alvo de spam por quem conhece o e-mail. */
  it('recusa reenvio antes do intervalo mínimo', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });
    mockEstado.segundosDesdeUltimo = 10;

    const res = await request(app)
      .post('/auth/verificar-email/reenviar')
      .send({ email: EMAIL });

    expect(res.status).toBe(429);
    expect(mockEstado.criados).toHaveLength(0);
  });

  /* Dado: um e-mail sem conta, ou já confirmado;
     Quando: o reenvio é pedido;
     Então: 200 mesmo assim, e nenhum e-mail sai. A resposta uniforme é o
     que impede a rota de virar um verificador de cadastro. */
  it.each([
    ['inexistente', null],
    ['já confirmado', 'verificado'],
  ])('responde 200 sem enviar nada para e-mail %s', async (_rotulo, caso) => {
    mockEstado.usuario = caso === 'verificado' ? usuarioFalso({ verificado: true }) : null;

    const res = await request(app)
      .post('/auth/verificar-email/reenviar')
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(mockEstado.emailsEnviados).toHaveLength(0);
  });
});

/* ---------------- Troca de senha ---------------- */

describe('POST /auth/senha', () => {
  /* Dado: um código válido e uma senha forte;
     Quando: a troca é pedida;
     Então: o hash é gravado — e nunca a senha em texto. */
  it('troca a senha e grava um hash', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: true });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .post('/auth/senha')
      .send({ email: EMAIL, codigo: CODIGO, novaSenha: 'NovaSenha#1' });

    expect(res.status).toBe(200);
    expect(mockEstado.senhasTrocadas).toHaveLength(1);
    expect(mockEstado.senhasTrocadas[0].hash).not.toBe('NovaSenha#1');
    // bcrypt produz 60 caracteres começando por $2.
    expect(mockEstado.senhasTrocadas[0].hash).toMatch(/^\$2[aby]\$/);
  });

  /* Dado: uma senha que não atende à regra de força;
     Quando: a troca é pedida;
     Então: 400 e nada é gravado. A regra vale na API, não só na interface. */
  it.each([
    ['curta', 'Ab#1'],
    ['sem maiúscula', 'senhafraca#1'],
    ['sem caractere especial', 'SenhaFraca11'],
  ])('recusa senha %s', async (_rotulo, novaSenha) => {
    mockEstado.usuario = usuarioFalso({ verificado: true });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .post('/auth/senha')
      .send({ email: EMAIL, codigo: CODIGO, novaSenha });

    expect(res.status).toBe(400);
    expect(mockEstado.senhasTrocadas).toHaveLength(0);
  });

  /* Dado: uma conta ainda não confirmada;
     Quando: a senha é trocada com código válido;
     Então: o e-mail também passa a confirmado — o usuário acabou de provar
     que tem acesso a ele, e exigir a mesma prova duas vezes não acrescenta
     segurança. */
  it('confirma o e-mail junto com a troca de senha', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: false });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    await request(app)
      .post('/auth/senha')
      .send({ email: EMAIL, codigo: CODIGO, novaSenha: 'NovaSenha#1' });

    expect(mockEstado.confirmados).toEqual([USUARIO_ID]);
  });

  /* Dado: um código errado;
     Quando: a troca é pedida;
     Então: 400 e a senha permanece. */
  it('recusa código errado', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: true });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .post('/auth/senha')
      .send({ email: EMAIL, codigo: '111111', novaSenha: 'NovaSenha#1' });

    expect(res.status).toBe(400);
    expect(mockEstado.senhasTrocadas).toHaveLength(0);
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
    mockEstado.usuario = usuarioFalso({ verificado: true });

    const res = await request(app)
      .post('/users/me/exclusao/codigo')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('a*****@exemplo.com');
    expect(mockEstado.emailsEnviados).toEqual([{ para: EMAIL }]);
  });

  /* Dado: uma requisição sem token;
     Quando: o código de exclusão é pedido;
     Então: 401 e nenhum e-mail sai. Excluir é ação do dono da sessão, não
     de quem conhece um endereço. */
  it('exige autenticação para pedir o código', async () => {
    const res = await request(app).post('/users/me/exclusao/codigo');

    expect(res.status).toBe(401);
    expect(mockEstado.emailsEnviados).toHaveLength(0);
  });

  /* Dado: token válido e código válido;
     Quando: a exclusão é confirmada;
     Então: 204 e a conta é marcada como excluída. */
  it('exclui a conta com token e código válidos', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: true });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .delete('/users/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ codigo: CODIGO });

    expect(res.status).toBe(204);
    expect(mockEstado.excluidos).toEqual([USUARIO_ID]);
  });

  /* Dado: um cliente HTTP que não envia corpo em DELETE;
     Quando: o código vai na query;
     Então: funciona igual — a rota aceita as duas formas. */
  it('aceita o código pela query string', async () => {
    mockEstado.usuario = usuarioFalso({ verificado: true });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .delete(`/users/me?codigo=${CODIGO}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(204);
    expect(mockEstado.excluidos).toEqual([USUARIO_ID]);
  });

  /* Dado: token válido mas nenhum código, ou um código errado;
     Quando: a exclusão é tentada;
     Então: 400 e a conta continua. Para uma ação irreversível, o token
     sozinho é pouco: ele não distingue o dono de alguém que encontrou o
     computador aberto. */
  it.each([
    ['sem código', undefined],
    ['código errado', '999999'],
  ])('recusa a exclusão %s', async (_rotulo, codigo) => {
    mockEstado.usuario = usuarioFalso({ verificado: true });
    mockEstado.codigoAtivo = await codigoAtivoFalso();

    const res = await request(app)
      .delete('/users/me')
      .set('Authorization', `Bearer ${token()}`)
      .send(codigo ? { codigo } : {});

    expect(res.status).toBe(400);
    expect(mockEstado.excluidos).toHaveLength(0);
  });

  /* Dado: uma requisição sem token;
     Quando: a exclusão é tentada;
     Então: 401. */
  it('exige autenticação para excluir', async () => {
    const res = await request(app).delete('/users/me').send({ codigo: CODIGO });

    expect(res.status).toBe(401);
    expect(mockEstado.excluidos).toHaveLength(0);
  });
});
