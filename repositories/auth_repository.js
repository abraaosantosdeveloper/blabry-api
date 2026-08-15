const pool = require('../database');

async function buscarPorEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, full_name, alias, email, password_hash, nationality, birth_date FROM user WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function criarUsuario({ nome, apelido, email, senha, nacionalidade, nascimento }) {
  const [result] = await pool.execute(
    'INSERT INTO user (full_name, alias, email, password_hash, nationality, birth_date) VALUES (?, ?, ?, ?, ?, ?)',
    [nome, apelido, email, senha, nacionalidade, nascimento]
  );
  return result.insertId;
}

module.exports = { buscarPorEmail, criarUsuario };