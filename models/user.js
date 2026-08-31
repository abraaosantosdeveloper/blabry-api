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
    criadoEm = null, excluidoEm = null, emailVerificadoEm = null,
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
    /* Quando o e-mail foi confirmado. NULL significa "ainda não", e o login
       é recusado nesse estado — daí a propriedade viver no modelo e não em
       uma consulta avulsa do serviço. */
    this.emailVerificadoEm = emailVerificadoEm;
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
      emailVerificadoEm: linha.email_verified_at,
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

  /**
   * A conta já teve o e-mail confirmado?
   *
   * É um getter, e não um campo booleano guardado, porque deriva de um dado
   * que já existe: manter os dois lado a lado abriria espaço para eles
   * discordarem.
   */
  get emailVerificado() {
    return this.emailVerificadoEm !== null && this.emailVerificadoEm !== undefined;
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

  paraPerfil({proprio=false, seguidores=0, seguindo=0, seguindoEste=null, teSegue=null} = {}){
    return {
      nome: this.nome,
      alias: this.apelido,
      fotoUrl: this.fotoUrl,
      bio: this.bio,
      // Dados pessoais só existem no próprio perfil. Nacionalidade entrou
      // nesse grupo: combinada a nome e foto, ela contribui para identificar
      // uma pessoa, e não é informação que o visitante precise para decidir
      // seguir alguém. O perfil público expõe apenas a apresentação.
      email: proprio ? this.email : null,
      nascimento: proprio ? soData(this.nascimento) : null,
      nacionalidade: proprio ? this.nacionalidade : null,
      seguidores,
      seguindo,
      desde: this.criadoEm ? new Date(this.criadoEm).getFullYear() : null,
      seguindoEste: proprio ? null : seguindoEste,
      // Se o dono do perfil segue quem está visitando. Null no próprio
      // perfil, onde a pergunta não faz sentido.
      teSegue: proprio ? null : teSegue,
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
