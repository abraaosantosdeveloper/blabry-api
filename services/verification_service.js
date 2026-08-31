const bcrypt = require('bcrypt');
const { v7: uuidv7 } = require('uuid');
const pool = require('../database');
const VerificacaoRepository = require('../repositories/verification_repository');
const { enviarCodigo } = require('./email_service');
const {
  PROPOSITOS,
  TENTATIVAS_MAXIMAS,
  INTERVALO_REENVIO_SEGUNDOS,
  gerarCodigo,
  expiraEm,
  formatoValido,
} = require('../utils/verification_code');

const verificacaoRepository = new VerificacaoRepository(pool);

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

/* Custo do bcrypt para o código.

   Menor do que o da senha (12) de propósito. O código vive 15 minutos, tem
   um espaço de um milhão de combinações e já é protegido por um limite de
   tentativas — a lentidão do hash não é a defesa principal aqui, e custo 12
   em cada verificação atrasaria a resposta sem ganho real de segurança.
   Ainda assim é bcrypt, e não SHA: se a tabela vazar, os códigos vivos não
   saem de lá em texto. */
const CUSTO_HASH_CODIGO = 8;

/**
 * Emite um código e o envia por e-mail.
 *
 * @param {{usuario: object, proposito: string}} dados
 * @returns {Promise<void>}
 */
async function solicitarCodigo({ usuario, proposito }) {
  /* Limite de reenvio. Existe por dois motivos: impedir que a caixa de
     entrada de alguém seja usada como alvo de spam por um terceiro que
     conheça o e-mail, e conter o custo com o provedor de envio. */
  const segundos = await verificacaoRepository.segundosDesdeUltimo(usuario.id, proposito);

  if (segundos !== null && segundos < INTERVALO_REENVIO_SEGUNDOS) {
    throw erro(
      `Aguarde ${INTERVALO_REENVIO_SEGUNDOS - segundos} segundos para pedir um novo código`,
      429
    );
  }

  const codigo = gerarCodigo();

  await verificacaoRepository.criar({
    id: uuidv7(),
    usuarioId: usuario.id,
    proposito,
    // Só o hash é gravado. O texto puro existe apenas nesta função e no
    // e-mail — nem o banco nem os registros de log chegam a vê-lo.
    codigoHash: await bcrypt.hash(codigo, CUSTO_HASH_CODIGO),
    expiraEm: expiraEm(),
  });

  await enviarCodigo({
    para: usuario.email,
    nome: usuario.nome,
    codigo,
    proposito,
  });
}

/**
 * Confere um código informado e o consome.
 *
 * Devolve nada em caso de sucesso e lança em caso de falha: quem chama não
 * precisa checar um booleano de retorno, e um `if` esquecido não vira uma
 * autorização acidental.
 *
 * @param {{usuarioId: string, proposito: string, codigo: string}} dados
 */
async function confirmarCodigo({ usuarioId, proposito, codigo }) {
  /* Checagem de formato antes de qualquer ida ao banco: recusa lixo sem
     gastar uma comparação bcrypt e sem consumir tentativa do usuário. */
  if (!formatoValido(codigo))
    throw erro('Código inválido', 400);

  const ativo = await verificacaoRepository.buscarAtivo(usuarioId, proposito, TENTATIVAS_MAXIMAS);

  /* Uma única mensagem para "não existe", "expirou" e "estourou as
     tentativas". Detalhar qual dos três é diria a um atacante se vale a
     pena continuar; para o usuário legítimo, a ação é a mesma nos três
     casos: pedir um novo código. */
  if (!ativo)
    throw erro('Código inválido ou expirado. Solicite um novo.', 400);

  const confere = await bcrypt.compare(String(codigo).trim(), ativo.codigoHash);

  if (!confere) {
    // A tentativa errada é contabilizada antes de responder: é ela que
    // torna o chute caro.
    await verificacaoRepository.registrarTentativa(ativo.id);
    throw erro('Código inválido ou expirado. Solicite um novo.', 400);
  }

  /* O consumo devolve as linhas afetadas. Se duas requisições chegarem com
     o mesmo código ao mesmo tempo, só uma afeta a linha — a outra recebe 0
     e é recusada aqui. Sem essa checagem existiria uma janela entre
     verificar e marcar, e as duas passariam. */
  const consumido = await verificacaoRepository.consumir(ativo.id);

  if (!consumido)
    throw erro('Código inválido ou expirado. Solicite um novo.', 400);

  // Usado um código do propósito, os demais pendentes do mesmo propósito
  // perdem a validade — não faz sentido um código antigo de troca de senha
  // continuar valendo depois da senha trocada.
  await verificacaoRepository.invalidarPendentes(usuarioId, proposito);
}

module.exports = { solicitarCodigo, confirmarCodigo, PROPOSITOS };
