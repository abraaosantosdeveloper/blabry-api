const jwt = require('jsonwebtoken');
const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const AuthRepository = require('../repositories/auth_repository');
const User = require('../models/user');

const authRepository = new AuthRepository(pool);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nome: usuario.nome },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

async function cadastrarUsuario({ nome, apelido, email, senha, nascimento, nacionalidade }) {
  if (!nome || !apelido || !email || !senha || !nascimento || !nacionalidade)
    throw erro('Campos obrigatórios ausentes', 400);

  if (await authRepository.buscarPorEmail(email))
    throw erro('Credenciais inválidas', 409);

  if (await authRepository.buscarPorApelido(apelido))
    throw erro('Este @ já está em uso', 409);

  const usuario = new User({
    id: uuidv7(),
    nome,
    apelido,
    email,
    senhaHash: await User.gerarHash(senha),
    nacionalidade,
    nascimento,
  });

  await authRepository.criar(usuario);

  return { token: gerarToken(usuario), usuario };
}

async function login({ email, senha }) {
  if (!email || !senha)
    throw erro('Campos obrigatórios ausentes', 400);

  // Aceita email ou @alias no mesmo campo.
  const identificador = String(email).trim();
  const usuario = EMAIL_RE.test(identificador)
    ? await authRepository.buscarPorEmail(identificador)
    : await authRepository.buscarPorApelido(identificador.replace(/^@/, ''));

  const senhaValida = usuario && await usuario.verificarSenha(senha);

  if (!usuario || !senhaValida)
    throw erro('Credenciais inválidas', 401);

  return { token: gerarToken(usuario), usuario };
}

module.exports = { cadastrarUsuario, login };
