const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth_controller');

/**
 * @swagger
 * /auth/signup:
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
 *             required: [nome, apelido, email, senha, nascimento, nacionalidade, aceitouPolitica]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Abraão Santos
 *               alias:
 *                 type: string
 *                 description: "@ do usuário — 3 a 20 caracteres: minúsculas, números ou _"
 *                 example: abraao_dev
 *               email:
 *                 type: string
 *                 format: email
 *                 example: abraao@exemplo.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mínimo de 8 caracteres, uma maiúscula e um caractere especial
 *                 example: SenhaForte#1
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: '2000-05-14'
 *               nationality:
 *                 type: string
 *                 description: Código ISO alpha-3 existente em `GET /countries`
 *                 example: BRA
 *               acceptedPolicy:
 *                 type: boolean
 *                 enum: [true]
 *                 description: |
 *                   Aceite da política de privacidade. Deve ser o booleano
 *                   `true` — a comparação é estrita, então a string "true" é
 *                   recusada. A interface já bloqueia o envio sem o aceite;
 *                   esta validação cobre chamadas feitas fora dela.
 *                 example: true
 *     responses:
 *       201:
 *         description: |
 *           Conta criada, aguardando confirmação do e-mail.
 *
 *           **Não devolve token.** A conta nasce com `email_verified_at`
 *           nulo e o login é recusado com 403 até a confirmação. Um código
 *           de 6 dígitos é enviado ao e-mail informado; use
 *           `POST /auth/verify-email` para ativá-la.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/PublicUser' }
 *                 verificationPending: { type: boolean, example: true }
 *       400:
 *         description: Campos obrigatórios ausentes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Email ou @ já cadastrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/signup', authController.signUp);

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
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SenhaForte#1
 *     responses:
 *       200:
 *         description: Autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       400:
 *         description: Campos obrigatórios ausentes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: |
 *           E-mail ainda não confirmado. A verificação da senha acontece
 *           **antes** desta checagem: sem isso, bastaria digitar um e-mail
 *           qualquer para descobrir se ele tem conta aqui.
 *
 *           O status distingue "não sabemos quem é você" (401) de "sabemos,
 *           mas falta um passo" (403), permitindo à interface levar o
 *           usuário à tela de código em vez de dizer "senha errada".
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /auth/verify-email/resend:
 *   post:
 *     tags: [Autenticação]
 *     summary: Reenvia o código de confirmação de e-mail
 *     description: |
 *       Responde 200 mesmo quando o e-mail não tem conta ou já está
 *       confirmado. A resposta uniforme é deliberada: uma resposta diferente
 *       por caso transformaria a rota em um verificador de quem tem conta
 *       aqui — informação que não é nossa para distribuir.
 *
 *       Há intervalo mínimo de 60 segundos entre dois pedidos, para impedir
 *       que a caixa de entrada de alguém seja usada como alvo de spam.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: abraao@exemplo.com }
 *     responses:
 *       200:
 *         description: Pedido registrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       429:
 *         description: Novo código pedido cedo demais
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/verify-email/resend', authController.resendSignupCode);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Autenticação]
 *     summary: Confirma o e-mail e ativa a conta
 *     description: |
 *       Devolve o token: a confirmação é o último passo do cadastro, e pedir
 *       login logo depois de digitar um código seria um obstáculo sem função
 *       de segurança — o usuário acabou de provar que tem o e-mail.
 *
 *       O código vale 15 minutos, serve uma única vez e tolera 5 tentativas
 *       erradas. Ele é guardado como hash: um vazamento da tabela não
 *       entrega acesso a conta alguma.
 *
 *       As falhas — código errado, expirado, já usado ou sem tentativas —
 *       compartilham a mesma mensagem. Detalhar qual delas é diria a um
 *       atacante se vale a pena continuar.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, codigo]
 *             properties:
 *               email: { type: string, format: email, example: abraao@exemplo.com }
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: '048213'
 *     responses:
 *       200:
 *         description: E-mail confirmado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       400:
 *         description: Código inválido ou expirado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/verify-email', authController.confirmEmail);

/**
 * @swagger
 * /auth/password/code:
 *   post:
 *     tags: [Autenticação]
 *     summary: Envia o código para troca de senha
 *     description: |
 *       Resposta uniforme para e-mail existente ou não, pelo mesmo motivo do
 *       reenvio de confirmação.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: abraao@exemplo.com }
 *     responses:
 *       200:
 *         description: Pedido registrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       429:
 *         description: Novo código pedido cedo demais
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/password/code', authController.requestPasswordReset);

/**
 * @swagger
 * /auth/password:
 *   post:
 *     tags: [Autenticação]
 *     summary: Define uma nova senha mediante código
 *     description: |
 *       A regra de força da senha é validada aqui, e não só na interface.
 *
 *       Trocar a senha também confirma o e-mail: o usuário acabou de provar
 *       que tem acesso a ele, e exigir a mesma prova duas vezes não
 *       acrescenta segurança.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, codigo, novaSenha]
 *             properties:
 *               email: { type: string, format: email, example: abraao@exemplo.com }
 *               code: { type: string, pattern: '^[0-9]{6}$', example: '048213' }
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Mínimo 8 caracteres, uma maiúscula e um caractere especial
 *                 example: NovaSenha#1
 *     responses:
 *       200:
 *         description: Senha alterada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Código inválido, expirado, ou senha fraca
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/password', authController.resetPassword);

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
