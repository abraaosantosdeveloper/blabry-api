const usuariosService = require('../services/usuarios_service');
const fotoService = require('../services/foto_service');

async function atualizarFoto(req, res, next) {
  try {
    const resultado = await fotoService.atualizarFotoDePerfil(req.userId, req.file);
    res.status(200).json(resultado);
  } catch (err) {
    next(err);
  }
}

async function meuPerfil(req, res, next) {
  try {
    const perfil = await usuariosService.meuPerfil(req.userId);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}

async function perfilPorAlias(req, res, next) {
  try {
    const perfil = await usuariosService.perfilPorAlias(req.params.alias, req.userId);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}

async function atualizarPerfil(req, res, next) {
  try {
    const perfil = await usuariosService.atualizarPerfil(req.userId, req.body);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}


/**
 * GET /users?q=&pagina=&limite=
 *
 * Busca usuários por nome ou @.
 *
 * O controller não converte nem valida nada: entrega ao service exatamente
 * o que veio na URL. Quem define o que é uma página válida é a regra de
 * negócio, e duplicar essa decisão aqui criaria dois lugares para ela
 * divergir com o tempo.
 */
async function buscar(req, res, next) {
    try {
        // req.query traz os parâmetros da URL, todos como texto.
        const { q, pagina, limite } = req.query;

        const resultado = await usuariosService.buscar({
            // req.userId vem do middleware de autenticação, que o extraiu do
            // token. Nunca do corpo nem da URL: a identidade não é algo que o
            // cliente possa afirmar.
            usuarioId: req.userId,
            q,
            pagina,
            limite,
        });

        res.status(200).json(resultado);
    } catch (err) {
        // Qualquer erro segue para o middleware central, que decide o status
        // e a mensagem. O controller não trata erro localmente.
        next(err);
    }
}


/**
 * POST /users/:alias/follow — passa a seguir o usuário.
 *
 * Quem segue vem do token (req.userId); quem é seguido vem da URL. A
 * assimetria é a regra de sempre: a identidade não é algo que o cliente
 * possa afirmar, o alvo da ação é.
 */
async function seguir(req, res, next) {
    try {
        const resultado = await usuariosService.alternarSeguir(req.params.alias, req.userId, true);
        res.status(200).json(resultado);
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /users/:alias/follow — deixa de seguir.
 *
 * Idêntica à anterior exceto pelo último argumento. A regra é a mesma; o
 * que muda é a intenção, e quem expressa intenção é o verbo HTTP.
 */
async function deixarDeSeguir(req, res, next) {
    try {
        const resultado = await usuariosService.alternarSeguir(req.params.alias, req.userId, false);
        res.status(200).json(resultado);
    } catch (err) {
        next(err);
    }
}

module.exports = { meuPerfil, perfilPorAlias, atualizarFoto, atualizarPerfil, buscar, seguir, deixarDeSeguir };