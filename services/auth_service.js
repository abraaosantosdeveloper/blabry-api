const jwt = require('jsonwebtoken');
const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const AuthRepository = require('../repositories/auth_repository');
const User = require('../models/user');
const { requestCode, confirmCode, PURPOSES } = require('./verification_service');

const authRepository = new AuthRepository(pool);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Mesma regra de força de senha usada pela interface no cadastro: no mínimo
   8 caracteres, uma maiúscula e um caractere não alfanumérico. Repetida aqui
   porque a troca de password por código não passa pelo formulário de cadastro. */
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

async function signUp({ name, alias, email, password, birthDate, nationality, acceptedPolicy }) {
  if (!name || !alias || !email || !password || !birthDate || !nationality)
    throw fail('Campos obrigatórios ausentes', 400);

  /* O aceite da política é barrado na interface, mas a validação existe aqui
     porque a interface é conveniência e a API é a fronteira real: qualquer
     cliente pode enviar um cadastro direto, sem passar pelo formulário.

     A comparação é estrita com `true`. Sem isso, a string "false" — que é o
     que chega quando um formulário serializa um booleano sem cuidado — seria
     considerada verdadeira, porque toda string não vazia é. */
  if (acceptedPolicy !== true)
    throw fail('É necessário aceitar a política de privacidade', 400);

  const existingByEmail = await authRepository.findByEmail(email);
  const existingByAlias = await authRepository.findByAlias(alias);

  /* Um duplo clique ou uma repetição automática pode chegar depois de a
     primeira requisição já ter criado a conta. Só repetimos o sucesso quando
     e-mail e alias apontam para a mesma conta ainda pendente e a senha prova
     que é o mesmo cadastro; conflitos reais continuam sendo 409. */
  if (existingByEmail || existingByAlias) {
    const samePendingAccount = existingByEmail
      && existingByAlias
      && existingByEmail.id === existingByAlias.id
      && !existingByEmail.emailVerified
      && await existingByEmail.verifyPassword(password);

    if (samePendingAccount) {
      return { user: existingByEmail, verificationPending: true, created: false };
    }

    if (existingByEmail) throw fail('Credenciais inválidas', 409);
    throw fail('Este @ já está em uso', 409);
  }

  const user = new User({
    id: uuidv7(),
    name,
    alias,
    email,
    passwordHash: await User.hashPassword(password),
    nationality,
    birthDate,
  });

  await authRepository.create(user);

  /* A conta nasce sem e-mail confirmado e, por isso, sem token: o login
     fica bloqueado até a confirmação. É o que impede que qualquer endereço
     digitado — inclusive o de outra pessoa — vire uma conta ativa.

     O envio fica dentro de um try: se o provedor de e-mail estiver fora do
     ar, a conta já existe e não deve ser perdida. O usuário pede um novo
     código na tela seguinte. Falhar aqui apagaria um cadastro válido por
     causa de um problema que não é dele. */
  try {
    await requestCode({ user, purpose: PURPOSES.SIGNUP });
  } catch (failure) {
    // eslint-disable-next-line no-console
    console.error('Falha ao enviar código de cadastro:', failure.message);
  }

  return { user, verificationPending: true, created: true };
}

/**
 * Reenvia o código de confirmação de uma conta ainda não verificada.
 *
 * A resposta é a mesma para e-mail existente, inexistente ou já confirmado.
 * Isso é deliberado: uma resposta diferente por caso transformaria a rota em
 * um verificador de quem tem conta aqui — informação que não é nossa para
 * distribuir. Quem tem a conta recebe o código; quem não tem, não recebe
 * nada e também não descobre nada.
 */
async function resendSignupCode({ email }) {
  if (!email) throw fail('Informe o e-mail', 400);

  const user = await authRepository.findByEmail(String(email).trim());

  if (user && !user.emailVerified) {
    await requestCode({ user, purpose: PURPOSES.SIGNUP });
  }

  return { ok: true };
}

/**
 * Confirma o e-mail com o código recebido e devolve o token.
 *
 * O token sai daqui porque a confirmação é o último passo do cadastro: pedir
 * que o usuário faça login logo depois de digitar um código seria um
 * obstáculo sem função de segurança — ele acabou de provar que tem o e-mail.
 */
async function confirmEmail({ email, code }) {
  if (!email || !code) throw fail('Campos obrigatórios ausentes', 400);

  const user = await authRepository.findByEmail(String(email).trim());

  /* Mensagem única para "não existe" e "código errado": distinguir os dois
     revelaria quais e-mails têm conta. */
  if (!user) throw fail('Código inválido ou expirado. Solicite um novo.', 400);

  if (user.emailVerified)
    return { token: generateToken(user), user };

  await confirmCode({
    userId: user.id,
    purpose: PURPOSES.SIGNUP,
    code,
  });

  await authRepository.confirmEmail(user.id);

  return { token: generateToken(user), user };
}

/**
 * Envia o código para troca de senha.
 *
 * Mesma resposta para e-mail existente ou não, pelo mesmo motivo do reenvio
 * de cadastro.
 */
