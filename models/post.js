/**
 * Representa uma publicação da tabela `post`.
 *
 * `authorId` fica fora do JSON: o cliente identifica o autor pelo @, e expor
 * o UUID de outro usuário não serve a nada na interface. Ele existe aqui
 * porque é o que decide a autorização de exclusão.
 */
class Post {
  constructor({
    id, text, createdAt, editedAt,
    authorId, authorName, authorAlias, authorPhotoUrl, authorBio,
    likes = 0, comments = 0, liked = false,
  }) {
    this.id = id;
    this.text = text;
    this.createdAt = createdAt;
    // Preenchido apenas se a publicação já foi editada.
    this.editedAt = editedAt ?? null;
    this.likes = likes;
    this.comments = comments;
    this.liked = liked;

    this.author = {
      name: authorName,
      alias: authorAlias,
      photoUrl: authorPhotoUrl ?? null,
      /* A bio acompanha o autor porque a página dedicada da publicação a
         exibe: quem abre um link de post vindo de fora costuma não conhecer
         quem escreveu. É dado público — o mesmo que o perfil já mostra a
         qualquer visitante —, então não amplia nada do que já é visível. */
      bio: authorBio ?? null,
    };

    Object.defineProperty(this, 'authorId', {
      value: authorId,
      enumerable: false,
      writable: false,
    });
  }

  /** Cria um Post a partir de uma linha do MySQL já com JOIN em `user`. */
  static fromRow(row) {
    return new Post({
      id: row.id,
      text: row.content,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      authorId: row.user_id,
      authorName: row.full_name,
      authorAlias: row.alias,
      authorPhotoUrl: row.pic_url,
      authorBio: row.bio,
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      liked: Boolean(row.liked),
    });
  }

  /** Linha pronta para o INSERT, com os nomes de coluna do banco. */
  toRow() {
    return {
      id: this.id,
      user_id: this.authorId,
      content: this.text,
    };
  }

  /** Regra de autoria: só o dono pode excluir. */
  belongsTo(userId) {
    return Boolean(userId) && this.authorId === userId;
  }

  /** Define o que a API expõe. Chamado automaticamente por res.json(). */
  toJSON() {
    return {
      id: this.id,
      text: this.text,
      createdAt: this.createdAt,
      editedAt: this.editedAt,
      author: this.author,
      likes: this.likes,
      comments: this.comments,
      liked: this.liked,
    };
  }
}

module.exports = Post;
