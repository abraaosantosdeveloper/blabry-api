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
        PublicUser: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '01927d4e-8f3a-7c21-9b44-2f8a1c6d5e90' },
            name: { type: 'string', example: 'Abraão Santos' },
            alias: { type: 'string', example: 'abraao_dev' },
            email: { type: 'string', format: 'email', example: 'abraao@exemplo.com' },
            photoUrl: { type: 'string', nullable: true, example: null },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT válido por 24h' },
            user: { $ref: '#/components/schemas/PublicUser' },
          },
        },
        Author: {
          type: 'object',
          description: 'Identificação resumida de quem publicou.',
          properties: {
            name: { type: 'string', example: 'Abraão Santos' },
            alias: { type: 'string', example: 'abraao_dev' },
            photoUrl: { type: 'string', nullable: true, example: null },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            text: { type: 'string', maxLength: 280, example: 'Primeiro blab!' },
            createdAt: { type: 'string', format: 'date-time' },
            editedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description:
                'Preenchido quando o autor editou a publicação dentro da janela ' +
                'de 15 minutos. A interface a marca como editada.',
            },
            author: { $ref: '#/components/schemas/Author' },
            likes: { type: 'integer', description: 'COUNT em like_post', example: 12 },
            comments: { type: 'integer', description: 'COUNT em comment', example: 3 },
            liked: { type: 'boolean', description: 'Se o usuário do token curtiu', example: false },
          },
        },
        Comment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            text: { type: 'string', maxLength: 280 },
            createdAt: { type: 'string', format: 'date-time' },
            editedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description:
                'Preenchido quando o autor editou o comentário dentro da janela ' +
                'de 15 minutos. A interface marca o comentário como editado.',
            },
            author: { $ref: '#/components/schemas/Author' },
          },
        },
        Like: {
          type: 'object',
          description: 'Estado da curtida depois da operação, recontado no banco.',
          properties: {
            likes: { type: 'integer', example: 13 },
            liked: { type: 'boolean', example: true },
          },
        },
        Profile: {
          type: 'object',
          description:
            'Perfil de usuário. `email`, `nascimento` e `nacionalidade` são dados ' +
            'pessoais e só vêm preenchidos em /users/me; no perfil público vêm como ' +
            'null. Os demais campos formam a apresentação e são sempre visíveis.',
          properties: {
            name: { type: 'string', example: 'John Doe' },
            alias: { type: 'string', example: 'John.Doe2026' },
            photoUrl: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true, maxLength: 280 },
            email: {
              type: 'string',
              format: 'email',
              nullable: true,
              description: 'Apenas no próprio perfil; null no perfil público.',
            },
            birthDate: { type: 'string', format: 'date', nullable: true, description: 'Apenas no próprio perfil.' },
            nationality: {
              type: 'string',
              nullable: true,
              example: 'BRA',
              description: 'Apenas no próprio perfil.',
            },
            following: { type: 'integer', example: 159 },
            followers: { type: 'integer', example: 2500 },
            memberSince: { type: 'integer', example: 2026 },
            isFollowing: {
              type: 'boolean',
              nullable: true,
              description: 'Se o usuário do token segue este perfil. Null no próprio perfil.',
            },
            followsYou: {
              type: 'boolean',
              nullable: true,
              description:
                'Se o dono deste perfil segue o usuário do token — a direção oposta ' +
                'de seguindoEste. Null no próprio perfil.',
            },
          },
        },
        Follow: {
          type: 'object',
          properties: {
            following: { type: 'boolean', example: true },
            followers: { type: 'integer', example: 2501 },
          },
        },
        Pagination: {
          type: 'object',
          description:
            'Campos de paginação presentes em toda listagem. O cliente usa `totalPaginas` ' +
            'para habilitar os controles de navegação.',
          properties: {
            page: { type: 'integer', minimum: 1, example: 1 },
            totalPages: { type: 'integer', example: 4 },
            total: { type: 'integer', description: 'Total de registros', example: 37 },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Credenciais inválidas' },
          },
        },
      },
      parameters: {
        PageParam: {
          name: 'pagina',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Página desejada, começando em 1.',
        },
        LimitParam: {
          name: 'limite',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          description: 'Registros por página. Valores acima do máximo são reduzidos ao teto.',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Token ausente ou inválido',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'Recurso não encontrado',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        InternalError: {
          description: 'Erro interno do servidor',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    // Padrão: toda rota exige JWT. As públicas sobrescrevem com `security: []`.
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);
