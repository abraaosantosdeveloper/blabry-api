const authService = require('../services/auth_service');

async function cadastrarUsuario(req, res, next) {
  try {
    const { nome, apelido, email, senha, nacionalidade, nascimento, aceitouPolitica } = req.body;
    const resultado = await authService.cadastrarUsuario({ nome, apelido, email, senha, nacionalidade, nascimento, aceitouPolitica });
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    const resultado = await authService.login({ email, senha });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------------
   Verificação por código enviado ao e-mail
   ------------------------------------------------------------------ */

/**
 * POST /auth/verificar-email/reenviar — novo código de confirmação.
 *
 * Responde 200 mesmo quando o e-mail não tem conta: a resposta não deve
 * revelar quem está cadastrado aqui. Quem tem conta recebe o código.
 */
async function reenviarCodigoCadastro(req, res, next) {
  try {
    const resultado = await authService.reenviarCodigoCadastro({ email: req.body?.email });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/verificar-email — confirma o e-mail e devolve o token. */
async function confirmarEmail(req, res, next) {
  try {
    const { email, codigo } = req.body;
    const resultado = await authService.confirmarEmail({ email, codigo });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/senha/codigo — envia o código de troca de senha. */
async function solicitarTrocaDeSenha(req, res, next) {
  try {
    const resultado = await authService.solicitarTrocaDeSenha({ email: req.body?.email });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/senha — define a nova senha mediante código. */
async function trocarSenha(req, res, next) {
  try {
    const { email, codigo, novaSenha } = req.body;
    const resultado = await authService.trocarSenha({ email, codigo, novaSenha });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /users/me/exclusao/codigo — envia o código de exclusão.
 *
 * A identidade vem de `req.userId`, posto pelo middleware a partir do token.
 * O e-mail de destino é lido do banco, nunca aceito do corpo: aceitá-lo
 * permitiria mandar o código de exclusão de uma conta para outro endereço.
 */
async function solicitarExclusao(req, res, next) {
  try {
    const resultado = await authService.solicitarExclusao(req.userId);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** DELETE /users/me — exclui a conta autenticada mediante código. */
async function excluirConta(req, res, next) {
  try {
    await authService.excluirConta({
      usuarioId: req.userId,
      // O código pode vir no corpo ou na query: DELETE com corpo é aceito
      // pelo Express, mas nem todo cliente HTTP o envia.
      codigo: req.body?.codigo ?? req.query?.codigo,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  cadastrarUsuario,
  login,
  logout,
  reenviarCodigoCadastro,
  confirmarEmail,
  solicitarTrocaDeSenha,
  trocarSenha,
  solicitarExclusao,
  excluirConta,
};