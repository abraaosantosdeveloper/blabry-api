const pool = require('../database');

async function buscarPorEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, full_name, alias, email, password_hash, nationality, birth_date FROM user WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function criarUsuario({ id, nome, apelido, email, senha, nacionalidade, nascimento }) {
  await pool.execute(
    'INSERT INTO user (id, full_name, alias, email, password_hash, nationality, birth_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, nome, apelido, email, senha, nacionalidade, nascimento]
  );
  return id;
}

module.exports = { buscarPorEmail, criarUsuario };