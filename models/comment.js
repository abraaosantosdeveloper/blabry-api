/** Comentário de uma publicação. Mesmo desenho do Post, em escala menor. */
class Comment {
  constructor({
    id, texto, criadoEm, editadoEm, postId,
    autorId, autorNome, autorAlias, autorFotoUrl
  }) {
    this.id = id;
    this.texto = texto;
    this.criadoEm = criadoEm;
    this.editadoEm = editadoEm ?? null;

    this.autor = {
      nome: autorNome,
      alias: autorAlias,
      fotoUrl: autorFotoUrl ?? null,
    };

    Object.defineProperty(this, 'autorId', { value: autorId, enumerable: false });
    Object.defineProperty(this, 'postId', { value: postId, enumerable: false });
  }

  static deLinha(linha) {
    return new Comment({
      id: linha.id,
      texto: linha.content,
      criadoEm: linha.created_at,
      postId: linha.post_id,
      autorId: linha.user_id,
      autorNome: linha.full_name,
      autorAlias: linha.alias,
      autorFotoUrl: linha.pic_url,
      editadoEm: linha.edited_at,
    });
  }

  paraLinha() {
    return { id: this.id, post_id: this.postId, user_id: this.autorId, content: this.texto };
  }

  pertenceA(usuarioId) {
    return Boolean(usuarioId) && this.autorId === usuarioId;
  }

  toJSON() {
    return {
      id: this.id,
      texto: this.texto,
      criadoEm: this.criadoEm,
      autor: this.autor,
      editadoEm: this.editadoEm,
    };
  }
}

module.exports = Comment;