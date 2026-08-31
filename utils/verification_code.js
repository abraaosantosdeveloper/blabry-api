const crypto = require('crypto');

/**
 * Regras e geração dos códigos de verificação enviados por e-mail.
 *
 * Estão em um módulo próprio porque são política, não mecânica: quantos
 * dígitos, quanto tempo, quantas tentativas. Concentrar isso em um lugar
 * evita que "10 minutos" apareça como número solto em três serviços
 * diferentes e depois divirja em um deles.
 */

/** Quantidade de dígitos do código. */
const LENGTH = 6;

/** Validade, em minutos. */
const VALIDITY_MINUTES = 15;

/** Tentativas erradas toleradas antes do código ser invalidado. */
const MAX_ATTEMPTS = 5;

/** Intervalo mínimo, em segundos, entre dois pedidos do mesmo propósito. */
const RESEND_INTERVAL_SECONDS = 60;

/**
 * Os três propósitos possíveis, espelhando o ENUM da coluna `purpose`.
 *
 * O objeto é congelado para que ninguém acrescente um propósito em tempo de
 * execução: o banco recusaria o valor, e o erro apareceria longe da causa.
 */
const PURPOSES = Object.freeze({
  SIGNUP: 'signup',
  PASSWORD_RESET: 'password_reset',
  ACCOUNT_DELETION: 'account_deletion',
});

/**
 * Gera um código numérico de `LENGTH` dígitos.
 *
 * Usa `crypto.randomInt`, e não `Math.random`. `Math.random` não é
 * criptograficamente seguro: sua sequência é previsível a partir de
 * observações suficientes, e aqui o valor gerado é literalmente a chave
 * temporária de uma conta.
 *
 * `padStart` preserva zeros à esquerda — 42 vira "000042". Sem isso, o
 * espaço de códigos encolheria e alguns códigos teriam menos dígitos.
 *
 * @returns {string} código com exatamente LENGTH dígitos
 */
function generateCode() {
  const max = 10 ** LENGTH;
  return String(crypto.randomInt(0, max)).padStart(LENGTH, '0');
}

/**
 * Momento em que um código emitido agora deixa de valer.
 * @returns {Date}
 */
function expiresAt() {
  return new Date(Date.now() + VALIDITY_MINUTES * 60 * 1000);
}

/**
 * Confere se o texto informado tem o formato de um código.
 *
 * É uma checagem de formato, não de validade: serve para recusar lixo antes
 * de gastar uma comparação de hash (bcrypt é lento de propósito) e antes de
 * consumir uma das tentativas do usuário.
 *
 * @param {any} value
 * @returns {boolean}
 */
function validFormat(value) {
  return new RegExp(`^\\d{${LENGTH}}$`).test(String(value ?? '').trim());
}

module.exports = {
  LENGTH,
  VALIDITY_MINUTES,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_SECONDS,
  PURPOSES,
  generateCode,
  expiresAt,
  validFormat,
};
