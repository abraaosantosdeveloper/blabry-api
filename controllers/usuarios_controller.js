const usuariosService = require('../services/usuarios_service');
const fotoService = require('../services/foto_service');

async function atualizarFoto(req, res, next) {
  try {
    const resultado = await fotoService.atualizarFotoDePerfil(req.userId, req.file);
    res.status(200).json(resultado);
  } catch (err) {
    next(err);
  }
}

async function meuPerfil(req, res, next) {
  try {
    const perfil = await usuariosService.meuPerfil(req.userId);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}

async function perfilPorAlias(req, res, next) {
  try {
    const perfil = await usuariosService.perfilPorAlias(req.params.alias, req.userId);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}

async function atualizarPerfil(req, res, next) {
  try {
    const perfil = await usuariosService.atualizarPerfil(req.userId, req.body);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}

module.exports = { meuPerfil, perfilPorAlias, atualizarFoto, atualizarPerfil };