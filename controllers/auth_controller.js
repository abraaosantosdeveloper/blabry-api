const authService = require('../services/auth_service');
const jwt = require('jsonwebtoken');

async function cadastrarUsuario(req, res, next) {
  try {
    const { nome, apelido, email, senha } = req.body;
    const usuario = await authService.cadastrarUsuario({ nome, apelido, email, senha });
    res.status(201).json({ usuario });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    const usuario = await authService.login({ email, senha });

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, usuario });
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