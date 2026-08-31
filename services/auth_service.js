const jwt = require('jsonwebtoken');
const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const AuthRepository = require('../repositories/auth_repository');
const User = require('../models/user');
const { solicitarCodigo, confirmarCodigo, PROPOSITOS } = require('./verificacao_service');

const authRepository = new AuthRepository(pool);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Mesma regra de força de senha usada pela interface no cadastro: no mínimo
   8 caracteres, uma maiúscula e um caractere não alfanumérico. Repetida aqui
   porque a troca de senha por código não passa pelo formulário de cadastro. */
const SENHA_RE = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nome: usuario.nome },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

async function cadastrarUsuario({ nome, apelido, email, senha, nascimento, nacionalidade, aceitouPolitica }) {
  if (!nome || !apelido || !email || !senha || !nascimento || !nacionalidade)
    throw erro('Campos obrigatórios ausentes', 400);

  /* O aceite da política é barrado na interface, mas a validação existe aqui
     porque a interface é conveniência e a API é a fronteira real: qualquer
     cliente pode enviar um cadastro direto, sem passar pelo formulário.

     A comparação é estrita com `true`. Sem isso, a string "false" — que é o
     que chega quando um formulário serializa um booleano sem cuidado — seria
     considerada verdadeira, porque toda string não vazia é. */
  if (aceitouPolitica !== true)
    throw erro('É necessário aceitar a política de privacidade', 400);

  if (await authRepository.buscarPorEmail(email))
    throw erro('Credenciais inválidas', 409);

  if (await authRepository.buscarPorApelido(apelido))
    throw erro('Este @ já está em uso', 409);

  const usuario = new User({
    id: uuidv7(),
    nome,
    apelido,
    email,
    senhaHash: await User.gerarHash(senha),
    nacionalidade,
    nascimento,
  });

  await authRepository.criar(usuario);

  /* A conta nasce sem e-mail confirmado e, por isso, sem token: o login
     fica bloqueado até a confirmação. É o que impede que qualquer endereço
     digitado — inclusive o de outra pessoa — vire uma conta ativa.

     O envio fica dentro de um try: se o provedor de e-mail estiver fora do
     ar, a conta já existe e não deve ser perdida. O usuário pede um novo
     código na tela seguinte. Falhar aqui apagaria um cadastro válido por
     causa de um problema que não é dele. */
  try {
    await solicitarCodigo({ usuario, proposito: PROPOSITOS.CADASTRO });
  } catch (falha) {
    // eslint-disable-next-line no-console
    console.error('Falha ao enviar código de cadastro:', falha.message);
  }

  return { usuario, verificacaoPendente: true };
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
async function reenviarCodigoCadastro({ email }) {
  if (!email) throw erro('Informe o e-mail', 400);

  const usuario = await authRepository.buscarPorEmail(String(email).trim());

  if (usuario && !usuario.emailVerificado) {
    await solicitarCodigo({ usuario, proposito: PROPOSITOS.CADASTRO });
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
async function confirmarEmail({ email, codigo }) {
  if (!email || !codigo) throw erro('Campos obrigatórios ausentes', 400);

  const usuario = await authRepository.buscarPorEmail(String(email).trim());

  /* Mensagem única para "não existe" e "código errado": distinguir os dois
     revelaria quais e-mails têm conta. */
  if (!usuario) throw erro('Código inválido ou expirado. Solicite um novo.', 400);

  if (usuario.emailVerificado)
    return { token: gerarToken(usuario), usuario };

  await confirmarCodigo({
    usuarioId: usuario.id,
    proposito: PROPOSITOS.CADASTRO,
    codigo,
  });

  await authRepository.confirmarEmail(usuario.id);

  return { token: gerarToken(usuario), usuario };
}

/**
 * Envia o código para troca de senha.
 *
 * Mesma resposta para e-mail existente ou não, pelo mesmo motivo do reenvio
 * de cadastro.
 */
async function solicitarTrocaDeSenha({ email }) {
  if (!email) throw erro('Informe o e-mail', 400);

  const usuario = await authRepository.buscarPorEmail(String(email).trim());

  if (usuario) {
    await solicitarCodigo({ usuario, proposito: PROPOSITOS.SENHA });
  }

  return { ok: true };
}

/**
 * Troca a senha mediante código.
 *
 * A nova senha passa pela mesma regra de força do cadastro, validada aqui e
 * não só na interface: a API é a fronteira real.
 */
async function trocarSenha({ email, codigo, novaSenha }) {
  if (!email || !codigo || !novaSenha)
    throw erro('Campos obrigatórios ausentes', 400);

  if (!SENHA_RE.test(novaSenha))
    throw erro('A senha precisa de 8 caracteres, uma letra maiúscula e um caractere especial', 400);

  const usuario = await authRepository.buscarPorEmail(String(email).trim());

  if (!usuario) throw erro('Código inválido ou expirado. Solicite um novo.', 400);

  await confirmarCodigo({
    usuarioId: usuario.id,
    proposito: PROPOSITOS.SENHA,
    codigo,
  });

  await authRepository.atualizarSenha(usuario.id, await User.gerarHash(novaSenha));

  /* Trocar a senha também confirma o e-mail: o usuário acabou de provar que
     tem acesso a ele. Prender uma conta em "não confirmada" depois disso
     seria pedir a mesma prova duas vezes. */
  await authRepository.confirmarEmail(usuario.id);

  return { ok: true };
}

/**
 * Envia o código de exclusão para o e-mail do usuário autenticado.
 *
 * Diferente dos anteriores, este exige token: excluir é ação do dono da
 * sessão, não de quem conhece um endereço de e-mail.
 */
async function solicitarExclusao(usuarioId) {
  const usuario = await authRepository.buscarPorId(usuarioId);

  if (!usuario) throw erro('Usuário não encontrado', 404);

  await solicitarCodigo({ usuario, proposito: PROPOSITOS.EXCLUSAO });

  /* O e-mail é devolvido mascarado para a interface poder dizer "enviamos
     para a***@gmail.com" — confirma ao usuário para onde o código foi sem
     escrever o endereço inteiro em uma tela que pode estar sendo vista por
     outra pessoa. */
  return { ok: true, email: mascararEmail(usuario.email) };
}

/**
 * Exclui a conta do usuário autenticado, mediante código.
 *
 * Duas provas são exigidas: o token (é a sessão do dono) e o código enviado
 * ao e-mail (o dono está de fato ali, e não alguém em um computador deixado
 * aberto). Para uma ação irreversível, uma prova só é pouco.
 */
async function excluirConta({ usuarioId, codigo }) {
  const usuario = await authRepository.buscarPorId(usuarioId);

  if (!usuario) throw erro('Usuário não encontrado', 404);

  await confirmarCodigo({
    usuarioId,
    proposito: PROPOSITOS.EXCLUSAO,
    codigo,
  });

  await authRepository.excluirConta(usuarioId);

  return { ok: true };
}

/**
 * Esconde o miolo do e-mail, preservando o primeiro caractere e o domínio.
 * "abraao@gmail.com" → "a*****@gmail.com"
 */
function mascararEmail(email) {
  const [usuario, dominio] = String(email ?? '').split('@');
  if (!dominio) return '';
  return `${usuario.slice(0, 1)}${'*'.repeat(Math.max(1, usuario.length - 1))}@${dominio}`;
}

async function login({ email, senha }) {
  if (!email || !senha)
    throw erro('Campos obrigatórios ausentes', 400);

  // Aceita email ou @alias no mesmo campo.
  const identificador = String(email).trim();
  const usuario = EMAIL_RE.test(identificador)
    ? await authRepository.buscarPorEmail(identificador)
    : await authRepository.buscarPorApelido(identificador.replace(/^@/, ''));

  const senhaValida = usuario && await usuario.verificarSenha(senha);

  if (!usuario || !senhaValida)
    throw erro('Credenciais inválidas', 401);

  /* Conta não confirmada não entra. A checagem vem DEPOIS da senha, e não
     antes: se viesse antes, bastaria digitar um e-mail qualquer para
     descobrir se ele tem conta aqui e se está confirmada. Depois da senha,
     só quem já provou ser o dono recebe essa informação.

     O status 403 (e não 401) distingue "não sabemos quem é você" de "sabemos
     quem é você, mas falta um passo" — é o que permite à interface levar o
     usuário à tela de código em vez de dizer "senha errada". */
  if (!usuario.emailVerificado)
    throw erro('Confirme seu e-mail para entrar', 403);

  return { token: gerarToken(usuario), usuario };
}

module.exports = {
  cadastrarUsuario,
  login,
  reenviarCodigoCadastro,
  confirmarEmail,
  solicitarTrocaDeSenha,
  trocarSenha,
  solicitarExclusao,
  excluirConta,
  mascararEmail,
};
