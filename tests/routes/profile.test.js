const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const USER_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';

const mockState = {
  passwordHash: null,
  emailInUse: false,
  countryExists: true,
  updates: [],
  row: null,
};

function baseRow() {
  return {
    id: USER_ID,
    full_name: 'John Doe',
    alias: 'john.doe',
    email: 'john@exemplo.com',
    password_hash: mockState.passwordHash,
    nationality: 'BRA',
    birth_date: '1990-05-14',
    bio: null,
    pic_url: null,
    created_at: '2026-02-01T10:00:00Z',
    deleted_at: null,
    followers: 0,
    following: 0,
    is_following: 0,
  };
}

jest.mock('../../repositories/users_repository', () => {
  const User = require('../../models/user');

  return class UsersRepositoryFake {
    async findProfile() {
      if (!mockState.row) return null;
      return {
        user: User.fromRow(mockState.row),
        followers: 0,
        following: 0,
        isFollowing: false,
      };
    }
    async update(_id, fields) {
      mockState.updates.push(fields);
      return 1;
    }
    async emailInUse() {
      return mockState.emailInUse;
    }
  };
});

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFake {
    async listAll() { return []; }
    async exists() { return mockState.countryExists; }
  }
);

jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFake {});


const app = require('../../server');

const token = () =>
  jwt.sign({ id: USER_ID, name: 'John Doe' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const patch = (corpo) =>
  request(app).patch('/users/me').set('Authorization', `Bearer ${token()}`).send(corpo);

beforeAll(async () => {
  mockState.passwordHash = await bcrypt.hash('SenhaForte#1', 12);
});

beforeEach(() => {
  mockState.emailInUse = false;
  mockState.countryExists = true;
  mockState.updates = [];
  mockState.row = baseRow();
});

/* ---------- Autorização ---------- */

describe('PATCH /users/me — autorização', () => {
  it('exige token', async () => {
    const res = await request(app).patch('/users/me').send({ bio: 'x' });
    expect(res.status).toBe(401);
  });
});

/* ---------- Atualização parcial ---------- */

describe('PATCH /users/me — campos simples', () => {
  it('atualiza a bio e devolve o perfil completo', async () => {
    const res = await patch({ bio: 'Desenvolvedor Node.js.' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alias');
    expect(res.body).toHaveProperty('followers');
    expect(mockState.updates[0]).toEqual({ bio: 'Desenvolvedor Node.js.' });
  });

  it('normaliza espaços em excesso no name', async () => {
    await patch({ name: '  Abraão   Filipi  ' });
    expect(mockState.updates[0].name).toBe('Abraão Filipi');
  });

  it('converte bio vazia em null', async () => {
    await patch({ bio: '   ' });
    expect(mockState.updates[0].bio).toBeNull();
  });

  it('recusa bio acima de 280 caracteres', async () => {
    const res = await patch({ bio: 'a'.repeat(281) });
    expect(res.status).toBe(400);
    expect(mockState.updates).toHaveLength(0);
  });

  it('recusa name curto demais', async () => {
    expect((await patch({ name: 'A' })).status).toBe(400);
  });

  it('recusa corpo sem nenhum campo editável', async () => {
    const res = await patch({ hackeado: true });
    expect(res.status).toBe(400);
  });

  it('não grava nada quando um dos campos é inválido', async () => {
    const res = await patch({ bio: 'válida', name: 'A' });

    expect(res.status).toBe(400);
    expect(mockState.updates).toHaveLength(0);
  });
});

/* ---------- Nascimento e nationality ---------- */

describe('PATCH /users/me — birthDate e nationality', () => {
  it('recusa menores de 13 anos', async () => {
    const ano = new Date().getFullYear() - 10;
    expect((await patch({ birthDate: `${ano}-01-01` })).status).toBe(400);
  });

  it('aceita data válida e guarda apenas a parte de calendário', async () => {
    await patch({ birthDate: '2004-01-20T02:00:00.000Z' });
    expect(mockState.updates[0].birthDate).toBe('2004-01-20');
  });

  it('normaliza a nationality para maiúsculas', async () => {
    await patch({ nationality: 'prt' });
    expect(mockState.updates[0].nationality).toBe('PRT');
  });

  it('recusa nationality inexistente na tabela', async () => {
    mockState.countryExists = false;
    const res = await patch({ nationality: 'XYZ' });

    expect(res.status).toBe(400);
    expect(mockState.updates).toHaveLength(0);
  });
});

/* ---------- Troca de e-mail ---------- */

describe('PATCH /users/me — troca de e-mail', () => {
  it('recusa com 401 quando a password atual não é informada', async () => {
    const res = await patch({ email: 'novo@exemplo.com' });

    expect(res.status).toBe(401);
    expect(mockState.updates).toHaveLength(0);
  });

  it('recusa com 401 quando a password atual está errada', async () => {
    const res = await patch({ email: 'novo@exemplo.com', currentPassword: 'ErradaX#9' });

    expect(res.status).toBe(401);
    expect(mockState.updates).toHaveLength(0);
  });

  it('aceita com a password correta', async () => {
    const res = await patch({ email: 'novo@exemplo.com', currentPassword: 'SenhaForte#1' });

    expect(res.status).toBe(200);
    expect(mockState.updates[0].email).toBe('novo@exemplo.com');
  });

  it('recusa com 409 quando o e-mail pertence a outra conta', async () => {
    mockState.emailInUse = true;
    const res = await patch({ email: 'ocupado@exemplo.com', currentPassword: 'SenhaForte#1' });

    expect(res.status).toBe(409);
    expect(mockState.updates).toHaveLength(0);
  });

  /* Sem mudança real de e-mail, não faz sentido pedir password */
  it('não exige password quando o e-mail enviado é o mesmo já cadastrado', async () => {
    const res = await patch({ email: 'JOHN@exemplo.com' });

    expect(res.status).toBe(200);
    expect(mockState.updates[0].email).toBe('john@exemplo.com');
  });

  it('nunca devolve a password atual na resposta', async () => {
    const res = await patch({ email: 'novo@exemplo.com', currentPassword: 'SenhaForte#1' });

    expect(JSON.stringify(res.body)).not.toContain('SenhaForte');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  it('não repassa senhaAtual como campo do banco', async () => {
    await patch({ email: 'novo@exemplo.com', currentPassword: 'SenhaForte#1' });
    expect(mockState.updates[0]).not.toHaveProperty('senhaAtual');
  });
});