/**
 * Limitador de requisições por janela fixa, em memória.
 *
 * Por que sem dependência: a aplicação roda em **uma** instância no Railway,
 * e um contador em memória é exato nesse cenário. `express-rate-limit` com
 * store em memória faria a mesma coisa, com mais código para auditar. A troca
 * passa a valer quando houver mais de uma instância — aí nenhum contador
 * local funciona, e a resposta é um store compartilhado (Redis), não uma
 * biblioteca diferente. Este arquivo é a única coisa que muda nesse dia.
 *
 * Janela fixa e não deslizante: no pior caso ela tolera o dobro do limite na
 * virada de duas janelas. Para conter força bruta em senha isso é irrelevante
 * — o que importa é a ordem de grandeza, não a precisão do contador.
 *
 * ATENÇÃO: depende de `app.set('trust proxy', 1)`. Sem isso, atrás do proxy
 * do Railway todo mundo chega com o mesmo IP, os visitantes compartilham um
 * balde só, e o primeiro a estourar o limite tranca os demais.
 */

/* Um Map por limitador, e não um global compartilhado: assim o limite do
   login não consome o balde do cadastro. */
const LIMPEZA_MS = 10 * 60 * 1000;

/**
 * @param {object}   opcoes
 * @param {number}   opcoes.janelaMs   duração da janela, em milissegundos
 * @param {number}   opcoes.maximo     requisições permitidas por janela
 * @param {string}   opcoes.mensagem   texto devolvido ao estourar
 * @param {(req) => string} [opcoes.chave] como identificar o cliente
 * @returns {import('express').RequestHandler}
 */
function limitarRequisicoes({ janelaMs, maximo, mensagem, chave = (req) => req.ip }) {
  /** chave -> { contagem, expiraEm } */
  const baldes = new Map();

  /* Sem esta limpeza o Map cresceria indefinidamente: cada IP que já apareceu
     ficaria guardado para sempre, e isso é vazamento de memória em processo
     de longa duração. `unref()` para o timer não impedir o processo de
     encerrar — sem ele, `npm test` ficaria pendurado. */
  const relogio = setInterval(() => {
    const agora = Date.now();
    for (const [k, balde] of baldes) if (balde.expiraEm <= agora) baldes.delete(k);
  }, LIMPEZA_MS);
  relogio.unref();

  return (req, res, next) => {
    /* Sob teste o limitador não age.

       Não é conveniência: a suíte roda dezenas de requisições do mesmo
       endereço em segundos, que é exatamente o padrão que o limitador
       existe para barrar. Mantê-lo ligado faria os testes de autenticação
       falharem por 429 — e, pior, o primeiro 429 derruba o preparo do
       cenário, então a falha aparece longe da causa.

       O comportamento do limitador não fica sem cobertura: ele tem suíte
       própria em tests/middlewares/rate_limit.test.js, que exercita limite,
       isolamento por chave, expiração da janela e Retry-After. */
    if (process.env.NODE_ENV === 'test') return next();

    const agora = Date.now();
    const k = chave(req);
    let balde = baldes.get(k);

    // Janela inexistente ou vencida: começa uma nova.
    if (!balde || balde.expiraEm <= agora) {
      balde = { contagem: 0, expiraEm: agora + janelaMs };
      baldes.set(k, balde);
    }

    balde.contagem += 1;

    if (balde.contagem > maximo) {
      const segundos = Math.ceil((balde.expiraEm - agora) / 1000);
      // Retry-After é padrão do HTTP: diz ao cliente quando voltar. Clientes
      // bem-comportados respeitam; os outros continuam recebendo 429.
      res.set('Retry-After', String(segundos));
      return next(Object.assign(
        new Error(mensagem ?? `Muitas tentativas. Aguarde ${segundos} segundos.`),
        { status: 429 }
      ));
    }

    next();
  };
}

/* Cada rota sensível tem o próprio balde, e isso não é detalhe.

   Um balde compartilhado entre cadastro, verificação e login significa que
   um usuário novo gasta três ou quatro requisições só para entrar pela
   primeira vez. Atrás de uma rede compartilhada — universidade, escritório,
   operadora móvel —, onde centenas de pessoas saem pelo mesmo endereço,
   isso trancaria a quinta pessoa a se cadastrar. Baldes separados fazem cada
   limite responder ao abuso que ele realmente pretende conter. */

/**
 * Login. É aqui que mora a força bruta contra senha.
 *
 * O usuário legítimo erra três ou quatro vezes; um ataque precisa de
 * milhares. Qualquer valor nessa faixa separa os dois casos, e o mais alto
 * reduz o risco de trancar gente de rede compartilhada.
 */
const limiteLogin = limitarRequisicoes({
  janelaMs: 10 * 60 * 1000,
  maximo: 30,
  mensagem: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente de novo.',
});

/**
 * Cadastro. O abuso aqui não é adivinhar senha, é criar contas em massa.
 *
 * Mais restrito que o login porque ninguém se cadastra dez vezes sem querer,
 * enquanto errar a senha várias vezes é comum.
 */
const limiteCadastro = limitarRequisicoes({
  janelaMs: 10 * 60 * 1000,
  maximo: 10,
  mensagem: 'Muitas contas criadas a partir deste acesso. Aguarde alguns minutos.',
});

/**
 * Conferência de código.
 *
 * A defesa principal contra chute já está no serviço: cinco tentativas
 * erradas invalidam o código. Este limite cobre o atacante que pede código
 * novo para renovar as tentativas.
 */
const limiteVerificacao = limitarRequisicoes({
  janelaMs: 10 * 60 * 1000,
  maximo: 30,
  mensagem: 'Muitas tentativas de verificação. Aguarde alguns minutos.',
});

/**
 * Rotas que disparam envio de e-mail.
 *
 * Já existe um limite por usuário (60 segundos entre códigos), mas ele só
 * vale depois de identificar a conta. Este cobre o passo anterior: alguém
 * varrendo endereços para descobrir quais têm cadastro, ou tentando esgotar
 * a cota do provedor de e-mail.
 */
const limiteEnvioDeEmail = limitarRequisicoes({
  janelaMs: 10 * 60 * 1000,
  maximo: 10,
  mensagem: 'Muitos pedidos de código. Aguarde alguns minutos.',
});

/**
 * Teto geral da API.
 *
 * Não é defesa contra ataque dedicado — é rede de segurança contra cliente
 * em laço infinito e contra varredura automatizada. O valor comporta uma
 * sessão de navegação intensa com folga.
 */
const limiteGeral = limitarRequisicoes({
  janelaMs: 10 * 60 * 1000,
  maximo: 600,
  mensagem: 'Muitas requisições. Aguarde um instante.',
});

module.exports = {
  limitarRequisicoes,
  limiteLogin,
  limiteCadastro,
  limiteVerificacao,
  limiteEnvioDeEmail,
  limiteGeral,
};
