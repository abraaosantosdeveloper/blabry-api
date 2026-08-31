const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const PostRepository = require('../repositories/post_repository');
const Post = require('../models/post');
const { JANELA_MINUTOS, dentroDaJanela } = require('../utils/janela_edicao');

const postRepository = new PostRepository(pool);

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

const TEXTO_MAX = 280;
const LIMITE_PADRAO = 10;
const LIMITE_MAXIMO = 50;

/* O índice FULLTEXT do InnoDB ignora palavras menores que
   innodb_ft_min_token_size (padrão 3). */
const BUSCA_MINIMA = 3;

/** Converte um valor da query string em inteiro dentro de uma faixa. */
function inteiroNaFaixa(valor, { padrao, minimo, maximo }) {
  const numero = Number.parseInt(valor, 10);
  if (!Number.isInteger(numero)) return padrao;
  return Math.min(Math.max(numero, minimo), maximo);
}

/** Feed ou busca, paginados. */
async function listar({ usuarioId, pagina, limite, q } = {}) {
  const paginaAtual = inteiroNaFaixa(pagina, { padrao: 1, minimo: 1, maximo: Number.MAX_SAFE_INTEGER });
  const porPagina = inteiroNaFaixa(limite, { padrao: LIMITE_PADRAO, minimo: 1, maximo: LIMITE_MAXIMO });

  const termo = String(q ?? '').trim();

  // Filtro que não pode ser satisfeito devolve vazio — jamais o feed inteiro.
  if (termo && termo.length < BUSCA_MINIMA) {
    return { posts: [], pagina: 1, totalPaginas: 1, total: 0 };
  }

  const { posts, total } = await postRepository.listar({
    visitanteId: usuarioId,
    q: termo || null,
    limite: porPagina,
    offset: (paginaAtual - 1) * porPagina,
  });

  return {
    posts,
    pagina: paginaAtual,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    total,
  };
}

/** Cria uma publicação do usuário autenticado. */
async function criar(usuarioId, texto) {
  const conteudo = String(texto ?? '').trim();

  if (!conteudo)
    throw erro('O blab não pode estar vazio', 400);

  if (conteudo.length > TEXTO_MAX)
    throw erro(`O blab deve ter no máximo ${TEXTO_MAX} caracteres`, 400);

  const post = new Post({
    id: uuidv7(),
    texto: conteudo,
    autorId: usuarioId,
  });

  return postRepository.criar(post, usuarioId);
}

/**
 * Edita uma publicação do próprio autor, dentro da janela de tempo.
 * A ordem das verificações vai do que não depende de nada (formato) ao que
 * depende do estado (prazo) — e a autoria vem antes do prazo para não
 * revelar a existência do post a quem não é dono dele.
 */
async function editar(id, usuarioId, texto) {
  const conteudo = String(texto ?? '').trim();

  if (!conteudo)
    throw erro('O blab não pode estar vazio', 400);

  if (conteudo.length > TEXTO_MAX)
    throw erro(`O blab deve ter no máximo ${TEXTO_MAX} caracteres`, 400);

  const post = await postRepository.buscarPorId(id, usuarioId);

  if (!post) throw erro('Publicação não encontrada', 404);
  if (!post.pertenceA(usuarioId)) throw erro('Você só pode editar suas próprias publicações', 403);

  if (!dentroDaJanela(post.criadoEm))
    throw erro(`A edição só é possível nos primeiros ${JANELA_MINUTOS} minutos`, 409);

  if (conteudo === post.texto) return post;

  await postRepository.atualizar(id, usuarioId, conteudo);
  return postRepository.buscarPorId(id, usuarioId);
}

/**
 * Exclui uma publicação do próprio autor.
 *
 * A exclusão é tentada primeiro: a autoria está no WHERE, então não há
 * janela entre verificar e apagar. A consulta posterior só existe para
 * escolher entre 404 e 403 — ela informa a resposta, não autoriza a ação.
 */
async function excluir(id, usuarioId) {
  const removidos = await postRepository.excluir(id, usuarioId);
  if (removidos) return;

  const post = await postRepository.buscarPorId(id, usuarioId);

  if (!post) throw erro('Publicação não encontrada', 404);
  if (!post.pertenceA(usuarioId)) throw erro('Você só pode excluir suas próprias publicações', 403);

  throw erro('Não foi possível excluir a publicação', 500);

}

  /**
 * Curte ou descurte, e devolve o estado recontado no banco.
 * O cliente pode ter feito atualização otimista; a resposta é a verdade.
 */
async function alternarCurtida(postId, usuarioId, curtir) {
  if (!(await postRepository.existe(postId)))
    throw erro('Publicação não encontrada', 404);

  if (curtir) {
    await postRepository.curtir(uuidv7(), postId, usuarioId);
  } else {
    await postRepository.descurtir(postId, usuarioId);
  }

  return {
    curtidas: await postRepository.contarCurtidas(postId),
    curtido: curtir,
  };
}

module.exports = { listar, criar, excluir, editar, alternarCurtida };