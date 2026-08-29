const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Blabry API',
      version: require('../package.json').version,
      description:
        'API da plataforma Blabry — autenticação, feed de publicações e chat em tempo real.',
    },
    servers: [
      { url: 'http://localhost:' + (process.env.PORT || 3000), description: 'Local' },
      { url: process.env.API_URL || 'https://blabry-api.up.railway.app', description: 'Produção' },
    ],
    tags: [
      { name: 'Autenticação', description: 'Cadastro, login e logout' },
      { name: 'Países', description: 'Lista de nacionalidades disponíveis' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token devolvido por /auth/login ou /auth/cadastro. Validade de 24h.',
        },
      },
      schemas: {
        Country: {
          type: 'object',
          properties: {
            country: { type: 'string', example: 'BRA', description: 'Código ISO 3166-1 alpha-3' },
            name: { type: 'string', example: 'Brasil' },
          },
        },
        UsuarioPublico: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90' },
            nome: { type: 'string', example: 'Abraão Santos' },
            apelido: { type: 'string', example: 'abraao_dev' },
            email: { type: 'string', format: 'email', example: 'abraao@exemplo.com' },
            fotoUrl: { type: 'string', nullable: true, example: null },
          },
        },
        RespostaAutenticacao: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT válido por 24h' },
            usuario: { $ref: '#/components/schemas/UsuarioPublico' },
          },
        },
        Erro: {
          type: 'object',
          properties: {
            erro: { type: 'string', example: 'Credenciais inválidas' },
          },
        },
      },
      responses: {
        NaoAutorizado: {
          description: 'Token ausente ou inválido',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
        },
        ErroInterno: {
          description: 'Erro interno do servidor',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
        },
      },
    },
    // Padrão: toda rota exige JWT. As públicas sobrescrevem com `security: []`.
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);
