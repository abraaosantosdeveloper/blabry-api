/** Comentário de uma publicação. Mesmo desenho do Post, em escala menor. */
class Comment {
  constructor({
    id, text, createdAt, editedAt, postId,
    authorId, authorName, authorAlias, authorPhotoUrl,
  }) {
    this.id = id;
    this.text = text;
    this.createdAt = createdAt;
    this.editedAt = editedAt ?? null;

    this.author = {
      name: authorName,
      alias: authorAlias,
      photoUrl: authorPhotoUrl ?? null,
    };

    // Fora do JSON: são identificadores internos, usados para autorização.
    Object.defineProperty(this, 'authorId', { value: authorId, enumerable: false });
    Object.defineProperty(this, 'postId', { value: postId, enumerable: false });
  }

  static fromRow(row) {
    return new Comment({
      id: row.id,
      text: row.content,
      createdAt: row.created_at,
      postId: row.post_id,
      authorId: row.user_id,
      authorName: row.full_name,
      authorAlias: row.alias,
      authorPhotoUrl: row.pic_url,
      editedAt: row.edited_at,
    });
  }

  toRow() {
    return { id: this.id, post_id: this.postId, user_id: this.authorId, content: this.text };
  }

  belongsTo(userId) {
    return Boolean(userId) && this.authorId === userId;
  }

  toJSON() {
    return {
      id: this.id,
      text: this.text,
      createdAt: this.createdAt,
      author: this.author,
      editedAt: this.editedAt,
    };
  }
}

module.exports = Comment;
