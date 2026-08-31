const usersService = require('../services/users_service');
const photoService = require('../services/photo_service');

async function updatePhoto(req, res, next) {
  try {
    const result = await photoService.updateProfilePhoto(req.userId, req.file);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function myProfile(req, res, next) {
  try {
    const profile = await usersService.meuPerfil(req.userId);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
}

async function profileByAlias(req, res, next) {
  try {
    const profile = await usersService.perfilPorAlias(req.params.alias, req.userId);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await usersService.atualizarPerfil(req.userId, req.body);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
}


/**
 * GET /users?q=&page=&limit=
 *
 * Busca usuários por nome ou @.
 *
 * O controller não converte nem valida nada: entrega ao service exatamente
 * o que veio na URL. Quem define o que é uma página válida é a regra de
 * negócio, e duplicar essa decisão aqui criaria dois lugares para ela
 * divergir com o tempo.
 */
async function search(req, res, next) {
    try {
        // req.query traz os parâmetros da URL, todos como texto.
        const { q, page, limit } = req.query;

        const result = await usersService.buscar({
            // req.userId vem do middleware de autenticação, que o extraiu do
            // token. Nunca do corpo nem da URL: a identidade não é algo que o
            // cliente possa afirmar.
            userId: req.userId,
            q,
            page,
            limit,
        });

        res.status(200).json(result);
    } catch (err) {
        // Qualquer erro segue para o middleware central, que decide o status
        // e a mensagem. O controller não trata erro localmente.
        next(err);
    }
}


/**
 * POST /users/:alias/follow — passa a follow o usuário.
 *
 * Quem segue vem do token (req.userId); quem é seguido vem da URL. A
 * assimetria é a regra de sempre: a identidade não é algo que o cliente
 * possa afirmar, o alvo da ação é.
 */
async function follow(req, res, next) {
    try {
        const result = await usersService.toggleFollow(req.params.alias, req.userId, true);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /users/:alias/follow — deixa de follow.
 *
 * Idêntica à anterior exceto pelo último argumento. A regra é a mesma; o
 * que muda é a intenção, e quem expressa intenção é o verbo HTTP.
 */
async function unfollow(req, res, next) {
    try {
        const result = await usersService.toggleFollow(req.params.alias, req.userId, false);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { myProfile, profileByAlias, updatePhoto, updateProfile, search, follow, unfollow };