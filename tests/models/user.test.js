const User = require('../../models/user');

const criar = (extras = {}) => new User({
  id: 'uuid-1',
  nome: 'John Doe',
  apelido: 'john.doe',
  email: 'john@exemplo.com',
  senhaHash: '$2b$12$hashfalso',
  nacionalidade: 'BRA',
  nascimento: '1990-05-14',
  bio: 'Uma bio qualquer.',
  criadoEm: '2026-02-01T10:00:00Z',
  ...extras,
});

describe('User — proteção do hash de senha', () => {
  it('não expõe o hash em JSON.stringify', () => {
    const json = JSON.stringify(criar());
    expect(json).not.toContain('hashfalso');
    expect(json).not.toContain('senhaHash');
  });

  it('não expõe o hash em espalhamento de objeto', () => {
    expect({ ...criar() }).not.toHaveProperty('senhaHash');
  });

  it('mantém o hash acessível para quem pedir explicitamente', () => {
    expect(criar().senhaHash).toBe('$2b$12$hashfalso');
  });
});

describe('User — verificação de senha', () => {
  it('aceita a senha correta e recusa a errada', async () => {
    const hash = await User.gerarHash('SenhaForte#1');
    const usuario = criar({ senhaHash: hash });

    await expect(usuario.verificarSenha('SenhaForte#1')).resolves.toBe(true);
    await expect(usuario.verificarSenha('outraSenha')).resolves.toBe(false);
  });

  it('recusa quando não há hash', async () => {
    await expect(criar({ senhaHash: null }).verificarSenha('qualquer')).resolves.toBe(false);
  });
});

describe('User — paraPerfil', () => {
  /* O perfil público expõe apenas a apresentação. Dados pessoais ficam
     restritos ao dono — inclusive a nacionalidade, que combinada a nome e
     foto contribui para identificar alguém e não ajuda o visitante a
     decidir se quer seguir a pessoa. */
  it('esconde todos os dados pessoais no perfil público', () => {
    const perfil = criar().paraPerfil({ seguidores: 10, seguindo: 5, seguindoEste: true });

    expect(perfil.email).toBeNull();
    expect(perfil.nascimento).toBeNull();
    expect(perfil.nacionalidade).toBeNull();

    // A apresentação permanece.
    expect(perfil.nome).toBe('John Doe');
    expect(perfil.alias).toBe('john.doe');
    expect(perfil.bio).toBe('Uma bio qualquer.');
    expect(perfil.seguidores).toBe(10);
    expect(perfil.seguindoEste).toBe(true);
  });

  it('mostra os dados pessoais no próprio perfil, e anula seguindoEste', () => {
    const perfil = criar().paraPerfil({ proprio: true, seguidores: 10, seguindo: 5 });

    expect(perfil.email).toBe('john@exemplo.com');
    expect(perfil.nascimento).toBe('1990-05-14');
    expect(perfil.nacionalidade).toBe('BRA');
    expect(perfil.seguindoEste).toBeNull();
  });

  it('deriva o ano de entrada a partir da data de criação', () => {
    expect(criar().paraPerfil({}).desde).toBe(2026);
  });

  it('funciona sem argumento nenhum', () => {
    expect(() => criar().paraPerfil()).not.toThrow();
  });
    it('funciona sem argumento nenhum', () => {
    expect(() => criar().paraPerfil()).not.toThrow();
  });

  it('devolve a data de nascimento sem conversão de fuso', () => {
    const perfil = criar({ nascimento: new Date('2004-01-20T02:00:00.000Z') })
      .paraPerfil({ proprio: true });

    expect(perfil.nascimento).toBe('2004-01-20');
  });
});