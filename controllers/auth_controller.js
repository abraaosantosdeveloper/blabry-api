const authService = require('../services/auth_service');

async function cadastrarUsuario(req, res, next) {
  try {
    const { nome, apelido, email, senha, nacionalidade, nascimento } = req.body;
    const usuario = await authService.cadastrarUsuario({ nome, apelido, email, senha, nacionalidade, nascimento });
    res.status(201).json({ usuario });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    const resultado = await authService.login({ email, senha });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { cadastrarUsuario, login, logout };