class User{
    constructor({id, nome, apelido, email, senha}){
        this.id = id;
        this.nome = nome;
        this.apelido = apelido;
        this.email = email;
        this.senha = senha;
    }
}

module.exports = User