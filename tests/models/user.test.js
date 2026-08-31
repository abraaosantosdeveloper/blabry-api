const User = require('../../models/user');

const create = (extras = {}) => new User({
  id: 'uuid-1',
  name: 'John Doe',
  alias: 'john.doe',
  email: 'john@exemplo.com',
  passwordHash: '$2b$12$hashfalso',
  nationality: 'BRA',
  birthDate: '1990-05-14',
  bio: 'Uma bio qualquer.',
  createdAt: '2026-02-01T10:00:00Z',
  ...extras,
});

describe('User — proteção do hash de password', () => {
  it('não expõe o hash em JSON.stringify', () => {
    const json = JSON.stringify(create());
    expect(json).not.toContain('hashfalso');
    expect(json).not.toContain('passwordHash');
  });

  it('não expõe o hash em espalhamento de objeto', () => {
    expect({ ...create() }).not.toHaveProperty('passwordHash');
  });

  it('mantém o hash acessível para quem pedir explicitamente', () => {
    expect(create().passwordHash).toBe('$2b$12$hashfalso');
  });
});

describe('User — verificação de password', () => {
  it('aceita a password correta e recusa a errada', async () => {
    const hash = await User.hashPassword('SenhaForte#1');
    const user = create({ passwordHash: hash });

    await expect(user.verifyPassword('SenhaForte#1')).resolves.toBe(true);
    await expect(user.verifyPassword('outraSenha')).resolves.toBe(false);
  });

  it('recusa quando não há hash', async () => {
    await expect(create({ passwordHash: null }).verifyPassword('qualquer')).resolves.toBe(false);
  });
});

describe('User — paraPerfil', () => {
  /* O perfil público expõe apenas a apresentação. Dados pessoais ficam
     restritos ao dono — inclusive a nationality, que combinada a name e
     foto contribui para identificar alguém e não ajuda o visitante a
     decidir se quer seguir a pessoa. */
  it('esconde todos os dados pessoais no perfil público', () => {
    const perfil = create().toProfile({ followers: 10, following: 5, isFollowing: true });

    expect(perfil.email).toBeNull();
    expect(perfil.birthDate).toBeNull();
    expect(perfil.nationality).toBeNull();

    // A apresentação permanece.
    expect(perfil.name).toBe('John Doe');
    expect(perfil.alias).toBe('john.doe');
    expect(perfil.bio).toBe('Uma bio qualquer.');
    expect(perfil.followers).toBe(10);
    expect(perfil.isFollowing).toBe(true);
  });

  it('mostra os dados pessoais no próprio perfil, e anula isFollowing', () => {
    const perfil = create().toProfile({ own: true, followers: 10, following: 5 });

    expect(perfil.email).toBe('john@exemplo.com');
    expect(perfil.birthDate).toBe('1990-05-14');
    expect(perfil.nationality).toBe('BRA');
    expect(perfil.isFollowing).toBeNull();
  });

  it('deriva o ano de entrada a partir da data de criação', () => {
    expect(create().toProfile({}).memberSince).toBe(2026);
  });

  it('funciona sem argumento nenhum', () => {
    expect(() => create().toProfile()).not.toThrow();
  });
    it('funciona sem argumento nenhum', () => {
    expect(() => create().toProfile()).not.toThrow();
  });

  it('devolve a data de birthDate sem conversão de fuso', () => {
    const perfil = create({ birthDate: new Date('2004-01-20T02:00:00.000Z') })
      .toProfile({ own: true });

    expect(perfil.birthDate).toBe('2004-01-20');
  });
});