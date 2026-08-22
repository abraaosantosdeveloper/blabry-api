const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v7: uuidv7 } = require('uuid');
const authRepository = require('../repositories/auth_repository');

async function cadastrarUsuario({ nome, apelido, email, senha, nascimento, nacionalidade }) {
  if (!nome || !apelido || !email || !senha || !nascimento || !nacionalidade)
    throw Object.assign(new Error('Campos obrigatórios ausentes'), { status: 400 });

  const existe = await authRepository.buscarPorEmail(email);
  if (existe)
    throw Object.assign(new Error('Credenciais inválidas'), { status: 409 });

  const id = uuidv7();
  const hash = await bcrypt.hash(senha, 12);
  await authRepository.criarUsuario({ id, nome, apelido, email, senha: hash, nascimento, nacionalidade });

  const token = jwt.sign(
    {id, nome},
    process.env.JWT_SECRET,
    {expiresIn: '24h'}
  )
  return { token, usuario: { id, nome, email } }
}

async function login({ email, senha }) {
  if (!email || !senha)
    throw Object.assign(new Error('Campos obrigatórios ausentes'), { status: 400 });

  const usuario = await authRepository.buscarPorEmail(email);
  const senhaValida = usuario && await bcrypt.compare(senha, usuario.password_hash);

  if (!usuario || !senhaValida)
    throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });

  const token = jwt.sign(
    { id: usuario.id, nome: usuario.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, usuario: { id: usuario.id, nome: usuario.full_name, email: usuario.email } };
}

module.exports = { cadastrarUsuario, login };