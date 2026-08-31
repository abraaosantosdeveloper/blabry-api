/**
 * Cliente de e-mail transacional.
 *
 * Ferramenta escolhida: **Resend** (`npm i resend`).
 *
 * Por que Resend e não Nodemailer:
 *   - Nodemailer é um *transporte*: ele fala SMTP. Ainda seria preciso um
 *     servidor SMTP que entregue de verdade — e-mail enviado direto de um
 *     contêiner do Railway cai em spam ou é recusado, porque o IP não tem
 *     reputação, SPF, DKIM nem DMARC.
 *   - Resend é um *provedor*: cuida de entrega, reputação, assinatura do
 *     domínio e registro do que foi enviado. A camada de código some — é
 *     uma chamada HTTP com uma chave de API, sem porta SMTP, sem conexão
 *     persistente e sem segredo de servidor de e-mail no ambiente.
 *   - O plano gratuito cobre 3.000 e-mails por mês, o que é ordens de
 *     grandeza acima do que este projeto envia.
 *
 * Se um dia a escolha mudar, só este arquivo muda: o resto do sistema
 * conhece apenas `sendEmail({ to, subject, html, text })`.
 */

/* A dependência é carregada de forma preguiçosa, dentro da função, e não no
   topo do arquivo. Assim o projeto continua subindo — e os testes continuam
   rodando — antes de `npm i resend` ter sido executado. Um require no topo
   derrubaria o servidor inteiro por causa de um recurso opcional. */
let resendClient = null;

/** Endereço remetente. Precisa ser de um domínio verificado no Resend. */
const SENDER = process.env.EMAIL_SENDER || 'Blabry <onboarding@resend.dev>';

/**
 * Em desenvolvimento sem chave configurada, o e-mail é impresso no console
 * em vez de enviado.
 *
 * Isso é deliberado: sem essa saída, qualquer pessoa que clonasse o projeto
 * teria de criar conta no Resend antes de conseguir cadastrar um usuário.
 * Em produção o comportamento é o oposto — falta de chave é erro, e não um
 * modo silencioso onde ninguém recebe nada.
 */
const CONSOLE_MODE = !process.env.RESEND_API_KEY;

/**
 * Envia um e-mail transacional.
 *
 * @param {{to: string, subject: string, html: string, text: string}} message
 * @returns {Promise<void>}
 */
async function sendEmail({ to, subject, html, text }) {
  if (CONSOLE_MODE) {
    if (process.env.NODE_ENV === 'production') {
      // Em produção isso é falha de configuração, não um modo de trabalho.
      throw Object.assign(
        new Error('Serviço de e-mail indisponível'),
        { status: 503 }
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n───────── E-MAIL (modo console) ─────────\n` +
      `Para:    ${to}\n` +
      `Assunto: ${subject}\n\n${text}\n` +
      `─────────────────────────────────────────\n`
    );
    return;
  }

  // Carrega e instancia uma única vez, no primeiro envio.
  if (!resendClient) {
    // eslint-disable-next-line global-require
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  const { error } = await resendClient.emails.send({
    from: SENDER,
    to: to,
    subject: subject,
    html,
    text: text,
  });

  /* O SDK do Resend devolve o erro no retorno em vez de lançar. Sem esta
     checagem, uma falha de envio passaria como sucesso e o usuário ficaria
     esperando um código que nunca saiu. */
  if (error) {
    throw Object.assign(
      new Error('Não foi possível enviar o e-mail'),
      { status: 502, causa: error }
    );
  }
}

module.exports = { sendEmail, CONSOLE_MODE, SENDER };
