const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/**
 * Representa um usuário da tabela `user`.
 *
 * O hash da senha é guardado como propriedade NÃO enumerável: ele não aparece
 * em JSON.stringify, nem em spread ({...usuario}), nem em console.log.
 * Só é alcançável por quem pedir explicitamente por `usuario.senhaHash`.
 */

/** Data de calendário no formato YYYY-MM-DD, sem conversão de fuso. */
const soData = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);

  const d = new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

class User {
  constructor({
    id, nome, apelido, email, senhaHash,
    nacionalidade, nascimento, bio = null,fotoUrl = null,
    criadoEm = null, excluidoEm = null,
  }) {
    this.id = id;
    this.nome = nome;
    this.apelido = apelido;
    this.email = email;
    this.nacionalidade = nacionalidade;
    this.nascimento = nascimento;
    this.fotoUrl = fotoUrl;
    this.criadoEm = criadoEm;
    this.excluidoEm = excluidoEm;
    this.bio = bio;

    Object.defineProperty(this, 'senhaHash', {
      value: senhaHash,
      enumerable: false,
      writable: true,
    });
  }

  /** Cria um User a partir de uma linha crua do MySQL (colunas em snake_case). */
  static deLinha(linha) {
    return new User({
      id: linha.id,
      nome: linha.full_name,
      apelido: linha.alias,
      email: linha.email,
      senhaHash: linha.password_hash,
      nacionalidade: linha.nationality,
      nascimento: linha.birth_date,
      fotoUrl: linha.pic_url,
      criadoEm: linha.created_at,
      excluidoEm: linha.deleted_at,
      bio: linha.bio,
    });
  }

  /** Gera o hash da senha em texto puro. Usado no cadastro e na troca de senha. */
  static async gerarHash(senha) {
    return bcrypt.hash(senha, SALT_ROUNDS);
  }

  /** Compara uma senha em texto puro com o hash guardado. */
  async verificarSenha(senha) {
    if (!this.senhaHash) return false;
    return bcrypt.compare(senha, this.senhaHash);
  }

  /** Conta desativada por soft delete. */
  get estaExcluido() {
    return this.excluidoEm !== null;
  }

  /** Linha pronta para o INSERT, com os nomes de coluna do banco. */
  paraLinha() {
    return {
      id: this.id,
      full_name: this.nome,
      alias: this.apelido,
      email: this.email,
      password_hash: this.senhaHash,
      nationality: this.nacionalidade,
      birth_date: this.nascimento,
    };
  }

  paraPerfil({proprio=false, seguidores=0, seguindo=0, seguindoEste=null} = {}){
    return {
      nome: this.nome,
      alias: this.apelido,
      fotoUrl: this.fotoUrl,
      bio: this.bio,
      nacionalidade: this.nacionalidade,
      email: proprio ? this.email : null,
      nascimento: proprio ? soData(this.nascimento) : null,
      seguidores,
      seguindo,
      desde: this.criadoEm ? new Date(this.criadoEm).getFullYear() : null,
      seguindoEste: proprio ? null : seguindoEste,
    };
  }

  /** Define o que a API expõe. Chamado automaticamente por res.json(). */
  toJSON() {
    return {
      id: this.id,
      nome: this.nome,
      apelido: this.apelido,
      email: this.email,
      fotoUrl: this.fotoUrl,
    };
  }
}

module.exports = User;
