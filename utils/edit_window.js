/** Tempo em que o autor ainda pode corrigir o que publicou. */
const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

/**
 * Verifica se um conteúdo ainda está dentro da janela de edição.
 *
 * O cálculo é sempre com base no horário do servidor. O relógio do cliente
 * é ajustável — esconder o botão no front é conveniência, não regra.
 *
 * @param {string|Date} createdAt
 */
function withinWindow(createdAt) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= WINDOW_MS;
}

module.exports = { WINDOW_MINUTES, WINDOW_MS, withinWindow };