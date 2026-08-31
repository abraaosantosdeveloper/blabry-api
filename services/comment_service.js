const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const CommentRepository = require('../repositories/comment_repository');
const PostRepository = require('../repositories/post_repository');
const Comment = require('../models/comment');
const { JANELA_MINUTOS, dentroDaJanela } = require('../utils/edit_window');

const commentRepository = new CommentRepository(pool);
const postRepository = new PostRepository(pool);

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

const TEXTO_MAX = 280;
const LIMITE_PADRAO = 10;
const LIMITE_MAXIMO = 50;

function inteiroNaFaixa(valor, { padrao, minimo, maximo }) {
  const numero = Number.parseInt(valor, 10);
  if (!Number.isInteger(numero)) return padrao;
  return Math.min(Math.max(numero, minimo), maximo);
}

async function listar(postId, { pagina, limite } = {}) {
  if (!(await postRepository.existe(postId)))
    throw erro('Publicação não encontrada', 404);

  const paginaAtual = inteiroNaFaixa(pagina, { padrao: 1, minimo: 1, maximo: Number.MAX_SAFE_INTEGER });
  const porPagina = inteiroNaFaixa(limite, { padrao: LIMITE_PADRAO, minimo: 1, maximo: LIMITE_MAXIMO });

  const { comentarios, total } = await commentRepository.listarPorPost(postId, {
    limite: porPagina,
    offset: (paginaAtual - 1) * porPagina,
  });

  return {
    comentarios,
    pagina: paginaAtual,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    total,
  };
}

async function criar(postId, usuarioId, texto) {
  const conteudo = String(texto ?? '').trim();

  if (!conteudo)
    throw erro('O comentário não pode estar vazio', 400);

  if (conteudo.length > TEXTO_MAX)
    throw erro(`O comentário deve ter no máximo ${TEXTO_MAX} caracteres`, 400);

  if (!(await postRepository.existe(postId)))
    throw erro('Publicação não encontrada', 404);

  const comentario = new Comment({
    id: uuidv7(),
    texto: conteudo,
    postId,
    autorId: usuarioId,
  });

  return commentRepository.criar(comentario);
}
/**
 * Edita um comentário do próprio autor, dentro da janela de tempo.
 *
 * A ordem das verificações reflete a precedência dos erros: formato do
 * texto primeiro (não depende de nada), depois existência, depois autoria,
 * e só então a janela — informar "prazo esgotado" a quem nem é o autor
 * revelaria que o comentário existe.
 */
async function editar(id, usuarioId, texto) {
  const conteudo = String(texto ?? '').trim();

  if (!conteudo)
    throw erro('O comentário não pode estar vazio', 400);

  if (conteudo.length > TEXTO_MAX)
    throw erro(`O comentário deve ter no máximo ${TEXTO_MAX} caracteres`, 400);

  const comentario = await commentRepository.buscarPorId(id);

  if (!comentario)
    throw erro('Comentário não encontrado', 404);

  if (!comentario.pertenceA(usuarioId))
    throw erro('Você só pode editar seus próprios comentários', 403);

  if (!dentroDaJanela(comentario.criadoEm))
    throw erro(`A edição só é possível nos primeiros ${JANELA_MINUTOS} minutos`, 409);

  if (conteudo === comentario.texto)
    return comentario;   // nada mudou: não marca como editado

  await commentRepository.atualizar(id, usuarioId, conteudo);
  return commentRepository.buscarPorId(id);
}

async function excluir(id, usuarioId) {
  const removidos = await commentRepository.excluir(id, usuarioId);
  if (removidos) return;

  const comentario = await commentRepository.buscarPorId(id);

  if (!comentario) throw erro('Comentário não encontrado', 404);
  if (!comentario.pertenceA(usuarioId)) throw erro('Você só pode excluir seus próprios comentários', 403);

  throw erro('Não foi possível excluir o comentário', 500);
}



module.exports = { listar, criar, editar, excluir };