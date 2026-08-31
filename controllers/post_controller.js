const postService = require('../services/post_service');

async function listar(req, res, next) {
  try {
    const { pagina, limite, q } = req.query;
    const resultado = await postService.listar({
      usuarioId: req.userId,
      pagina,
      limite,
      q,
    });
    res.status(200).json(resultado);
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const post = await postService.criar(req.userId, req.body?.texto);
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
}

async function excluir(req, res, next) {
  try {
    await postService.excluir(req.params.id, req.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
async function curtir(req, res, next) {
  try {
    const resultado = await postService.alternarCurtida(req.params.id, req.userId, true);
    res.status(200).json(resultado);
  } catch (err) {
    next(err);
  }
}

async function descurtir(req, res, next) {
  try {
    const resultado = await postService.alternarCurtida(req.params.id, req.userId, false);
    res.status(200).json(resultado);
  } catch (err) {
    next(err);
  }
}
module.exports = { listar, criar, excluir, curtir, descurtir };