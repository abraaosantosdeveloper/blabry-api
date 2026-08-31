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
      { name: 'Usuários', description: 'Perfis, busca, foto e seguidores — rotas sob /users' },
      { name: 'Publicações', description: 'Feed, curtidas e comentários' },
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
        Autor: {
          type: 'object',
          description: 'Identificação resumida de quem publicou.',
          properties: {
            nome: { type: 'string', example: 'Abraão Santos' },
            alias: { type: 'string', example: 'abraao_dev' },
            fotoUrl: { type: 'string', nullable: true, example: null },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            texto: { type: 'string', maxLength: 280, example: 'Primeiro blab!' },
            criadoEm: { type: 'string', format: 'date-time' },
            editadoEm: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description:
                'Preenchido quando o autor editou a publicação dentro da janela ' +
                'de 15 minutos. A interface a marca como editada.',
            },
            autor: { $ref: '#/components/schemas/Autor' },
            curtidas: { type: 'integer', description: 'COUNT em like_post', example: 12 },
            comentarios: { type: 'integer', description: 'COUNT em comment', example: 3 },
            curtido: { type: 'boolean', description: 'Se o usuário do token curtiu', example: false },
          },
        },
        Comentario: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            texto: { type: 'string', maxLength: 280 },
            criadoEm: { type: 'string', format: 'date-time' },
            editadoEm: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description:
                'Preenchido quando o autor editou o comentário dentro da janela ' +
                'de 15 minutos. A interface marca o comentário como editado.',
            },
            autor: { $ref: '#/components/schemas/Autor' },
          },
        },
        Curtida: {
          type: 'object',
          description: 'Estado da curtida depois da operação, recontado no banco.',
          properties: {
            curtidas: { type: 'integer', example: 13 },
            curtido: { type: 'boolean', example: true },
          },
        },
        Perfil: {
          type: 'object',
          description:
            'Perfil de usuário. `email` e `nascimento` só são preenchidos em /usuarios/me — ' +
            'no perfil público vêm como null para não expor dados pessoais.',
          properties: {
            nome: { type: 'string', example: 'John Doe' },
            alias: { type: 'string', example: 'John.Doe2026' },
            fotoUrl: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true, maxLength: 280 },
            email: { type: 'string', format: 'email', nullable: true },
            nascimento: { type: 'string', format: 'date', nullable: true },
            nacionalidade: { type: 'string', nullable: true, example: 'BRA' },
            seguindo: { type: 'integer', example: 159 },
            seguidores: { type: 'integer', example: 2500 },
            desde: { type: 'integer', example: 2026 },
            seguindoEste: {
              type: 'boolean',
              nullable: true,
              description: 'Se o usuário do token segue este perfil. Null no próprio perfil.',
            },
          },
        },
        Seguir: {
          type: 'object',
          properties: {
            seguindo: { type: 'boolean', example: true },
            seguidores: { type: 'integer', example: 2501 },
          },
        },
        Paginacao: {
          type: 'object',
          description:
            'Campos de paginação presentes em toda listagem. O cliente usa `totalPaginas` ' +
            'para habilitar os controles de navegação.',
          properties: {
            pagina: { type: 'integer', minimum: 1, example: 1 },
            totalPaginas: { type: 'integer', example: 4 },
            total: { type: 'integer', description: 'Total de registros', example: 37 },
          },
        },
        Erro: {
          type: 'object',
          properties: {
            erro: { type: 'string', example: 'Credenciais inválidas' },
          },
        },
      },
      parameters: {
        Pagina: {
          name: 'pagina',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Página desejada, começando em 1.',
        },
        Limite: {
          name: 'limite',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          description: 'Registros por página. Valores acima do máximo são reduzidos ao teto.',
        },
      },
      responses: {
        NaoAutorizado: {
          description: 'Token ausente ou inválido',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
        },
        NaoEncontrado: {
          description: 'Recurso não encontrado',
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
