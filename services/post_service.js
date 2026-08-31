const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const PostRepository = require('../repositories/post_repository');
const UsersRepository = require('../repositories/users_repository');
const Post = require('../models/post');
const { WINDOW_MINUTES, withinWindow } = require('../utils/edit_window');

const postRepository = new PostRepository(pool);
/* A listagem por autor precisa traduzir o @ em id, e essa tradução já vive
   no repositório de usuários. Reaproveitar é melhor do que escrever um
   segundo SELECT em user aqui dentro — o mesmo SQL em dois lugares é o
   começo de duas regras divergentes. */
const usersRepository = new UsersRepository(pool);

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

const MAX_TEXT = 280;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/* O índice FULLTEXT do InnoDB ignora palavras menores que
   innodb_ft_min_token_size (padrão 3). */
const MINIMUM_SEARCH = 3;

/** Converte um valor da query string em inteiro dentro de uma faixa. */
function intInRange(value, { fallback, min, max }) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

/** Feed ou busca, paginados. */
async function list({ userId, page, limit, q } = {}) {
  const currentPage = intInRange(page, { fallback: 1, min: 1, max: Number.MAX_SAFE_INTEGER });
  const perPage = intInRange(limit, { fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });

  const term = String(q ?? '').trim();

  // Filtro que não pode ser satisfeito devolve vazio — jamais o feed inteiro.
  if (term && term.length < MINIMUM_SEARCH) {
    return { posts: [], page: 1, totalPages: 1, total: 0 };
  }

  const { posts, total } = await postRepository.list({
    viewerId: userId,
    q: term || null,
    limit: perPage,
    offset: (currentPage - 1) * perPage,
  });

  return {
    posts,
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    total,
  };
}

/**
 * Uma publicação específica, para a página dedicada do post.
 *
 * Recebe o id do visitante porque a resposta inclui `liked` — se ele
 * curtiu ou não. Esse dado é por observador, não do post.
 *
 * @param {string} id id da publicação
 * @param {string} viewerId id do usuário autenticado (vem do token)
 * @returns {Promise<Post>}
 */
async function findById(id, viewerId) {
  // Sem id não há o que buscar. 400 e não 404: o problema é a requisição,
  // não o recurso.
  if (!id) throw fail('Publicação não informada', 400);

  const post = await postRepository.findById(id, viewerId);

  // O repositório já filtra autores excluídos, então "não encontrado" aqui
  // cobre tanto o post inexistente quanto o post de uma conta apagada — do
  // ponto de vista de quem consulta, os dois casos são o mesmo.
  if (!post) throw fail('Publicação não encontrada', 404);

  return post;
}

/**
 * Publicações de um autor, paginadas — alimenta a seção de posts do perfil.
 *
 * A conversão de "página" para "offset" acontece aqui, e não no repositório,
 * porque são dois vocabulários distintos: a interface pensa em páginas, o
 * banco pensa em deslocamento de linhas. Misturar os dois faz o repositório
 * conhecer regras de apresentação.
 *
 * @param {{alias: string, viewerId: string, page?: any, limit?: any}} options
 * @returns {Promise<{posts: Post[], page: number, totalPages: number, total: number}>}
 */
async function listByAuthor({ alias, viewerId, page, limit } = {}) {
  if (!alias) throw fail('Usuário não informado', 400);

  // O @ pode chegar com a arroba na frente, dependendo de onde o cliente o
  // copiou. Ela nunca faz parte do valor armazenado.
  const handle = String(alias).replace(/^@/, '');

  const authorId = await usersRepository.findIdByAlias(handle);

  // Perfil inexistente é 404 aqui, e não uma lista vazia: lista vazia diria
  // "esse usuário não publicou nada", o que é uma afirmação diferente.
  if (!authorId) throw fail('Usuário não encontrado', 404);

  const currentPage = intInRange(page, { fallback: 1, min: 1, max: Number.MAX_SAFE_INTEGER });
  const perPage = intInRange(limit, { fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });

  const { posts, total } = await postRepository.listByAuthor({
    authorId,
    viewerId,
    limit: perPage,
    offset: (currentPage - 1) * perPage,
  });

  return {
    posts,
    page: currentPage,
    // Math.max(1, ...) para que uma lista vazia informe 1 página, e não 0:
    // "página 1 de 0" não faz sentido para quem lê a interface.
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    total,
  };
}

/** Cria uma publicação do usuário autenticado. */
async function create(userId, text) {
  const content = String(text ?? '').trim();

  if (!content)
    throw fail('O blab não pode estar vazio', 400);

  if (content.length > MAX_TEXT)
    throw fail(`O blab deve ter no máximo ${MAX_TEXT} caracteres`, 400);

  const post = new Post({
    id: uuidv7(),
    text: content,
    authorId: userId,
  });

  return postRepository.create(post, userId);
}

/**
 * Edita uma publicação do próprio autor, dentro da janela de tempo.
 * A ordem das verificações vai do que não depende de nada (formato) ao que
 * depende do estado (prazo) — e a autoria vem antes do prazo para não
 * revelar a existência do post a quem não é dono dele.
 */
async function edit(id, userId, text) {
  const content = String(text ?? '').trim();

  if (!content)
    throw fail('O blab não pode estar vazio', 400);

  if (content.length > MAX_TEXT)
    throw fail(`O blab deve ter no máximo ${MAX_TEXT} caracteres`, 400);

  const post = await postRepository.findById(id, userId);

  if (!post) throw fail('Publicação não encontrada', 404);
  if (!post.belongsTo(userId)) throw fail('Você só pode edit suas próprias publicações', 403);

  if (!withinWindow(post..createdAt))
    throw fail(`A edição só é possível nos primeiros ${WINDOW_MINUTES} minutos`, 409);

  if (content === post..text) return post;

  await postRepository.update(id, userId, content);
  return postRepository.findById(id, userId);
}

/**
 * Exclui uma publicação do próprio autor.
 *
 * A exclusão é tentada primeiro: a autoria está no WHERE, então não há
 * janela entre verificar e apagar. A consulta posterior só existe para
 * escolher entre 404 e 403 — ela informa a resposta, não autoriza a ação.
 */
async function remove(id, userId) {
  const removed = await postRepository.remove(id, userId);
  if (removed) return;

  const post = await postRepository.findById(id, userId);

  if (!post) throw fail('Publicação não encontrada', 404);
  if (!post.belongsTo(userId)) throw fail('Você só pode remove suas próprias publicações', 403);

  throw fail('Não foi possível remove a publicação', 500);

}

  /**
 * Curte ou descurte, e devolve o estado recontado no banco.
 * O cliente pode ter feito atualização otimista; a resposta é a verdade.
 */
async function toggleLike(postId, userId, like) {
  if (!(await postRepository.exists(postId)))
    throw fail('Publicação não encontrada', 404);

  if (like) {
    await postRepository.like(uuidv7(), postId, userId);
  } else {
    await postRepository.unlike(postId, userId);
  }

  return {
    likes: await postRepository.countLikes(postId),
    liked: like,
  };
}

module.exports = { list, findById, listByAuthor, create, remove, edit, toggleLike };