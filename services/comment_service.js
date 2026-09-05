const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const CommentRepository = require('../repositories/comment_repository');
const PostRepository = require('../repositories/post_repository');
const Comment = require('../models/comment');
const { WINDOW_MINUTES, withinWindow } = require('../utils/edit_window');

const commentRepository = new CommentRepository(pool);
const postRepository = new PostRepository(pool);

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

const MAX_TEXT = 500;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function intInRange(value, { fallback, min, max }) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

async function list(postId, { page, limit } = {}) {
  if (!(await postRepository.exists(postId)))
    throw fail('Publicação não encontrada', 404);

  const currentPage = intInRange(page, { fallback: 1, min: 1, max: Number.MAX_SAFE_INTEGER });
  const perPage = intInRange(limit, { fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });

  const { comments, total } = await commentRepository.listByPost(postId, {
    limit: perPage,
    offset: (currentPage - 1) * perPage,
  });

  return {
    comments,
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    total,
  };
}

async function create(postId, userId, text) {
  const content = String(text ?? '').trim();

  if (!content)
    throw fail('O comentário não pode estar vazio', 400);

  if (content.length > MAX_TEXT)
    throw fail(`O comentário deve ter no máximo ${MAX_TEXT} caracteres`, 400);

  if (!(await postRepository.exists(postId)))
    throw fail('Publicação não encontrada', 404);

  const comment = new Comment({
    id: uuidv7(),
    text: content,
    postId,
    authorId: userId,
  });

  return commentRepository.create(comment);
}
/**
 * Edita um comentário do próprio autor, dentro da janela de tempo.
 *
 * A ordem das verificações reflete a precedência dos erros: formato do
 * texto primeiro (não depende de nada), depois existência, depois autoria,
 * e só então a janela — informar "prazo esgotado" a quem nem é o autor
 * revelaria que o comentário existe.
 */
async function edit(id, userId, text) {
  const content = String(text ?? '').trim();

  if (!content)
    throw fail('O comentário não pode estar vazio', 400);

  if (content.length > MAX_TEXT)
    throw fail(`O comentário deve ter no máximo ${MAX_TEXT} caracteres`, 400);

  const comment = await commentRepository.findById(id);

  if (!comment)
    throw fail('Comentário não encontrado', 404);

  if (!comment.belongsTo(userId))
    throw fail('Você só pode editar seus próprios comentários', 403);

  if (!withinWindow(comment.createdAt))
    throw fail(`A edição só é possível nos primeiros ${WINDOW_MINUTES} minutos`, 409);

  if (content === comment.text)
    return comment;   // nada mudou: não marca como editado

  await commentRepository.update(id, userId, content);
  return commentRepository.findById(id);
}

async function remove(id, userId) {
  const removed = await commentRepository.remove(id, userId);
  if (removed) return;

  const comment = await commentRepository.findById(id);

  if (!comment) throw fail('Comentário não encontrado', 404);
  if (!comment.belongsTo(userId)) throw fail('Você só pode remover seus próprios comentários', 403);

  throw fail('Não foi possível remover o comentário', 500);
}



module.exports = { list, create, edit, remove };