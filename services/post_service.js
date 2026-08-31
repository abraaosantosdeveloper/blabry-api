const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const PostRepository = require('../repositories/post_repository');
const UsuariosRepository = require('../repositories/usuarios_repository');
const Post = require('../models/post');
const { JANELA_MINUTOS, dentroDaJanela } = require('../utils/janela_edicao');

const postRepository = new PostRepository(pool);
/* A listagem por autor precisa traduzir o @ em id, e essa tradução já vive
   no repositório de usuários. Reaproveitar é melhor do que escrever um
   segundo SELECT em user aqui dentro — o mesmo SQL em dois lugares é o
   começo de duas regras divergentes. */
const usuariosRepository = new UsuariosRepository(pool);

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

/**
 * Uma publicação específica, para a página dedicada do post.
 *
 * Recebe o id do visitante porque a resposta inclui `curtido` — se ele
 * curtiu ou não. Esse dado é por observador, não do post.
 *
 * @param {string} id id da publicação
 * @param {string} visitanteId id do usuário autenticado (vem do token)
 * @returns {Promise<Post>}
 */
async function buscarPorId(id, visitanteId) {
  // Sem id não há o que buscar. 400 e não 404: o problema é a requisição,
  // não o recurso.
  if (!id) throw erro('Publicação não informada', 400);

  const post = await postRepository.buscarPorId(id, visitanteId);

  // O repositório já filtra autores excluídos, então "não encontrado" aqui
  // cobre tanto o post inexistente quanto o post de uma conta apagada — do
  // ponto de vista de quem consulta, os dois casos são o mesmo.
  if (!post) throw erro('Publicação não encontrada', 404);

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
 * @param {{alias: string, visitanteId: string, pagina?: any, limite?: any}} opcoes
 * @returns {Promise<{posts: Post[], pagina: number, totalPaginas: number, total: number}>}
 */
async function listarDoAutor({ alias, visitanteId, pagina, limite } = {}) {
  if (!alias) throw erro('Usuário não informado', 400);

  // O @ pode chegar com a arroba na frente, dependendo de onde o cliente o
  // copiou. Ela nunca faz parte do valor armazenado.
  const apelido = String(alias).replace(/^@/, '');

  const autorId = await usuariosRepository.buscarIdPorAlias(apelido);

  // Perfil inexistente é 404 aqui, e não uma lista vazia: lista vazia diria
  // "esse usuário não publicou nada", o que é uma afirmação diferente.
  if (!autorId) throw erro('Usuário não encontrado', 404);

  const paginaAtual = inteiroNaFaixa(pagina, { padrao: 1, minimo: 1, maximo: Number.MAX_SAFE_INTEGER });
  const porPagina = inteiroNaFaixa(limite, { padrao: LIMITE_PADRAO, minimo: 1, maximo: LIMITE_MAXIMO });

  const { posts, total } = await postRepository.listarDoAutor({
    autorId,
    visitanteId,
    limite: porPagina,
    offset: (paginaAtual - 1) * porPagina,
  });

  return {
    posts,
    pagina: paginaAtual,
    // Math.max(1, ...) para que uma lista vazia informe 1 página, e não 0:
    // "página 1 de 0" não faz sentido para quem lê a interface.
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

module.exports = { listar, buscarPorId, listarDoAutor, criar, excluir, editar, alternarCurtida };