const { v7: uuidv7 } = require('uuid')
const pool = require('../database')
const UsuariosRepository = require('../repositories/usuarios_repository')
const CountriesRepository = require('../repositories/countries_repository') 
const countriesRepository = new CountriesRepository(pool)

const usuariosRepository = new UsuariosRepository(pool);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const LIMITES = {
  nome: { min: 2, max: 100 },
  bio: { max: 280 },
  idadeMinima: 13,
}

const anos = (data) => (Date.now() - new Date(data).getTime()) / 31557600000

/** Valida e normaliza um campo. Devolve o valor pronto para o banco. */
const VALIDADORES = {
  nome(valor) {
    const nome = String(valor ?? '').trim().replace(/\s+/g, ' ')
    if (nome.length < LIMITES.nome.min || nome.length > LIMITES.nome.max)
      throw erro('O nome deve ter entre 2 e 100 caracteres', 400)
    return nome
  },

  bio(valor) {
    const bio = String(valor ?? '').trim()
    if (bio.length > LIMITES.bio.max)
      throw erro('A bio deve ter no máximo 280 caracteres', 400)
    return bio || null
  },

  email(valor) {
    const email = String(valor ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw erro('E-mail inválido', 400)
    return email
  },

  nascimento(valor) {
    const data = String(valor ?? '').slice(0, 10)
    if (Number.isNaN(new Date(data).getTime()))
      throw erro('Data de nascimento inválida', 400)
    if (anos(data) < LIMITES.idadeMinima)
      throw erro('É necessário ter pelo menos 13 anos', 400)
    return data
  },

  nacionalidade(valor) {
    const codigo = String(valor ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(codigo))
      throw erro('Nacionalidade inválida', 400)
    return codigo
  },
}

/**
 * Atualização parcial do perfil do usuário autenticado.
 * @param {string} usuarioId vindo do token, nunca do corpo
 * @param {object} campos apenas os campos que mudaram
 */
async function atualizarPerfil(usuarioId, campos = {}) {
  const recebidos = Object.keys(campos)
    .filter((chave) => Object.hasOwn(VALIDADORES, chave))

  if (!recebidos.length)
    throw erro('Nenhum campo editável foi informado', 400)

  // Valida e normaliza antes de tocar o banco.
  const validados = {}
  for (const chave of recebidos) {
    validados[chave] = VALIDADORES[chave](campos[chave])
  }

  const resultado = await usuariosRepository.buscarPerfil('id', usuarioId)
  if (!resultado) throw erro('Usuário não encontrado', 404)

  const { usuario } = resultado

  // --- Troca de e-mail exige a senha atual (remova este bloco se não quiser) ---
  if (validados.email && validados.email !== usuario.email) {
    if (!campos.senhaAtual)
      throw erro('Informe a senha atual para alterar o e-mail', 401)

    if (!(await usuario.verificarSenha(campos.senhaAtual)))
      throw erro('Senha incorreta', 401)

    if (await usuariosRepository.emailEmUso(validados.email, usuarioId))
      throw erro('Este e-mail já está em uso', 409)
  }
  // -----------------------------------------------------------------------

  if (validados.nacionalidade) {
    const existe = await countriesRepository.existe(validados.nacionalidade)
    if (!existe) throw erro('Nacionalidade não reconhecida', 400)
  }

  await usuariosRepository.atualizar(usuarioId, validados)

  return meuPerfil(usuarioId)
}

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

/** Perfil do próprio usuário autenticado. */
async function meuPerfil(usuarioId) {
  const resultado = await usuariosRepository.buscarPerfil('id', usuarioId);

  if (!resultado) throw erro('Usuário não encontrado', 404);
  
  const { usuario, seguidores, seguindo } = resultado;
  return usuario.paraPerfil({ proprio: true, seguidores, seguindo });
}

/** Perfil público de outro usuário. */
async function perfilPorAlias(alias, visitanteId) {
  if (!alias) throw erro('Alias não informado', 400);

  const resultado = await usuariosRepository.buscarPerfil('alias', alias, visitanteId);

  if (!resultado) throw erro('Usuário não encontrado', 404);

  const { usuario, seguidores, seguindo, seguindoEste } = resultado;
  
  // Visitar o próprio perfil pela URL pública ainda é o próprio perfil.
  const proprio = usuario.id === visitanteId;
  
  return usuario.paraPerfil({ proprio, seguidores, seguindo, seguindoEste });
}


/* ------------------------------------------------------------------
   Busca de usuários
   ------------------------------------------------------------------ */

/** Menor termo aceito. Abaixo disso a busca traria meio banco de dados. */
const BUSCA_MINIMA = 2

/** Quantos resultados por página quando o cliente não pede outro valor. */
const LIMITE_PADRAO = 8

/** Teto por página. Impede que ?limite=100000 derrube a instância. */
const LIMITE_MAXIMO = 50

/**
 * Converte um valor vindo da query string em inteiro dentro de uma faixa.
 * Tudo que chega pela URL é texto e pode ser qualquer coisa, então:
 *  - o que não for número vira o padrão
 *  - o que estiver fora da faixa é puxado para dentro dela
 * Assim nada estoura e o repositório sempre recebe inteiros válidos.
 */
function inteiroNaFaixa(valor, { padrao, minimo, maximo }) {
    const numero = Number.parseInt(valor, 10)
    if (!Number.isInteger(numero)) return padrao
    return Math.min(Math.max(numero, minimo), maximo)
}

/**
 * Busca usuários por nome ou @.
 *
 * @param {object} opcoes
 * @param {string} opcoes.usuarioId quem está buscando (vem do token)
 * @param {string} opcoes.q         termo digitado
 * @param {string} opcoes.pagina    número da página, como texto da URL
 * @param {string} opcoes.limite    itens por página, como texto da URL
 */
async function buscar({ usuarioId, q, pagina, limite } = {}) {
    // O @ pode vir digitado pelo usuário; ele não faz parte do alias gravado.
    // trim() antes e depois porque " @abraao " é entrada plausível.
    const termo = String(q ?? '').trim().replace(/^@/, '').trim()

    // Termo curto demais devolve lista vazia, e não a base inteira: um filtro
    // que não pode ser satisfeito nunca deve retornar tudo.
    if (termo.length < BUSCA_MINIMA) {
        return { usuarios: [], pagina: 1, totalPaginas: 1, total: 0 }
    }

    const paginaAtual = inteiroNaFaixa(pagina, {
        padrao: 1, minimo: 1, maximo: Number.MAX_SAFE_INTEGER,
    })

    const porPagina = inteiroNaFaixa(limite, {
        padrao: LIMITE_PADRAO, minimo: 1, maximo: LIMITE_MAXIMO,
    })

    // Aqui acontece a tradução entre dois vocabulários: o cliente fala em
    // "página 3", o banco fala em "pule 16 linhas". Nenhum dos dois precisa
    // conhecer o conceito do outro, e trocar por paginação com cursor mudaria
    // apenas esta linha.
    const { usuarios, total } = await usuariosRepository.buscar({
        q: termo,
        visitanteId: usuarioId,
        limite: porPagina,
        offset: (paginaAtual - 1) * porPagina,
    })

    return {
        usuarios,
        pagina: paginaAtual,
        // Math.max(1, ...) porque uma lista vazia ainda tem uma página:
        // sem isso o cliente exibiria "Página 1 de 0".
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
        total,
    }
}


/* ------------------------------------------------------------------
   Seguir e deixar de seguir
   ------------------------------------------------------------------ */

/**
 * Passa a seguir, ou deixa de seguir, o usuário identificado pelo @.
 *
 * Devolve o estado recontado no banco. O cliente faz atualização otimista —
 * inverte o botão na hora para a interface responder de imediato — e depois
 * reconcilia com estes números, que são a verdade.
 *
 * @param {string}  alias     o @ de quem será seguido, vindo da URL
 * @param {string}  usuarioId quem está seguindo, vindo do token
 * @param {boolean} seguir    true para seguir, false para deixar de seguir
 * @returns {Promise<{seguindo: boolean, seguidores: number}>}
 */
async function alternarSeguir(alias, usuarioId, seguir) {
    // O @ é opcional na URL: aceita tanto "abraao" quanto "@abraao".
    const apelido = String(alias ?? '').trim().replace(/^@/, '')

    if (!apelido) throw erro('Usuário não informado', 400)

    // Primeiro traduz o @ em id: as tabelas de relacionamento guardam
    // identificadores, não apelidos.
    const seguidoId = await usuariosRepository.buscarIdPorAlias(apelido)

    // Alias inexistente, ou conta excluída, resultam em 404.
    if (!seguidoId) throw erro('Usuário não encontrado', 404)

    // Seguir a si mesmo não faz sentido e sujaria os contadores do perfil.
    // A restrição UNIQUE não pega este caso, porque o par seria válido.
    if (seguidoId === usuarioId)
        throw erro('Você não pode seguir a si mesmo', 400)

    if (seguir) {
        // O id da linha é gerado aqui, no serviço, como fazemos com usuário
        // e publicação — o repositório não inventa identificadores.
        await usuariosRepository.seguir(uuidv7(), usuarioId, seguidoId)
    } else {
        await usuariosRepository.deixarDeSeguir(usuarioId, seguidoId)
    }

    return {
        seguindo: seguir,
        // Recontado, e não incrementado: se duas pessoas seguirem ao mesmo
        // tempo, o número final é o do banco.
        seguidores: await usuariosRepository.contarSeguidores(seguidoId),
    }
}

module.exports = { meuPerfil, perfilPorAlias, atualizarPerfil, buscar, alternarSeguir }