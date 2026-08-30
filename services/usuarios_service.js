const pool = require('../database');
const UsuariosRepository = require('../repositories/usuarios_repository');

const usuariosRepository = new UsuariosRepository(pool);

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

module.exports = { meuPerfil, perfilPorAlias };