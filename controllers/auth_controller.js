const authService = require('../services/auth_service');

async function signUp(req, res, next) {
  try {
    const { name, alias, email, password, nationality, birthDate, acceptedPolicy } = req.body;
    const result = await authService.signUp({ name, alias, email, password, nationality, birthDate, acceptedPolicy });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.json(result);
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
async function resendSignupCode(req, res, next) {
  try {
    const result = await authService.resendSignupCode({ email: req.body?.email });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/verificar-email — confirma o e-mail e devolve o token. */
async function confirmEmail(req, res, next) {
  try {
    const { email, code } = req.body;
    const result = await authService.confirmEmail({ email, code });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/password/code — envia o código de troca de senha. */
async function requestPasswordReset(req, res, next) {
  try {
    const result = await authService.requestPasswordReset({ email: req.body?.email });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /auth/password — define a nova senha mediante código. */
async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword } = req.body;
    const result = await authService.resetPassword({ email, code, newPassword });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /users/me/deletion/code — envia o código de exclusão.
 *
 * A identidade vem de `req.userId`, posto pelo middleware a partir do token.
 * O e-mail de destino é lido do banco, nunca aceito do corpo: aceitá-lo
 * permitiria mandar o código de exclusão de uma conta para outro endereço.
 */
async function requestAccountDeletion(req, res, next) {
  try {
    const result = await authService.requestAccountDeletion(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** DELETE /users/me — exclui a conta autenticada mediante código. */
async function deleteAccount(req, res, next) {
  try {
    await authService.deleteAccount({
      userId: req.userId,
      // O código pode vir no corpo ou na query: DELETE com corpo é aceito
      // pelo Express, mas nem todo cliente HTTP o envia.
      code: req.body?.code ?? req.query?.code,
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
  signUp,
  login,
  logout,
  resendSignupCode,
  confirmEmail,
  requestPasswordReset,
  resetPassword,
  requestAccountDeletion,
  deleteAccount,
};