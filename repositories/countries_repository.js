const Country = require('../models/country');

class CountriesRepository {
  /**
   * @param {import('mysql2/promise').Pool} pool conexão injetada por quem instancia
   */
  constructor(pool) {
    this.pool = pool;
  }

  /** Verifica se um código ISO existe na tabela. */
  async existe(codigo) {
    const [rows] = await this.pool.execute(
      'SELECT 1 FROM countries WHERE country = ? LIMIT 1',
      [codigo]
    );
    return rows.length > 0;
  }

  /** Lista todos os países cadastrados, em ordem alfabética. */
  async listarPaises() {
    const [rows] = await this.pool.query(
      'SELECT country, name FROM countries ORDER BY name COLLATE utf8mb4_unicode_ci'
    );
    return rows.map(Country.deLinha);
  }
}

module.exports = CountriesRepository;
