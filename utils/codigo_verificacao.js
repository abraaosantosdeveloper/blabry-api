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
const TAMANHO = 6;

/** Validade, em minutos. */
const VALIDADE_MINUTOS = 15;

/** Tentativas erradas toleradas antes do código ser invalidado. */
const TENTATIVAS_MAXIMAS = 5;

/** Intervalo mínimo, em segundos, entre dois pedidos do mesmo propósito. */
const INTERVALO_REENVIO_SEGUNDOS = 60;

/**
 * Os três propósitos possíveis, espelhando o ENUM da coluna `purpose`.
 *
 * O objeto é congelado para que ninguém acrescente um propósito em tempo de
 * execução: o banco recusaria o valor, e o erro apareceria longe da causa.
 */
const PROPOSITOS = Object.freeze({
  CADASTRO: 'signup',
  SENHA: 'password_reset',
  EXCLUSAO: 'account_deletion',
});

/**
 * Gera um código numérico de `TAMANHO` dígitos.
 *
 * Usa `crypto.randomInt`, e não `Math.random`. `Math.random` não é
 * criptograficamente seguro: sua sequência é previsível a partir de
 * observações suficientes, e aqui o valor gerado é literalmente a chave
 * temporária de uma conta.
 *
 * `padStart` preserva zeros à esquerda — 42 vira "000042". Sem isso, o
 * espaço de códigos encolheria e alguns códigos teriam menos dígitos.
 *
 * @returns {string} código com exatamente TAMANHO dígitos
 */
function gerarCodigo() {
  const maximo = 10 ** TAMANHO;
  return String(crypto.randomInt(0, maximo)).padStart(TAMANHO, '0');
}

/**
 * Momento em que um código emitido agora deixa de valer.
 * @returns {Date}
 */
function expiraEm() {
  return new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);
}

/**
 * Confere se o texto informado tem o formato de um código.
 *
 * É uma checagem de formato, não de validade: serve para recusar lixo antes
 * de gastar uma comparação de hash (bcrypt é lento de propósito) e antes de
 * consumir uma das tentativas do usuário.
 *
 * @param {any} valor
 * @returns {boolean}
 */
function formatoValido(valor) {
  return new RegExp(`^\\d{${TAMANHO}}$`).test(String(valor ?? '').trim());
}

module.exports = {
  TAMANHO,
  VALIDADE_MINUTOS,
  TENTATIVAS_MAXIMAS,
  INTERVALO_REENVIO_SEGUNDOS,
  PROPOSITOS,
  gerarCodigo,
  expiraEm,
  formatoValido,
};
