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

module.exports = { meuPerfil, perfilPorAlias, atualizarPerfil }