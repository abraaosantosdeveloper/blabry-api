const Country = require('../models/country');

class CountriesRepository {
  /**
   * @param {import('mysql2/promise').Pool} pool conexão injetada por quem instancia
   */
  constructor(pool) {
    this.pool = pool;
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
