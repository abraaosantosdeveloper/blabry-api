const request = require('supertest');
const jwt = require('jsonwebtoken');

const USUARIO_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';

/* O prefixo "mock" é obrigatório: a fábrica do jest.mock() é içada para o
   topo do arquivo, e só variáveis com esse prefixo podem ser referenciadas
   lá dentro. */
const mockEstado = {
  chamadas: [],       // argumentos que o repositório recebeu
  usuarios: [],       // o que ele devolve
  total: 0,
};

jest.mock('../../repositories/usuarios_repository', () =>
  class UsuariosRepositoryFalso {
    async buscar(argumentos) {
      mockEstado.chamadas.push(argumentos);
      return { usuarios: mockEstado.usuarios, total: mockEstado.total };
    }
    async buscarPerfil() { return null; }
  }
);

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso {
    async listarPaises() { return []; }
    async existe() { return true; }
  }
);

jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFalso {});
jest.mock('../../repositories/post_repository', () => class PostRepositoryFalso {});
jest.mock('../../repositories/comment_repository', () => class CommentRepositoryFalso {});

const app = require('../../server');

const token = () =>
  jwt.sign({ id: USUARIO_ID, nome: 'Teste' }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Atalho para a requisição autenticada, com os parâmetros da URL. */
const buscar = (query) =>
  request(app).get('/users').query(query).set('Authorization', `Bearer ${token()}`);

const usuarioFalso = (alias) => ({
  nome: `Usuário ${alias}`, alias, fotoUrl: null, bio: null,
});

beforeEach(() => {
  mockEstado.chamadas = [];
  mockEstado.usuarios = [];
  mockEstado.total = 0;
});

describe('GET /users — autorização', () => {
  it('exige token', async () => {
    const res = await request(app).get('/users').query({ q: 'abra' });
    expect(res.status).toBe(401);
  });
});

describe('GET /users — termo de busca', () => {
  it('devolve os resultados no formato paginado', async () => {
    mockEstado.usuarios = [usuarioFalso('abraao'), usuarioFalso('abrantes')];
    mockEstado.total = 2;

    const res = await buscar({ q: 'abra' });

    expect(res.status).toBe(200);
    expect(res.body.usuarios).toHaveLength(2);
    expect(res.body).toMatchObject({ pagina: 1, totalPaginas: 1, total: 2 });
  });

  /* Um filtro que não pode ser satisfeito devolve conjunto vazio. Devolver a
     base inteira faria o usuário acreditar que aqueles resultados casam com
     o que ele digitou. */
  it('devolve lista vazia para termo com menos de 2 caracteres', async () => {
    const res = await buscar({ q: 'a' });

    expect(res.status).toBe(200);
    expect(res.body.usuarios).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(mockEstado.chamadas).toHaveLength(0);   // nem consultou o banco
  });

  it('devolve lista vazia quando o termo é omitido', async () => {
    const res = await buscar({});

    expect(res.status).toBe(200);
    expect(res.body.usuarios).toEqual([]);
    expect(mockEstado.chamadas).toHaveLength(0);
  });

  /* O @ é conveniência de quem digita; o alias gravado não o contém. */
  it('remove o @ antes de consultar', async () => {
    await buscar({ q: '@abraao' });
    expect(mockEstado.chamadas[0].q).toBe('abraao');
  });

  it('ignora espaços em volta do termo', async () => {
    await buscar({ q: '  abraao  ' });
    expect(mockEstado.chamadas[0].q).toBe('abraao');
  });
});

describe('GET /users — paginação', () => {
  it('converte página em deslocamento', async () => {
    mockEstado.total = 30;
    await buscar({ q: 'abra', pagina: '3', limite: '8' });

    // Página 3 com 8 por página começa na 17ª linha.
    expect(mockEstado.chamadas[0]).toMatchObject({ limite: 8, offset: 16 });
  });

  it('calcula o total de páginas arredondando para cima', async () => {
    mockEstado.total = 21;
    const res = await buscar({ q: 'abra', limite: '8' });

    expect(res.body.totalPaginas).toBe(3);   // 21 / 8 = 2,625
  });

  /* Lista vazia ainda tem uma página: sem isso a interface exibiria
     "Página 1 de 0". */
  it('nunca informa zero páginas', async () => {
    mockEstado.total = 0;
    const res = await buscar({ q: 'abra' });

    expect(res.body.totalPaginas).toBe(1);
  });

  it('limita a quantidade por página ao teto do servidor', async () => {
    await buscar({ q: 'abra', limite: '100000' });
    expect(mockEstado.chamadas[0].limite).toBe(50);
  });

  it('usa os padrões quando os parâmetros não são numéricos', async () => {
    await buscar({ q: 'abra', pagina: 'abc', limite: 'xyz' });
    expect(mockEstado.chamadas[0]).toMatchObject({ limite: 8, offset: 0 });
  });

  it('trata página negativa como a primeira', async () => {
    await buscar({ q: 'abra', pagina: '-5' });
    expect(mockEstado.chamadas[0].offset).toBe(0);
  });
});

describe('GET /users — identidade', () => {
  /* O identificador de quem busca vem do token, nunca da URL: é o que impede
     alguém de consultar em nome de outro usuário. */
  it('usa o usuário do token como visitante', async () => {
    await buscar({ q: 'abra' });
    expect(mockEstado.chamadas[0].visitanteId).toBe(USUARIO_ID);
  });

  it('ignora um identificador enviado na query string', async () => {
    await buscar({ q: 'abra', usuarioId: 'outro-uuid', visitanteId: 'outro-uuid' });
    expect(mockEstado.chamadas[0].visitanteId).toBe(USUARIO_ID);
  });
});
