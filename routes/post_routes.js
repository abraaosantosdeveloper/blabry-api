const express = require('express');
const router = express.Router();
const postController = require('../controllers/post_controller');
const commentController = require('../controllers/comment_controller');

/**
 * @swagger
 * /posts:
 *   get:
 *     tags: [Publicações]
 *     summary: Lista o feed ou busca publicações
 *     description: |
 *       Sem `q`, devolve o feed em ordem cronológica decrescente. Com `q`,
 *       filtra pelo conteúdo usando índice FULLTEXT e ordena por relevância.
 *
 *       Publicações de contas excluídas não aparecem.
 *
 *       `curtidas` e `comentarios` são agregados calculados na consulta, e
 *       `curtido` indica se o usuário do token curtiu — todos vêm do banco,
 *       nunca de contagem mantida no cliente.
 *     parameters:
 *       - $ref: '#/components/parameters/Pagina'
 *       - $ref: '#/components/parameters/Limite'
 *       - name: q
 *         in: query
 *         schema: { type: string, minLength: 3 }
 *         description: |
 *           Termo de busca. Palavras com menos de 3 caracteres são ignoradas
 *           pelo índice FULLTEXT, então termos curtos devolvem lista vazia —
 *           nunca o feed completo.
 *         example: websockets
 *     responses:
 *       200:
 *         description: Página de publicações
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     posts:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Post' }
 *                 - $ref: '#/components/schemas/Paginacao'
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 *   post:
 *     tags: [Publicações]
 *     summary: Cria uma publicação
 *     description: |
 *       O autor é sempre o usuário do token. Responde com a publicação já
 *       completa, incluindo autor e contadores zerados, pronta para o
 *       cliente inserir no topo do feed sem recarregar.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 280
 *                 example: Primeiro blab por aqui!
 *     responses:
 *       201:
 *         description: Publicação criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Post' }
 *       400:
 *         description: Texto vazio ou acima de 280 caracteres
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/', postController.listar);
router.post('/', postController.criar);

/**
 * @swagger
 * /posts/{id}/like:
 *   post:
 *     tags: [Publicações]
 *     summary: Curte uma publicação
 *     description: |
 *       Idempotente — curtir duas vezes não duplica, por causa da restrição
 *       de unicidade por par usuário/publicação.
 *
 *       Responde com o total recontado no banco, não com um incremento.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Estado da curtida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Curtida' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   delete:
 *     tags: [Publicações]
 *     summary: Remove a curtida
 *     description: Idempotente — descurtir algo não curtido não é erro.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Estado da curtida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Curtida' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post('/:id/like', postController.curtir);
router.delete('/:id/like', postController.descurtir);

/**
 * @swagger
 * /posts/{id}/comments:
 *   get:
 *     tags: [Publicações]
 *     summary: Lista os comentários de uma publicação
 *     description: |
 *       Ordem cronológica crescente — comentário é conversa, lida de cima
 *       para baixo. As páginas seguintes trazem os comentários mais recentes.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - $ref: '#/components/parameters/Pagina'
 *       - $ref: '#/components/parameters/Limite'
 *     responses:
 *       200:
 *         description: Página de comentários
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     comentarios:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Comentario' }
 *                 - $ref: '#/components/schemas/Paginacao'
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   post:
 *     tags: [Publicações]
 *     summary: Comenta em uma publicação
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto: { type: string, minLength: 1, maxLength: 280 }
 *     responses:
 *       201:
 *         description: Comentário criado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Comentario' }
 *       400:
 *         description: Texto vazio ou acima de 280 caracteres
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.get('/:id/comments', commentController.listar);
router.post('/:id/comments', commentController.criar);

/**
 * @swagger
 * /posts/{id}/comments/{comentarioId}:
 *   patch:
 *     tags: [Publicações]
 *     summary: Edita um comentário
 *     description: |
 *       Permitido apenas ao autor e apenas nos primeiros 15 minutos após a
 *       publicação. O prazo é medido pelo relógio do servidor.
 *
 *       Uma vez editado, o comentário passa a expor `editadoEm`, e a
 *       interface o marca como editado — quem respondeu reagiu ao texto
 *       anterior.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: comentarioId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto: { type: string, minLength: 1, maxLength: 280 }
 *     responses:
 *       200:
 *         description: Comentário atualizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Comentario' }
 *       400:
 *         description: Texto vazio ou acima de 280 caracteres
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: O comentário pertence a outro usuário
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: Janela de 15 minutos encerrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
router.patch('/:id/comments/:comentarioId', commentController.editar);

/**
 * @swagger
 * /posts/{id}/comments/{comentarioId}:
 *   delete:
 *     tags: [Publicações]
 *     summary: Exclui um comentário
 *     description: Só o autor do comentário pode excluí-lo.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: comentarioId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Comentário excluído
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: O comentário pertence a outro usuário
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.delete('/:id/comments/:comentarioId', commentController.excluir);

/**
 * @swagger
 * /posts/{id}:
 *   patch:
 *     tags: [Publicações]
 *     summary: Edita uma publicação
 *     description: |
 *       Permitido apenas ao autor e apenas nos primeiros 15 minutos, medidos
 *       pelo relógio do servidor. Publicações editadas passam a expor
 *       `editadoEm` e são marcadas como tal na interface — quem curtiu ou
 *       comentou reagiu ao texto anterior.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto: { type: string, minLength: 1, maxLength: 280 }
 *     responses:
 *       200:
 *         description: Publicação atualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Post' }
 *       400:
 *         description: Texto vazio ou acima de 280 caracteres
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: A publicação pertence a outro usuário
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: Janela de 15 minutos encerrada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
/**
 * @swagger
 * /posts/{id}:
 *   get:
 *     tags: [Publicações]
 *     summary: Detalha uma publicação
 *     description: |
 *       Alimenta a página dedicada da publicação. Devolve o mesmo formato
 *       usado no feed — post, autor e agregados — para que a interface não
 *       precise de dois modelos diferentes para a mesma coisa.
 *
 *       `curtido` é relativo a quem consulta: indica se o usuário do token
 *       curtiu esta publicação.
 *
 *       Publicações de contas excluídas respondem 404, e não uma versão
 *       parcial: do ponto de vista de quem consulta, elas não existem.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: A publicação
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Post' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/:id', postController.buscarPorId);

router.patch('/:id', postController.editar);

/**
 * @swagger
 * /posts/{id}:
 *   delete:
 *     tags: [Publicações]
 *     summary: Exclui uma publicação
 *     description: |
 *       Só o autor pode excluir. A autoria faz parte da própria instrução de
 *       exclusão, e não de uma verificação anterior — não existe intervalo
 *       entre checar e apagar.
 *
 *       Comentários e curtidas são removidos junto, por `ON DELETE CASCADE`.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Publicação excluída
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: A publicação pertence a outro usuário
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.delete('/:id', postController.excluir);

module.exports = router;