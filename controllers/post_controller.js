const postService = require('../services/post_service');
const pillUpdateStream = require('../services/pill_update_stream');

async function list(req, res, next) {
  try {
    const { page, limit, q } = req.query;
    const result = await postService.list({
      userId: req.userId,
      page,
      limit,
      q,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /posts/:id — uma publicação específica.
 *
 * O controlador não decide nada: extrai o que veio da requisição, delega e
 * traduz o result em resposta HTTP. A identidade vem de `req.userId`,
 * posto ali pelo middleware de autenticação a partir do token — nunca do
 * corpo ou da query, que o cliente controla.
 */
async function findById(req, res, next) {
  try {
    const post = await postService.findById(req.params.id, req.userId);
    res.status(200).json(post);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /users/:alias/posts — publicações de um autor.
 *
 * Mora neste controlador, e não no de usuários, porque o recurso devolvido
 * é publicação: quem mexer nas regras de post deve encontrar tudo em um
 * lugar só. A rota é registrada no arquivo de usuários apenas porque o
 * caminho começa por /users.
 */
async function listByAuthor(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await postService.listByAuthor({
      alias: req.params.alias,
      viewerId: req.userId,
      page,
      limit,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const post = await postService.create(req.userId, req.body?.text);
    pillUpdateStream.publish('new-post', {}, req.userId);
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
}

async function edit(req, res, next) {
  try {
    const post = await postService.edit(req.params.id, req.userId, req.body?.text);
    res.status(200).json(post);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await postService.remove(req.params.id, req.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
async function like(req, res, next) {
  try {
    const result = await postService.toggleLike(req.params.id, req.userId, true);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function unlike(req, res, next) {
  try {
    const result = await postService.toggleLike(req.params.id, req.userId, false);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
module.exports = { list, findById, listByAuthor, create, edit, remove, like, unlike };