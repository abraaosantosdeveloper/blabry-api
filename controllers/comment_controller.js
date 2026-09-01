const commentService = require('../services/comment_service');

async function list(req, res, next) {
  try {
    const { page, limit } = req.query;
    res.status(200).json(await commentService.list(req.params.id, { page, limit }));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const comment = await commentService.create(req.params.id, req.userId, req.body?.text);
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

async function edit(req, res, next) {
  try {
    const comment = await commentService.edit(
      req.params.commentId,
      req.userId,
      req.body?.text
    );
    res.status(200).json(comment);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await commentService.remove(req.params.commentId, req.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, edit, remove };