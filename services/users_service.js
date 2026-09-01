const { v7: uuidv7 } = require('uuid')
const pool = require('../database')
const UsersRepository = require('../repositories/users_repository')
const CountriesRepository = require('../repositories/countries_repository')

const countriesRepository = new CountriesRepository(pool)
const usersRepository = new UsersRepository(pool);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

const LIMITS = {
  name: { min: 2, max: 100 },
  bio: { max: 280 },
  minimumAge: 13,
}

const years = (date) => (Date.now() - new Date(date).getTime()) / 31557600000

/** Valida e normaliza um campo. Devolve o valor pronto para o banco. */
const VALIDATORS = {
  name(value) {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ')
    if (name.length < LIMITS.name.min || name.length > LIMITS.name.max)
      throw fail('O nome deve ter entre 2 e 100 caracteres', 400)
    return name
  },

  bio(value) {
    const bio = String(value ?? '').trim()
    if (bio.length > LIMITS.bio.max)
      throw fail('A bio deve ter no máximo 280 caracteres', 400)
    return bio || null
  },

  email(value) {
    const email = String(value ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw fail('E-mail inválido', 400)
    return email
  },

  birthDate(value) {
    const date = String(value ?? '').slice(0, 10)
    if (Number.isNaN(new Date(date).getTime()))
      throw fail('Data de nascimento inválida', 400)
    if (years(date) < LIMITS.minimumAge)
      throw fail('É necessário ter pelo menos 13 anos', 400)
    return date
  },

  nationality(value) {
    const code = String(value ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code))
      throw fail('Nacionalidade inválida', 400)
    return code
  },
}

/**
 * Atualização parcial do perfil do usuário autenticado.
 * @param {string} userId vindo do token, nunca do corpo
 * @param {object} fields apenas os campos que mudaram
 */
async function updateProfile(userId, fields = {}) {
  const received = Object.keys(fields)
    .filter((key) => Object.hasOwn(VALIDATORS, key))

  if (!received.length)
    throw fail('Nenhum campo editável foi informado', 400)

  // Valida e normaliza antes de tocar o banco.
  const validated = {}
  for (const key of received) {
    validated[key] = VALIDATORS[key](fields[key])
  }

  const result = await usersRepository.findProfile('id', userId)
  if (!result) throw fail('Usuário não encontrado', 404)

  const { user } = result

  // --- Troca de e-mail exige a senha atual ---
  if (validated.email && validated.email !== user.email) {
    if (!fields.currentPassword)
      throw fail('Informe a senha atual para alterar o e-mail', 401)

    if (!(await user.verifyPassword(fields.currentPassword)))
      throw fail('Senha incorreta', 401)

    if (await usersRepository.emailInUse(validated.email, userId))
      throw fail('Este e-mail já está em uso', 409)
  }
  // -------------------------------------------

  if (validated.nationality) {
    const exists = await countriesRepository.exists(validated.nationality)
    if (!exists) throw fail('Nacionalidade não reconhecida', 400)
  }

  await usersRepository.update(userId, validated)

  return myProfile(userId)
}

/** Perfil do próprio usuário autenticado. */
async function myProfile(userId) {
  const result = await usersRepository.findProfile('id', userId);

  if (!result) throw fail('Usuário não encontrado', 404);

  const { user, followers, following } = result;
  return user.toProfile({ own: true, followers, following });
}

/** Perfil público de outro usuário. */
async function profileByAlias(alias, viewerId) {
  if (!alias) throw fail('@ não informado', 400);

  const result = await usersRepository.findProfile('alias', alias, viewerId);

  if (!result) throw fail('Usuário não encontrado', 404);

  const { user, followers, following, isFollowing, followsYou } = result;

  // Visitar o próprio perfil pela URL pública ainda é o próprio perfil.
  const own = user.id === viewerId;

  return user.toProfile({ own, followers, following, isFollowing, followsYou });
}

/* ------------------------------------------------------------------
   Busca de usuários
   ------------------------------------------------------------------ */

/** Menor termo aceito. Abaixo disso a busca traria meio banco de dados. */
const MINIMUM_SEARCH = 2

