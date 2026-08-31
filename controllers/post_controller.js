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

/**
 * GET /posts/:id — uma publicação específica.
 *
 * O controlador não decide nada: extrai o que veio da requisição, delega e
 * traduz o resultado em resposta HTTP. A identidade vem de `req.userId`,
 * posto ali pelo middleware de autenticação a partir do token — nunca do
 * corpo ou da query, que o cliente controla.
 */
async function buscarPorId(req, res, next) {
  try {
    const post = await postService.buscarPorId(req.params.id, req.userId);
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
async function listarDoAutor(req, res, next) {
  try {
    const { pagina, limite } = req.query;
    const resultado = await postService.listarDoAutor({
      alias: req.params.alias,
      visitanteId: req.userId,
      pagina,
      limite,
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

async function editar(req, res, next) {
  try {
    const post = await postService.editar(req.params.id, req.userId, req.body?.texto);
    res.status(200).json(post);
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
module.exports = { listar, buscarPorId, listarDoAutor, criar, editar, excluir, curtir, descurtir };