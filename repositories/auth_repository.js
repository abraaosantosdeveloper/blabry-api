const pool = require('../database');

async function buscarPorEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, full_name, username, email, password FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function criarUsuario({ nome, apelido, email, senha }) {
  const [result] = await pool.execute(
    'INSERT INTO users (full_name, username, email, password) VALUES (?, ?, ?, ?)',
    [nome, apelido, email, senha]
  );
  return result.insertId;
}

module.exports = { buscarPorEmail, criarUsuario };