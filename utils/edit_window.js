/** Tempo em que o autor ainda pode corrigir o que publicou. */
const JANELA_MINUTOS = 15;
const JANELA_MS = JANELA_MINUTOS * 60 * 1000;

/**
 * Verifica se um conteúdo ainda está dentro da janela de edição.
 *
 * O cálculo é sempre com base no horário do servidor. O relógio do cliente
 * é ajustável — esconder o botão no front é conveniência, não regra.
 *
 * @param {string|Date} criadoEm
 */
function dentroDaJanela(criadoEm) {
  const criado = new Date(criadoEm).getTime();
  if (Number.isNaN(criado)) return false;
  return Date.now() - criado <= JANELA_MS;
}

module.exports = { JANELA_MINUTOS, JANELA_MS, dentroDaJanela };