async function requestPasswordReset({ email }) {
  if (!email) throw fail('Informe o e-mail', 400);

  const user = await authRepository.findByEmail(String(email).trim());

  if (user) {
    await requestCode({ user, purpose: PURPOSES.PASSWORD_RESET });
  }

  return { ok: true };
}

/**
 * Troca a senha mediante código.
 *
 * A nova senha passa pela mesma regra de força do cadastro, validada aqui e
 * não só na interface: a API é a fronteira real.
 */
async function resetPassword({ email, code, newPassword }) {
  if (!email || !code || !newPassword)
    throw fail('Campos obrigatórios ausentes', 400);

  if (!PASSWORD_RE.test(newPassword))
    throw fail('A senha precisa de 8 caracteres, uma letra maiúscula e um caractere especial', 400);

  const user = await authRepository.findByEmail(String(email).trim());

  if (!user) throw fail('Código inválido ou expirado. Solicite um novo.', 400);

  await confirmCode({
    userId: user.id,
    purpose: PURPOSES.PASSWORD_RESET,
    code,
  });

  await authRepository.updatePassword(user.id, await User.hashPassword(newPassword));

  /* Trocar a senha também confirma o e-mail: o usuário acabou de provar que
     tem acesso a ele. Prender uma conta em "não confirmada" depois disso
     seria pedir a mesma prova duas vezes. */
  await authRepository.confirmEmail(user.id);

  return { ok: true };
}

/**
 * Envia o código de exclusão para o e-mail do usuário autenticado.
 *
 * Diferente dos anteriores, este exige token: excluir é ação do dono da
 * sessão, não de quem conhece um endereço de e-mail.
 */
async function requestAccountDeletion(userId) {
  const user = await authRepository.findById(userId);

  if (!user) throw fail('Usuário não encontrado', 404);

  await requestCode({ user, purpose: PURPOSES.ACCOUNT_DELETION });

  /* O e-mail é devolvido mascarado para a interface poder dizer "enviamos
     para a***@gmail.com" — confirma ao usuário para onde o código foi sem
     escrever o endereço inteiro em uma tela que pode estar sendo vista por
     outra pessoa. */
  return { ok: true, email: maskEmail(user.email) };
}

/**
 * Exclui a conta do usuário autenticado, mediante código.
 *
 * Duas provas são exigidas: o token (é a sessão do dono) e o código enviado
 * ao e-mail (o dono está de fato ali, e não alguém em um computador deixado
 * aberto). Para uma ação irreversível, uma prova só é pouco.
 */
async function deleteAccount({ userId, code }) {
  const user = await authRepository.findById(userId);

  if (!user) throw fail('Usuário não encontrado', 404);

  await confirmCode({
    userId,
    purpose: PURPOSES.ACCOUNT_DELETION,
    code,
  });

  /* Conteúdo primeiro, conta depois.

     A ordem é deliberada: se o processo morrer no meio, o pior estado
     possível é uma conta ainda ativa com parte do conteúdo removido — que a
     pessoa consegue reportar e nós conseguimos terminar. A ordem inversa
     deixaria uma conta anonimizada com conteúdo publicado atribuído a
     "Conta encerrada", visível e sem dono para pedir a remoção. */
  await authRepository.purgeContent(userId);
  await authRepository.deleteAccount(userId);

  return { ok: true };
}

/**
 * Esconde o miolo do e-mail, preservando o primeiro caractere e o domínio.
 * "abraao@gmail.com" → "a*****@gmail.com"
 */
function maskEmail(email) {
  const [user, domain] = String(email ?? '').split('@');
  if (!domain) return '';
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(1, user.length - 1))}@${domain}`;
}

async function login({ email, password }) {
  if (!email || !password)
    throw fail('Campos obrigatórios ausentes', 400);

  // Aceita email ou @alias no mesmo campo.
  const identifier = String(email).trim();
  const user = EMAIL_RE.test(identifier)
    ? await authRepository.findByEmail(identifier)
    : await authRepository.findByAlias(identifier.replace(/^@/, ''));

  const passwordValid = user && await user.verifyPassword(password);

  if (!user || !passwordValid)
    throw fail('Credenciais inválidas', 401);

  /* Conta não confirmada não entra. A checagem vem DEPOIS da senha, e não
     antes: se viesse antes, bastaria digitar um e-mail qualquer para
     descobrir se ele tem conta aqui e se está confirmada. Depois da senha,
     só quem já provou ser o dono recebe essa informação.

     O status 403 (e não 401) distingue "não sabemos quem é você" de "sabemos
     quem é você, mas falta um passo" — é o que permite à interface levar o
     usuário à tela de código em vez de dizer "senha errada". */
  if (!user.emailVerified)
    throw fail('Confirme seu e-mail para entrar', 403);

  return { token: generateToken(user), user };
}

module.exports = {
  signUp,
  login,
  resendSignupCode,
  confirmEmail,
  requestPasswordReset,
  resetPassword,
  requestAccountDeletion,
  deleteAccount,
  maskEmail,
};
