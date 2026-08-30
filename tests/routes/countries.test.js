const request = require('supertest');


// A rota é testada isolada do banco: o repositório é substituído.
jest.mock('../../repositories/countries_repository', () =>
  class CountriesRepositoryFalso {
    async listarPaises() {
      return [
        { country: 'AFG', name: 'Afeganistão' },
        { country: 'BRA', name: 'Brasil' },
      ];
    }
  }
);

const app = require('../../server');

describe('GET /countries', () => {
  it('responde 200 sem token — é uma rota pública', async () => {
    const res = await request(app).get('/countries');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('devolve os países no formato { country, name }', async () => {
    const { body } = await request(app).get('/countries');

    expect(body[0]).toEqual({ country: 'AFG', name: 'Afeganistão' });
    expect(body[0]).not.toHaveProperty('id');
  });
});

describe('Proteção das rotas', () => {
  it('responde 401 numa rota protegida sem token', async () => {
    const res = await request(app).get('/rota-protegida-qualquer');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('erro');
  });
});