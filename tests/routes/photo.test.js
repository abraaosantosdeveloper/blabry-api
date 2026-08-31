const request = require('supertest');

/* Cloudinary substituído: nenhum teste sai para a rede.
   O prefixo "mock" é o que permite referenciar a variável dentro da fábrica. */
const mockCloudinary = { calls: [], falhar: false };

jest.mock('../../config/cloudinary', () => ({
  uploader: {
    upload_stream(opcoes, callback) {
      mockCloudinary.calls.push(opcoes);
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

const mockDb = { linhasAfetadas: 1, url: null };

jest.mock('../../repositories/users_repository', () =>
  class UsersRepositoryFake {
    async updatePhoto(_id, url) {
      mockDb.url = url;
      return mockDb.linhasAfetadas;
    }
    async findProfile() { return null; }
  }
);

jest.mock('../../repositories/auth_repository', () =>
  class AuthRepositoryFake {}
);

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake {
    async listAll() { return []; }
  }
);

const jwt = require('jsonwebtoken');
const app = require('../../server');

const USER_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';
const token = () => jwt.sign({ id: USER_ID, name: 'Teste' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const fakeJpeg = (bytes = 1024) => Buffer.alloc(bytes, 0xff);

beforeEach(() => {
  mockCloudinary.calls = [];
  mockCloudinary.falhar = false;
  mockDb.linhasAfetadas = 1;
  mockDb.url = null;
});

describe('POST /users/photo', () => {
  it('exige autenticação', async () => {
    const res = await request(app)
      .post('/users/photo')
      .attach('photo', fakeJpeg(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });

  it('aceita um JPEG e devolve a URL gravada', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('photo', fakeJpeg(), { filename: 'perfil.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toContain('res.cloudinary.com');
    expect(mockDb.url).toBe(res.body.photoUrl);
  });

  /* RNF-B16 — validação antes do envio ao serviço externo */
  it('recusa formato não suportado com 415 e não chama o Cloudinary', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('photo', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(415);
    expect(mockCloudinary.calls).toHaveLength(0);
  });

  it('recusa arquivo acima de 5 MB com 413 e não chama o Cloudinary', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('photo', fakeJpeg(6 * 1024 * 1024), { filename: 'grande.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(mockCloudinary.calls).toHaveLength(0);
  });

  it('recusa campo de arquivo com name errado', async () => {
    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('imagem', fakeJpeg(), { filename: 'p.jpg', contentType: 'image/jpeg' });

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
      .attach('photo', fakeJpeg(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(mockDb.url).toBeNull();
  });

  it('responde 404 quando o usuário do token não existe mais', async () => {
    mockDb.linhasAfetadas = 0;

    const res = await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('photo', fakeJpeg(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it('envia com public_id do usuário e override habilitada', async () => {
    await request(app)
      .post('/users/photo')
      .set('Authorization', `Bearer ${token()}`)
      .attach('photo', fakeJpeg(), { filename: 'p.jpg', contentType: 'image/jpeg' });

    expect(mockCloudinary.calls[0]).toMatchObject({
      public_id: USER_ID,
      overwrite: true,
    });
  });
});