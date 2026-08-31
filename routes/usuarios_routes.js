const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios_controller');

const uploadUnico = require('../middlewares/upload');

/**
 * @swagger
 * /users/photo:
 *   post:
 *     tags: [Usuários]
 *     summary: Define a foto de perfil
 *     description: |
 *       Recebe uma imagem em `multipart/form-data` no campo `foto`, envia ao
 *       Cloudinary e grava a URL no perfil do usuário autenticado.
 *
 *       Limites aplicados antes do envio ao serviço externo: 5 MB por arquivo,
 *       um arquivo por requisição, e apenas JPEG, PNG ou WebP.
 *
 *       A imagem é normalizada para 512×512 pelo Cloudinary — o recorte feito
 *       no cliente é conveniência, não garantia.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [foto]
 *             properties:
 *               foto:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Foto atualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fotoUrl:
 *                   type: string
 *                   example: https://res.cloudinary.com/demo/image/upload/v1/blabry/perfis/uuid.jpg
 *       400:
 *         description: Nenhuma imagem enviada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       413:
 *         description: Imagem acima do limite de 5 MB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       415:
 *         description: Formato não suportado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       502:
 *         description: Falha no serviço de imagens
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
router.post('/photo', uploadUnico('foto'), usuariosController.atualizarFoto);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     tags: [Usuários]
 *     summary: Atualiza campos do próprio perfil
 *     description: |
 *       Atualização parcial: envie apenas os campos que mudaram. Campos não
 *       reconhecidos são ignorados — o cliente não define quais colunas do
 *       banco podem ser alteradas.
 *
 *       **Troca de e-mail exige a senha atual.** O e-mail é o meio de
 *       recuperação da conta, então alterá-lo é tratado como operação
 *       sensível mesmo com sessão válida.
 *
 *       Responde com o perfil completo já atualizado, relido do banco.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               nome:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Abraão Santos
 *               bio:
 *                 type: string
 *                 maxLength: 280
 *                 nullable: true
 *                 example: Desenvolvedor Node.js no Recife.
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Exige `senhaAtual` no mesmo corpo.
 *               nascimento:
 *                 type: string
 *                 format: date
 *                 description: Idade mínima de 13 anos.
 *                 example: '2004-01-20'
 *               nacionalidade:
 *                 type: string
 *                 description: Código ISO alpha-3 existente em `GET /countries`.
 *                 example: BRA
 *               senhaAtual:
 *                 type: string
 *                 format: password
 *                 description: Obrigatório apenas ao alterar o e-mail.
 *           examples:
 *             bio:
 *               summary: Alterar apenas a bio
 *               value: { bio: 'Desenvolvedor Node.js no Recife.' }
 *             email:
 *               summary: Alterar o e-mail
 *               value: { email: 'novo@exemplo.com', senhaAtual: 'SenhaForte#1' }
 *     responses:
 *       200:
 *         description: Perfil atualizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Perfil' }
 *       400:
 *         description: Campo inválido ou nenhum campo editável informado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         description: Token ausente, ou senha atual ausente/incorreta
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       409:
 *         description: E-mail já em uso por outra conta
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.patch('/me', usuariosController.atualizarPerfil);

/**
 * @swagger
 * /users/me:
 *   get:
 *     tags: [Usuários]
 *     summary: Perfil do usuário autenticado
 *     description: |
 *       Devolve o perfil completo de quem está autenticado, incluindo `email` e
 *       `nascimento` — campos omitidos no perfil público.
 *
 *       O usuário é identificado exclusivamente pelo token; a rota não aceita
 *       identificador vindo do cliente.
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Perfil' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/me', usuariosController.meuPerfil);

/**
 * @swagger
 * /users/{alias}:
 *   get:
 *     tags: [Usuários]
 *     summary: Perfil público de um usuário
 *     description: |
 *       Devolve o perfil identificado pelo @. Campos pessoais (`email`,
 *       `nascimento`) vêm como `null`, exceto quando o alias pertence ao
 *       próprio usuário autenticado.
 *
 *       `seguindoEste` indica se quem está autenticado segue este perfil.
 *     parameters:
 *       - name: alias
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: O @ do usuário, sem a arroba.
 *         example: john.doe
 *     responses:
 *       200:
 *         description: Perfil encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Perfil' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/:alias', usuariosController.perfilPorAlias);

module.exports = router;