const pool = require('../database');

async function buscarPorEmail(email){

    const [rows] = await pool.execute(
        "SELECT * FROM users WHERE email = ?", [email]
    );

    return rows[0] || null;
}

async function criarUsuario({nome, apelido, email, senha}) {
    const [result] = await pool.execute(
        "INSERT into users(full_name, username, email, password) values(?, ?, ?, ?)", [nome, apelido, email, senha]
    );

    return result.insertId;
}

module.exports = {buscarPorEmail, criarUsuario}