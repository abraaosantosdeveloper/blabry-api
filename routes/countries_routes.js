const express = require('express');
const router = express.Router();
const countriesController = require('../controllers/countries_controller');

/**
 * @swagger
 * /countries:
 *   get:
 *     tags: [Países]
 *     summary: Lista as nacionalidades disponíveis
 *     description: |
 *       Devolve todos os países cadastrados na tabela `countries`, em ordem alfabética.
 *
 *       Rota **pública** — é consumida pela tela de cadastro, quando o usuário
 *       ainda não possui token. Os códigos devolvidos são exatamente os aceitos
 *       pela chave estrangeira de `user.nationality`.
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de países
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Country'
 *             example:
 *               - country: AFG
 *                 name: Afeganistão
 *               - country: BRA
 *                 name: Brasil
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/', countriesController.listarPaises);

module.exports = router;
