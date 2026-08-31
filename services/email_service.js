const { enviarEmail } = require('../config/email');
const { VALIDADE_MINUTOS } = require('../utils/verification_code');

/**
 * Monta e envia os e-mails com código de verificação.
 *
 * Separado do serviço de verificação de propósito: aquele decide *quando* um
 * código pode ser emitido e se um código informado confere; este decide o que
 * o usuário lê. São dois motivos de mudança diferentes — mexer no texto de um
 * e-mail não deveria arriscar a regra de expiração.
 */

/* Escapa os caracteres que teriam significado dentro do HTML.

   O nome do usuário é escrito por ele e vai para dentro de uma <p>. Sem
   escapar, um nome contendo "<img onerror=...>" viraria marcação executável
   no cliente de e-mail de quem recebe. É o mesmo cuidado do HTML da página,
   com o agravante de que aqui não há framework fazendo isso por nós. */
const escapar = (texto) =>
  String(texto ?? '')
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
const TEXTOS = {
  signup: {
    assunto: 'Confirme seu e-mail no Blabry',
    titulo: 'Bem-vindo ao Blabry!',
    explicacao: 'Use o código abaixo para confirmar seu e-mail e ativar sua conta.',
    aviso: 'Se não foi você que criou esta conta, ignore este e-mail — sem a confirmação, ela não é ativada.',
  },
  password_reset: {
    assunto: 'Código para alterar sua senha',
    titulo: 'Alteração de senha',
    explicacao: 'Use o código abaixo para definir uma nova senha.',
    aviso: 'Se não foi você que pediu, ignore este e-mail e sua senha continua a mesma. Vale trocá-la por precaução.',
  },
  account_deletion: {
    assunto: 'Código para excluir sua conta',
    titulo: 'Exclusão de conta',
    explicacao: 'Use o código abaixo para confirmar a exclusão da sua conta.',
    aviso: 'Se não foi você que pediu, IGNORE este e-mail e troque sua senha imediatamente — alguém pode ter acesso à sua conta.',
  },
};

/**
 * Envia o código ao usuário.
 *
 * @param {{para: string, nome: string, codigo: string, proposito: string}} dados
 */
async function enviarCodigo({ para, nome, codigo, proposito }) {
  const texto = TEXTOS[proposito];

  /* Propósito desconhecido é erro de programação, não do usuário: falhar
     alto aqui é melhor do que enviar um e-mail sem assunto. */
  if (!texto) throw new Error(`Propósito de verificação desconhecido: ${proposito}`);

  const primeiroNome = String(nome ?? '').trim().split(' ')[0] || 'Olá';

  /* HTML com estilos embutidos: clientes de e-mail ignoram <style> no head e
     não carregam CSS externo. Nada de imagem remota, para o e-mail não
     depender de "exibir imagens". */
  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1F2933">
      <h1 style="font-size:20px;margin:0 0 8px">${escapar(texto.titulo)}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 4px">Olá, ${escapar(primeiroNome)}.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${escapar(texto.explicacao)}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
                background:#F4F6F8;border-radius:12px;padding:18px;margin:0 0 20px">${escapar(codigo)}</p>
      <p style="font-size:13px;line-height:1.6;color:#616A76;margin:0 0 8px">
        O código vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.
      </p>
      <p style="font-size:13px;line-height:1.6;color:#616A76;margin:0">${escapar(texto.aviso)}</p>
    </div>
  `;

  /* Versão em texto puro obrigatória: alguns clientes só mostram essa, e um
     e-mail sem alternativa em texto pesa mais na avaliação de spam. */
  const simples =
    `${texto.titulo}\n\n` +
    `Olá, ${primeiroNome}.\n${texto.explicacao}\n\n` +
    `Código: ${codigo}\n\n` +
    `O código vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.\n` +
    `${texto.aviso}\n`;

  await enviarEmail({ para, assunto: texto.assunto, html, texto: simples });
}

module.exports = { enviarCodigo, TEXTOS };
