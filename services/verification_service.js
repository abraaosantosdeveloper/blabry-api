const bcrypt = require('bcrypt');
const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const VerificationRepository = require('../repositories/verification_repository');
const { sendCode } = require('./email_service');
const {
  PURPOSES,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_SECONDS,
  generateCode,
  expiresAt,
  validFormat,
} = require('../utils/verification_code');

const verificationRepository = new VerificationRepository(pool);

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

/* Custo do bcrypt para o código.

   Menor do que o da senha (12) de propósito. O código vive 15 minutos, tem
   um espaço de um milhão de combinações e já é protegido por um limite de
   tentativas — a lentidão do hash não é a defesa principal aqui, e custo 12
   em cada verificação atrasaria a resposta sem ganho real de segurança.
   Ainda assim é bcrypt, e não SHA: se a tabela vazar, os códigos vivos não
   saem de lá em texto. */
const CODE_HASH_COST = 8;

/**
 * Emite um código e o envia por e-mail.
 *
 * @param {{user: object, purpose: string}} data
 * @returns {Promise<void>}
 */
async function requestCode({ user, purpose }) {
  /* Limite de reenvio. Existe por dois motivos: impedir que a caixa de
     entrada de alguém seja usada como alvo de spam por um terceiro que
     conheça o e-mail, e conter o custo com o provedor de envio. */
  const seconds = await verificationRepository.secondsSinceLast(user.id, purpose);

  if (seconds !== null && seconds < RESEND_INTERVAL_SECONDS) {
    throw fail(
      `Aguarde ${RESEND_INTERVAL_SECONDS - seconds} segundos para pedir um novo código`,
      429
    );
  }

  const code = generateCode();

  await verificationRepository.create({
    id: uuidv7(),
    userId: user.id,
    purpose,
    // Só o hash é gravado. O texto puro existe apenas nesta função e no
    // e-mail — nem o banco nem os registros de log chegam a vê-lo.
    codeHash: await bcrypt.hash(code, CODE_HASH_COST),
    expiresAt: expiresAt(),
  });

  await sendCode({
    to: user.email,
    name: user.name,
    code,
    purpose,
  });
}

/**
 * Confere um código informado e o consome.
 *
 * Devolve nada em caso de sucesso e lança em caso de falha: quem chama não
 * precisa checar um booleano de retorno, e um `if` esquecido não vira uma
 * autorização acidental.
 *
 * @param {{userId: string, purpose: string, code: string}} data
 */
async function confirmCode({ userId, purpose, code }) {
  /* Checagem de formato antes de qualquer ida ao banco: recusa lixo sem
     gastar uma comparação bcrypt e sem consumir tentativa do usuário. */
  if (!validFormat(code))
    throw fail('Código inválido', 400);

  const active = await verificationRepository.findActive(userId, purpose, MAX_ATTEMPTS);

  /* Uma única mensagem para "não existe", "expirou" e "estourou as
     tentativas". Detalhar qual dos três é diria a um atacante se vale a
     pena continuar; para o usuário legítimo, a ação é a mesma nos três
     casos: pedir um novo código. */
  if (!active)
    throw fail('Código inválido ou expirado. Solicite um novo.', 400);

  const matches = await bcrypt.compare(String(code).trim(), active.codeHash);

  if (!matches) {
    // A tentativa errada é contabilizada antes de responder: é ela que
    // torna o chute caro.
    await verificationRepository.registerAttempt(active.id);
    throw fail('Código inválido ou expirado. Solicite um novo.', 400);
  }

  /* O consumo devolve as linhas afetadas. Se duas requisições chegarem com
     o mesmo código ao mesmo tempo, só uma afeta a linha — a outra recebe 0
     e é recusada aqui. Sem essa checagem existiria uma janela entre
     verificar e marcar, e as duas passariam. */
  const consumed = await verificationRepository.consume(active.id);

  if (!consumed)
    throw fail('Código inválido ou expirado. Solicite um novo.', 400);

  // Usado um código do propósito, os demais pendentes do mesmo propósito
  // perdem a validade — não faz sentido um código antigo de troca de senha
  // continuar valendo depois da senha trocada.
  await verificationRepository.invalidatePending(userId, purpose);
}

module.exports = { requestCode, confirmCode, PURPOSES };
