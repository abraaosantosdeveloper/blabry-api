/**
 * Representa uma publicação da tabela `post`.
 *
 * `autorId` fica fora do JSON: o cliente identifica o autor pelo @, e expor
 * o UUID de outro usuário não serve a nada na interface. Ele existe aqui
 * porque é o que decide a autorização de exclusão.
 */
class Post {
  constructor({
    id, texto, criadoEm, editadoEm,
    autorId, autorNome, autorAlias, autorFotoUrl,
    curtidas = 0, comentarios = 0, curtido = false,
  }) {
    this.id = id;
    this.texto = texto;
    this.criadoEm = criadoEm;
    // Preenchido apenas se a publicação já foi editada.
    this.editadoEm = editadoEm ?? null;
    this.curtidas = curtidas;
    this.comentarios = comentarios;
    this.curtido = curtido;

    this.autor = {
      nome: autorNome,
      alias: autorAlias,
      fotoUrl: autorFotoUrl ?? null,
    };

    Object.defineProperty(this, 'autorId', {
      value: autorId,
      enumerable: false,
      writable: false,
    });
  }

  /** Cria um Post a partir de uma linha do MySQL já com JOIN em `user`. */
  static deLinha(linha) {
    return new Post({
      id: linha.id,
      texto: linha.content,
      criadoEm: linha.created_at,
      editadoEm: linha.edited_at,
      autorId: linha.user_id,
      autorNome: linha.full_name,
      autorAlias: linha.alias,
      autorFotoUrl: linha.pic_url,
      curtidas: Number(linha.curtidas ?? 0),
      comentarios: Number(linha.comentarios ?? 0),
      curtido: Boolean(linha.curtido),
    });
  }

  /** Linha pronta para o INSERT, com os nomes de coluna do banco. */
  paraLinha() {
    return {
      id: this.id,
      user_id: this.autorId,
      content: this.texto,
    };
  }

  /** Regra de autoria: só o dono pode excluir. */
  pertenceA(usuarioId) {
    return Boolean(usuarioId) && this.autorId === usuarioId;
  }

  /** Define o que a API expõe. Chamado automaticamente por res.json(). */
  toJSON() {
    return {
      id: this.id,
      texto: this.texto,
      criadoEm: this.criadoEm,
      editadoEm: this.editadoEm,
      autor: this.autor,
      curtidas: this.curtidas,
      comentarios: this.comentarios,
      curtido: this.curtido,
    };
  }
}

module.exports = Post;