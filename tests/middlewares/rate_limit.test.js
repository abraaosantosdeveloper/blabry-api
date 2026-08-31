const { limitarRequisicoes } = require('../../middlewares/rate_limit');

/** Requisição mínima: o limitador só olha o IP. */
const req = (ip) => ({ ip });
const res = { set() {} };

/** Executa o middleware e devolve o erro, ou null se passou. */
function passar(mw, ip) {
  let capturado = null;
  mw(req(ip), res, (err) => { capturado = err ?? null; });
  return capturado;
}

describe('limitarRequisicoes', () => {
  /* Dado: um limite de 3 requisições por janela;
     Quando: chegam 3;
     Então: todas passam. */
  it('deixa passar até o limite', () => {
    const mw = limitarRequisicoes({ janelaMs: 60000, maximo: 3 });
    expect([1, 2, 3].map(() => passar(mw, '1.1.1.1'))).toEqual([null, null, null]);
  });

  /* Dado: o limite já atingido;
     Quando: chega mais uma;
     Então: 429 — e não 400 nem 403. O status existe para dizer
     "você está certo, só está indo rápido demais". */
  it('recusa com 429 ao estourar', () => {
    const mw = limitarRequisicoes({ janelaMs: 60000, maximo: 2 });
    passar(mw, '1.1.1.1');
    passar(mw, '1.1.1.1');
    const erro = passar(mw, '1.1.1.1');

    expect(erro).not.toBeNull();
    expect(erro.status).toBe(429);
  });

  /* Dado: um IP que estourou o limite;
     Quando: outro IP faz a primeira requisição;
     Então: ele passa. Cada cliente tem o próprio balde — sem isso, um
     visitante abusivo derrubaria o acesso de todos os outros. */
  it('conta cada IP separadamente', () => {
    const mw = limitarRequisicoes({ janelaMs: 60000, maximo: 1 });
    passar(mw, '1.1.1.1');
    expect(passar(mw, '1.1.1.1')).not.toBeNull();
    expect(passar(mw, '2.2.2.2')).toBeNull();
  });

  /* Dado: a janela vencida;
     Quando: chega uma nova requisição;
     Então: o contador recomeça. */
  it('reabre o crédito quando a janela vence', async () => {
    const mw = limitarRequisicoes({ janelaMs: 30, maximo: 1 });
    passar(mw, '1.1.1.1');
    expect(passar(mw, '1.1.1.1')).not.toBeNull();

    await new Promise((r) => setTimeout(r, 50));
    expect(passar(mw, '1.1.1.1')).toBeNull();
  });

  /* Dado: uma requisição recusada;
     Quando: a resposta é montada;
     Então: ela traz Retry-After, para o cliente saber quando voltar. */
  it('informa Retry-After ao recusar', () => {
    const mw = limitarRequisicoes({ janelaMs: 60000, maximo: 1 });
    const enviados = {};
    const resposta = { set(k, v) { enviados[k] = v; } };

    mw(req('1.1.1.1'), resposta, () => {});
    mw(req('1.1.1.1'), resposta, () => {});

    expect(Number(enviados['Retry-After'])).toBeGreaterThan(0);
  });

  /* Dado: um limitador com chave própria (por exemplo, por usuário);
     Quando: requisições chegam com chaves diferentes;
     Então: cada chave tem o próprio balde. */
  it('aceita uma função de chave personalizada', () => {
    const mw = limitarRequisicoes({ janelaMs: 60000, maximo: 1, chave: (r) => r.userId });

    let primeira = null;
    mw({ userId: 'a' }, res, (e) => { primeira = e ?? null; });
    expect(primeira).toBeNull();

    let segunda = null;
    mw({ userId: 'a' }, res, (e) => { segunda = e ?? null; });
    expect(segunda?.status).toBe(429);

    let outra = null;
    mw({ userId: 'b' }, res, (e) => { outra = e ?? null; });
    expect(outra).toBeNull();
  });
});
