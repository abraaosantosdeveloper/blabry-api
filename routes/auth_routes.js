const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth_controller');

/**
 * @swagger
 * /auth/cadastro:
 *   post:
 *     tags: [Autenticação]
 *     summary: Cria uma nova conta
 *     description: |
 *       Cadastra o usuário e já devolve um token JWT, dispensando um segundo
 *       request de login. A senha é gravada como hash bcrypt (12 salt rounds)
 *       e o `id` é gerado como UUID v7.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, apelido, email, senha, nascimento, nacionalidade]
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Abraão Santos
 *               apelido:
 *                 type: string
 *                 description: "@ do usuário — 3 a 20 caracteres: minúsculas, números ou _"
 *                 example: abraao_dev
 *               email:
 *                 type: string
 *                 format: email
 *                 example: abraao@exemplo.com
 *               senha:
 *                 type: string
 *                 format: password
 *                 description: Mínimo de 8 caracteres, uma maiúscula e um caractere especial
 *                 example: SenhaForte#1
 *               nascimento:
 *                 type: string
 *                 format: date
 *                 example: '2000-05-14'
 *               nacionalidade:
 *                 type: string
 *                 description: Código ISO alpha-3 existente em `GET /countries`
 *                 example: BRA
 *     responses:
 *       201:
 *         description: Conta criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespostaAutenticacao' }
 *       400:
 *         description: Campos obrigatórios ausentes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       409:
 *         description: Email ou @ já cadastrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.post('/cadastro', authController.cadastrarUsuario);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Autenticação]
 *     summary: Autentica um usuário
 *     description: |
 *       Valida as credenciais e devolve um JWT válido por 24h. O campo `email`
 *       aceita tanto o email quanto o @ do usuário — o formato é detectado
 *       automaticamente.
 *
 *       Em caso de falha a mensagem é sempre genérica — a API não revela se o
 *       email existe.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email ou @ do usuário
 *                 example: abraao@exemplo.com
 *               senha:
 *                 type: string
 *                 format: password
 *                 example: SenhaForte#1
 *     responses:
 *       200:
 *         description: Autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespostaAutenticacao' }
 *       400:
 *         description: Campos obrigatórios ausentes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Autenticação]
 *     summary: Encerra a sessão
 *     description: |
 *       Como a autenticação é stateless (JWT), o servidor não mantém sessão a
 *       invalidar — o descarte do token acontece no cliente. A rota existe para
 *       dar um ponto único de encerramento ao frontend.
 *     security: []
 *     responses:
 *       200:
 *         description: Sessão encerrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 */
router.post('/logout', authController.logout);

module.exports = router;
