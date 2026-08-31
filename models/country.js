/**
 * Representa um país da tabela `countries`.
 * Existe para que o formato devolvido pela API seja definido em um lugar só.
 */
class Country {
  constructor({ country, name }) {
    this.country = country; // código ISO 3166-1 alpha-3 — ex.: 'BRA'
    this.name = name;       // nome em português — ex.: 'Brasil'
  }

  /** Cria um Country a partir de uma linha crua do MySQL. */
  static fromRow(row) {
    return new Country({ country: row.country, name: row.name });
  }

  /** Chamado automaticamente pelo res.json(). Define o que a API expõe. */
  toJSON() {
    return { country: this.country, name: this.name };
  }
}

module.exports = Country;