/** Quantos resultados por página quando o cliente não pede outro valor. */
const DEFAULT_LIMIT = 8

/** Teto por página. Impede que ?limit=100000 derrube a instância. */
const MAX_LIMIT = 50

/**
 * Converte um valor vindo da query string em inteiro dentro de uma faixa.
 * Tudo que chega pela URL é texto e pode ser qualquer coisa, então:
 *  - o que não for número vira o padrão
 *  - o que estiver fora da faixa é puxado para dentro dela
 * Assim nada estoura e o repositório sempre recebe inteiros válidos.
 */
function intInRange(value, { fallback, min, max }) {
  const number = Number.parseInt(value, 10)
  if (!Number.isInteger(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

/**
 * Busca usuários por nome ou @.
 *
 * @param {object} options
 * @param {string} options.userId quem está buscando (vem do token)
 * @param {string} options.q      termo digitado
 * @param {string} options.page   número da página, como texto da URL
 * @param {string} options.limit  itens por página, como texto da URL
 */
async function search({ userId, q, page, limit } = {}) {
  // O @ pode vir digitado pelo usuário; ele não faz parte do alias gravado.
  // trim() antes e depois porque " @abraao " é entrada plausível.
  const term = String(q ?? '').trim().replace(/^@/, '').trim()

  // Termo curto demais devolve lista vazia, e não a base inteira: um filtro
  // que não pode ser satisfeito nunca deve retornar tudo.
  if (term.length < MINIMUM_SEARCH) {
    return { users: [], page: 1, totalPages: 1, total: 0 }
  }

  const currentPage = intInRange(page, {
    fallback: 1, min: 1, max: Number.MAX_SAFE_INTEGER,
  })

  const perPage = intInRange(limit, {
    fallback: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT,
  })

  // Aqui acontece a tradução entre dois vocabulários: o cliente fala em
  // "página 3", o banco fala em "pule 16 linhas". Nenhum dos dois precisa
  // conhecer o conceito do outro, e trocar por paginação com cursor mudaria
  // apenas esta linha.
  const { users, total } = await usersRepository.search({
    q: term,
    viewerId: userId,
    limit: perPage,
    offset: (currentPage - 1) * perPage,
  })

  return {
    users,
    page: currentPage,
    // Math.max(1, ...) porque uma lista vazia ainda tem uma página:
    // sem isso o cliente exibiria "Página 1 de 0".
    totalPages: Math.max(1, Math.ceil(total / perPage)),
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
 * @param {string}  alias  o @ de quem será seguido, vindo da URL
 * @param {string}  userId quem está seguindo, vindo do token
 * @param {boolean} follow true para seguir, false para deixar de seguir
 * @returns {Promise<{following: boolean, followers: number}>}
 */
async function toggleFollow(alias, userId, follow) {
  // O @ é opcional na URL: aceita tanto "abraao" quanto "@abraao".
  const handle = String(alias ?? '').trim().replace(/^@/, '')

  if (!handle) throw fail('Usuário não informado', 400)

  // Primeiro traduz o @ em id: as tabelas de relacionamento guardam
  // identificadores, não apelidos.
  const targetId = await usersRepository.findIdByAlias(handle)

  // Alias inexistente, ou conta excluída, resultam em 404.
  if (!targetId) throw fail('Usuário não encontrado', 404)

  // Seguir a si mesmo não faz sentido e sujaria os contadores do perfil.
  // A restrição UNIQUE não pega este caso, porque o par seria válido.
  if (targetId === userId)
    throw fail('Você não pode seguir a si mesmo', 400)

  if (follow) {
    // O id da linha é gerado aqui, no serviço, como fazemos com usuário
    // e publicação — o repositório não inventa identificadores.
    await usersRepository.follow(uuidv7(), userId, targetId)
  } else {
    await usersRepository.unfollow(userId, targetId)
  }

  return {
    following: follow,
    // Recontado, e não incrementado: se duas pessoas seguirem ao mesmo
    // tempo, o número final é o do banco.
    followers: await usersRepository.countFollowers(targetId),
  }
}

module.exports = { myProfile, profileByAlias, updateProfile, search, toggleFollow }
