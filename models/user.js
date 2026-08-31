const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/**
 * Representa um usuário da tabela `user`.
 *
 * O hash da senha é guardado como propriedade NÃO enumerável: ele não aparece
 * em JSON.stringify, nem em spread ({...user}), nem em console.log.
 * Só é alcançável por quem pedir explicitamente por `user.passwordHash`.
 */

/** Data de calendário no formato YYYY-MM-DD, sem conversão de fuso. */
const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);

  const d = new Date(value);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

class User {
  constructor({
    id, name, alias, email, passwordHash,
    nationality, birthDate, bio = null, photoUrl = null,
    createdAt = null, deletedAt = null, emailVerifiedAt = null,
  }) {
    this.id = id;
    this.name = name;
    this.alias = alias;
    this.email = email;
    this.nationality = nationality;
    this.birthDate = birthDate;
    this.photoUrl = photoUrl;
    this.createdAt = createdAt;
    this.deletedAt = deletedAt;
    /* Quando o e-mail foi confirmado. NULL significa "ainda não", e o login
       é recusado nesse estado — daí a propriedade viver no modelo e não em
       uma consulta avulsa do serviço. */
    this.emailVerifiedAt = emailVerifiedAt;
    this.bio = bio;

    Object.defineProperty(this, 'passwordHash', {
      value: passwordHash,
      enumerable: false,
      writable: true,
    });
  }

  /** Cria um User a partir de uma linha crua do MySQL (colunas em snake_case). */
  static fromRow(row) {
    return new User({
      id: row.id,
      name: row.full_name,
      alias: row.alias,
      email: row.email,
      passwordHash: row.password_hash,
      nationality: row.nationality,
      birthDate: row.birth_date,
      photoUrl: row.pic_url,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      emailVerifiedAt: row.email_verified_at,
      bio: row.bio,
    });
  }

  /** Gera o hash da senha em texto puro. Usado no cadastro e na troca de senha. */
  static async hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /** Compara uma senha em texto puro com o hash guardado. */
  async verifyPassword(password) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(password, this.passwordHash);
  }

  /**
   * A conta já teve o e-mail confirmado?
   *
   * É um getter, e não um campo booleano guardado, porque deriva de um dado
   * que já existe: manter os dois lado a lado abriria espaço para eles
   * discordarem.
   */
  get emailVerified() {
    return this.emailVerifiedAt !== null && this.emailVerifiedAt !== undefined;
  }

  /** Conta desativada por soft delete. */
  get isDeleted() {
    return this.deletedAt !== null;
  }

  /** Linha pronta para o INSERT, com os nomes de coluna do banco. */
  toRow() {
    return {
      id: this.id,
      full_name: this.name,
      alias: this.alias,
      email: this.email,
      password_hash: this.passwordHash,
      nationality: this.nationality,
      birth_date: this.birthDate,
    };
  }

  /**
   * Forma pública do perfil.
   *
   * @param {boolean} own o visitante é o dono do perfil
   */
  toProfile({ own = false, followers = 0, following = 0, isFollowing = null, followsYou = null } = {}) {
    return {
      name: this.name,
      alias: this.alias,
      photoUrl: this.photoUrl,
      bio: this.bio,
      // Dados pessoais só existem no próprio perfil. Nacionalidade entrou
      // nesse grupo: combinada a nome e foto, ela contribui para identificar
      // uma pessoa, e não é informação que o visitante precise para decidir
      // seguir alguém. O perfil público expõe apenas a apresentação.
      email: own ? this.email : null,
      birthDate: own ? dateOnly(this.birthDate) : null,
      nationality: own ? this.nationality : null,
      followers,
      following,
      memberSince: this.createdAt ? new Date(this.createdAt).getFullYear() : null,
      isFollowing: own ? null : isFollowing,
      // Se o dono do perfil segue quem está visitando. Null no próprio
      // perfil, onde a pergunta não faz sentido.
      followsYou: own ? null : followsYou,
    };
  }

  /** Define o que a API expõe. Chamado automaticamente por res.json(). */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      // `alias` e não `apelido`: antes este método expunha `apelido` enquanto
      // o perfil expunha `alias`, dois nomes para o mesmo dado dependendo do
      // endpoint. Agora é um só.
      alias: this.alias,
      email: this.email,
      photoUrl: this.photoUrl,
    };
  }
}

module.exports = User;
