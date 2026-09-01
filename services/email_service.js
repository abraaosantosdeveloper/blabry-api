const { sendEmail } = require('../config/email');
const { VALIDITY_MINUTES } = require('../utils/verification_code');

/**
 * Monta e envia os e-mails com código de verificação.
 *
 * Separado do serviço de verificação de propósito: aquele decide *quando* um
 * código pode ser emitido e se um código informado confere; este decide o que
 * o usuário lê. São dois motivos de mudança diferentes — mexer no texto de um
 * e-mail não deveria arriscar a regra de expiração.
 *
 * O conteúdo permanece em português: é lido pelo usuário final.
 */

/* Escapa os caracteres que teriam significado dentro do HTML.

   O nome do usuário é escrito por ele e vai para dentro de uma <p>. Sem
   escapar, um nome contendo "<img onerror=...>" viraria marcação executável
   no cliente de e-mail de quem recebe. É o mesmo cuidado do HTML da página,
   com o agravante de que aqui não há framework fazendo isso por nós. */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Texto específico de cada propósito.
 *
 * Um objeto e não um `switch`: acrescentar um quarto fluxo passa a ser
 * acrescentar uma chave, sem tocar na função que monta o e-mail.
 */
const TEMPLATES = {
  signup: {
    subject: 'Confirme seu e-mail no Blabry',
    title: 'Bem-vindo ao Blabry!',
    explanation: 'Use o código abaixo para confirmar seu e-mail e ativar sua conta.',
    warning: 'Se não foi você que criou esta conta, ignore este e-mail — sem a confirmação, ela não é ativada.',
  },
  password_reset: {
    subject: 'Código para alterar sua senha',
    title: 'Alteração de senha',
    explanation: 'Use o código abaixo para definir uma nova senha.',
    warning: 'Se não foi você que pediu, ignore este e-mail e sua senha continua a mesma. Vale trocá-la por precaução.',
  },
  account_deletion: {
    subject: 'Código para excluir sua conta',
    title: 'Exclusão de conta',
    explanation: 'Use o código abaixo para confirmar a exclusão da sua conta.',
    warning: 'Se não foi você que pediu, IGNORE este e-mail e troque sua senha imediatamente — alguém pode ter acesso à sua conta.',
  },
};

/**
 * Envia o código ao usuário.
 *
 * @param {{to: string, name: string, code: string, purpose: string}} data
 */
async function sendCode({ to, name, code, purpose }) {
  const template = TEMPLATES[purpose];

  /* Propósito desconhecido é erro de programação, não do usuário: falhar
     alto aqui é melhor do que enviar um e-mail sem assunto. */
  if (!template) throw new Error(`Propósito de verificação desconhecido: ${purpose}`);

  const firstName = String(name ?? '').trim().split(' ')[0] || 'Olá';

  /* HTML com estilos embutidos: clientes de e-mail ignoram <style> no head e
     não carregam CSS externo. Nada de imagem remota, para o e-mail não
     depender de "exibir imagens". */
  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1F2933;background-color:#FFFFFF">
      <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(template.title)}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 4px">Olá, ${escapeHtml(firstName)}.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${escapeHtml(template.explanation)}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
                background:#F4F6F8;border-radius:12px;padding:18px;margin:0 0 20px">${escapeHtml(code)}</p>
      <p style="font-size:13px;line-height:1.6;color:#616A76;margin:0 0 8px">
        O código vale por ${VALIDITY_MINUTES} minutos e só pode ser usado uma vez.
      </p>
      <p style="font-size:13px;line-height:1.6;color:#616A76;margin:0">${escapeHtml(template.warning)}</p>
    </div>
  `;

  /* Versão em texto puro obrigatória: alguns clientes só mostram essa, e um
     e-mail sem alternativa em texto pesa mais na avaliação de spam. */
  const plain =
    `${template.title}\n\n` +
    `Olá, ${firstName}.\n${template.explanation}\n\n` +
    `Código: ${code}\n\n` +
    `O código vale por ${VALIDITY_MINUTES} minutos e só pode ser usado uma vez.\n` +
    `${template.warning}\n`;

  await sendEmail({ to, subject: template.subject, html, text: plain });
}

module.exports = { sendCode, TEMPLATES };
