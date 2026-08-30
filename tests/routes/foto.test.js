const request = require('supertest');

/* Cloudinary substituído: nenhum teste sai para a rede.
   O prefixo "mock" é o que permite referenciar a variável dentro da fábrica. */
const mockCloudinary = { chamadas: [], falhar: false };

jest.mock('../../config/cloudinary', () => ({
  uploader: {
    upload_stream(opcoes, callback) {
      mockCloudinary.chamadas.push(opcoes);
      return {
        end(buffer) {
          if (mockCloudinary.falhar) return callback(new Error('falha simulada'));
          callback(null, {
            secure_url: `https://res.cloudinary.com/teste/${opcoes.public_id}.jpg`,
            bytes: buffer.length,
          });
        },
      };
    },
  },
}));

const mockBanco = { linhasAfetadas: 1, url: null };

jest.mock('../../repositories/usuarios_repository', () =>
  class UsuariosRepositoryFalso {
    async atualizarFoto(_id, url) {
      mockBanco.url = url;
      return mockBanco.linhasAfetadas;
    }
    async buscarPerfil() { return null; }
  }
);

jest.mock('../../repositories/auth_repository', () =>
  class AuthRepositoryFalso {}
);

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso {
    async listarPaises() { return []; }
  }
);

const jwt = require('jsonwebtoken');
const app = require('../../server');

const USUARIO_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const token = () => jwt.sign({ id: USUARIO_ID, nome: 'Teste' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const jpegFalso = (bytes = 1024) => Buffer.alloc(bytes, 0xff);

beforeEach(() => {
  mockCloudinary.chamadas = [];
  mockCloudinary.falhar = false;
  mockBanco.linhasAfetadas = 1;
  mockBanco.url = null;
});

describe('POST /users/photo', () => {
  it('exige autenticação', async () => {
    const res = await request(app)
      .post('/users/photo')
      .attach('foto', jpegFalso(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });

  it('aceita um JPEG e devolve a URL gravada', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('foto', jpegFalso(), { filename: 'perfil.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.fotoUrl).toContain('res.cloudinary.com');
    expect(mockBanco.url).toBe(res.body.fotoUrl);
  });

  /* RNF-B16 — validação antes do envio ao serviço externo */
  it('recusa formato não suportado com 415 e não chama o Cloudinary', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('foto', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(415);
    expect(mockCloudinary.chamadas).toHaveLength(0);
  });

  it('recusa arquivo acima de 5 MB com 413 e não chama o Cloudinary', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('foto', jpegFalso(6 * 1024 * 1024), { filename: 'grande.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(mockCloudinary.chamadas).toHaveLength(0);
  });

  it('recusa campo de arquivo com nome errado', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('imagem', jpegFalso(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('responde 400 quando nenhum arquivo é enviado', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(400);
  });

  it('responde 502 quando o Cloudinary falha', async () => {
    mockCloudinary.falhar = true;

    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('foto', jpegFalso(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(mockBanco.url).toBeNull();
  });

  it('responde 404 quando o usuário do token não existe mais', async () => {
    mockBanco.linhasAfetadas = 0;

    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('foto', jpegFalso(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it('envia com public_id do usuário e sobrescrita habilitada', async () => {
    await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('foto', jpegFalso(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(mockCloudinary.chamadas[0]).toMatchObject({
      public_id: USUARIO_ID,
      overwrite: true,
    });
  });
});