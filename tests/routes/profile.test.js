const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const USUARIO_ID = '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90';

const mockEstado = {
  senhaHash: null,
  emailEmUso: false,
  paisExiste: true,
  atualizacoes: [],
  linha: null,
};

function linhaBase() {
  return {
    id: USUARIO_ID,
    full_name: 'John Doe',
    alias: 'john.doe',
    email: 'john@exemplo.com',
    password_hash: mockEstado.senhaHash,
    nationality: 'BRA',
    birth_date: '1990-05-14',
    bio: null,
    pic_url: null,
    created_at: '2026-02-01T10:00:00Z',
    deleted_at: null,
    seguidores: 0,
    seguindo: 0,
    seguindo_este: 0,
  };
}

jest.mock('../../repositories/users_repository', () => {
  const User = require('../../models/user');

  return class UsuariosRepositoryFalso {
    async buscarPerfil() {
      if (!mockEstado.linha) return null;
      return {
        usuario: User.deLinha(mockEstado.linha),
        seguidores: 0,
        seguindo: 0,
        seguindoEste: false,
      };
    }
    async atualizar(_id, campos) {
      mockEstado.atualizacoes.push(campos);
      return 1;
    }
    async emailEmUso() {
      return mockEstado.emailEmUso;
    }
  };
});

jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso {
    async listarPaises() { return []; }
    async existe() { return mockEstado.paisExiste; }
  }
);

jest.mock('../../repositories/auth_repository', () => class AuthRepositoryFalso {});


const app = require('../../server');

const token = () =>
  jwt.sign({ id: USUARIO_ID, nome: 'John Doe' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const patch = (corpo) =>
  request(app).patch('/users/me').set('Authorization', `Bearer ${token()}`).send(corpo);

beforeAll(async () => {
  mockEstado.senhaHash = await bcrypt.hash('SenhaForte#1', 12);
});

beforeEach(() => {
  mockEstado.emailEmUso = false;
  mockEstado.paisExiste = true;
  mockEstado.atualizacoes = [];
  mockEstado.linha = linhaBase();
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
    expect(res.body).toHaveProperty('seguidores');
    expect(mockEstado.atualizacoes[0]).toEqual({ bio: 'Desenvolvedor Node.js.' });
  });

  it('normaliza espaços em excesso no nome', async () => {
    await patch({ nome: '  Abraão   Filipi  ' });
    expect(mockEstado.atualizacoes[0].nome).toBe('Abraão Filipi');
  });

  it('converte bio vazia em null', async () => {
    await patch({ bio: '   ' });
    expect(mockEstado.atualizacoes[0].bio).toBeNull();
  });

  it('recusa bio acima de 280 caracteres', async () => {
    const res = await patch({ bio: 'a'.repeat(281) });
    expect(res.status).toBe(400);
    expect(mockEstado.atualizacoes).toHaveLength(0);
  });

  it('recusa nome curto demais', async () => {
    expect((await patch({ nome: 'A' })).status).toBe(400);
  });

  it('recusa corpo sem nenhum campo editável', async () => {
    const res = await patch({ hackeado: true });
    expect(res.status).toBe(400);
  });

  it('não grava nada quando um dos campos é inválido', async () => {
    const res = await patch({ bio: 'válida', nome: 'A' });

    expect(res.status).toBe(400);
    expect(mockEstado.atualizacoes).toHaveLength(0);
  });
});

/* ---------- Nascimento e nacionalidade ---------- */

describe('PATCH /users/me — nascimento e nacionalidade', () => {
  it('recusa menores de 13 anos', async () => {
    const ano = new Date().getFullYear() - 10;
    expect((await patch({ nascimento: `${ano}-01-01` })).status).toBe(400);
  });

  it('aceita data válida e guarda apenas a parte de calendário', async () => {
    await patch({ nascimento: '2004-01-20T02:00:00.000Z' });
    expect(mockEstado.atualizacoes[0].nascimento).toBe('2004-01-20');
  });

  it('normaliza a nacionalidade para maiúsculas', async () => {
    await patch({ nacionalidade: 'prt' });
    expect(mockEstado.atualizacoes[0].nacionalidade).toBe('PRT');
  });

  it('recusa nacionalidade inexistente na tabela', async () => {
    mockEstado.paisExiste = false;
    const res = await patch({ nacionalidade: 'XYZ' });

    expect(res.status).toBe(400);
    expect(mockEstado.atualizacoes).toHaveLength(0);
  });
});

/* ---------- Troca de e-mail ---------- */

describe('PATCH /users/me — troca de e-mail', () => {
  it('recusa com 401 quando a senha atual não é informada', async () => {
    const res = await patch({ email: 'novo@exemplo.com' });

    expect(res.status).toBe(401);
    expect(mockEstado.atualizacoes).toHaveLength(0);
  });

  it('recusa com 401 quando a senha atual está errada', async () => {
    const res = await patch({ email: 'novo@exemplo.com', senhaAtual: 'ErradaX#9' });

    expect(res.status).toBe(401);
    expect(mockEstado.atualizacoes).toHaveLength(0);
  });

  it('aceita com a senha correta', async () => {
    const res = await patch({ email: 'novo@exemplo.com', senhaAtual: 'SenhaForte#1' });

    expect(res.status).toBe(200);
    expect(mockEstado.atualizacoes[0].email).toBe('novo@exemplo.com');
  });

  it('recusa com 409 quando o e-mail pertence a outra conta', async () => {
    mockEstado.emailEmUso = true;
    const res = await patch({ email: 'ocupado@exemplo.com', senhaAtual: 'SenhaForte#1' });

    expect(res.status).toBe(409);
    expect(mockEstado.atualizacoes).toHaveLength(0);
  });

  /* Sem mudança real de e-mail, não faz sentido pedir senha */
  it('não exige senha quando o e-mail enviado é o mesmo já cadastrado', async () => {
    const res = await patch({ email: 'JOHN@exemplo.com' });

    expect(res.status).toBe(200);
    expect(mockEstado.atualizacoes[0].email).toBe('john@exemplo.com');
  });

  it('nunca devolve a senha atual na resposta', async () => {
    const res = await patch({ email: 'novo@exemplo.com', senhaAtual: 'SenhaForte#1' });

    expect(JSON.stringify(res.body)).not.toContain('SenhaForte');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  it('não repassa senhaAtual como campo do banco', async () => {
    await patch({ email: 'novo@exemplo.com', senhaAtual: 'SenhaForte#1' });
    expect(mockEstado.atualizacoes[0]).not.toHaveProperty('senhaAtual');
  });
});