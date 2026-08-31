const commentService = require('../services/comment_service');

async function listar(req, res, next) {
  try {
    const { pagina, limite } = req.query;
    res.status(200).json(await commentService.listar(req.params.id, { pagina, limite }));
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const comentario = await commentService.criar(req.params.id, req.userId, req.body?.texto);
    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
}

async function editar(req, res, next) {
  try {
    const comentario = await commentService.editar(
      req.params.comentarioId,
      req.userId,
      req.body?.texto
    );
    res.status(200).json(comentario);
  } catch (err) {
    next(err);
  }
}

async function excluir(req, res, next) {
  try {
    await commentService.excluir(req.params.comentarioId, req.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, criar, editar, excluir };