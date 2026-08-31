const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios_controller');
/* A rota de publicações do autor começa por /users, mas devolve publicações.
   O controlador é o de post: quem mantém as regras de publicação encontra
   tudo em um arquivo só. */
const postController = require('../controllers/post_controller');
/* A exclusão de conta e o código que a autoriza vivem no controlador de
   autenticação: são operações sobre a credencial e a identidade, não sobre
   o perfil. As rotas ficam aqui apenas porque o caminho começa por /users. */
const authController = require('../controllers/auth_controller');

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
/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Usuários]
 *     summary: Busca usuários por nome ou @
 *     description: |
 *       Compara o termo com o @ por prefixo e com o nome completo por
 *       conteúdo. A ordenação privilegia, nesta ordem: quem tem o @ exato,
 *       quem tem o @ começando pelo termo, e por fim os demais, em ordem
 *       alfabética.
 *
 *       O próprio usuário autenticado é excluído dos resultados, e contas
 *       excluídas não aparecem.
 *
 *       Termos com menos de 2 caracteres devolvem lista vazia — um filtro
 *       impossível de satisfazer não retorna a base inteira.
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *         description: Nome ou @ procurado. O caractere @ é opcional.
 *         example: abraao
 *       - $ref: '#/components/parameters/Pagina'
 *       - $ref: '#/components/parameters/Limite'
 *     responses:
 *       200:
 *         description: Página de usuários
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     usuarios:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           nome: { type: string, example: 'Abraão Santos' }
 *                           alias: { type: string, example: 'abraaosantosdev' }
 *                           fotoUrl: { type: string, nullable: true }
 *                           bio: { type: string, nullable: true }
 *                 - $ref: '#/components/schemas/Paginacao'
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/', usuariosController.buscar);

router.get('/me', usuariosController.meuPerfil);

/**
 * @swagger
 * /users/me/exclusao/codigo:
 *   post:
 *     tags: [Usuários]
 *     summary: Envia o código que autoriza excluir a conta
 *     description: |
 *       Exige token: excluir é ação do dono da sessão, não de quem conhece
 *       um endereço de e-mail.
 *
 *       O destino é lido do banco a partir do token, nunca aceito do corpo
 *       da requisição — aceitá-lo permitiria mandar o código de exclusão de
 *       uma conta para outro endereço.
 *
 *       A resposta traz o e-mail mascarado (`a*****@gmail.com`) para a
 *       interface confirmar o destino sem escrever o endereço inteiro em uma
 *       tela que pode estar sendo vista por outra pessoa.
 *     responses:
 *       200:
 *         description: Código enviado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 email: { type: string, example: 'a*****@gmail.com' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       429:
 *         description: Novo código pedido cedo demais
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.post('/me/exclusao/codigo', authController.solicitarExclusao);

/**
 * @swagger
 * /users/me:
 *   delete:
 *     tags: [Usuários]
 *     summary: Exclui a conta autenticada
 *     description: |
 *       Duas provas são exigidas: o token (é a sessão do dono) e o código
 *       enviado ao e-mail (o dono está de fato ali, e não alguém em um
 *       computador deixado aberto). Para uma ação irreversível, uma prova só
 *       é pouco.
 *
 *       A exclusão é **lógica** — preenche `deleted_at`. Todas as consultas
 *       do sistema já filtram por `deleted_at IS NULL`, então a conta some
 *       da aplicação no mesmo instante: ela desaparece do feed, da busca, dos
 *       perfis e das listas de seguidores.
 *
 *       A alternativa, `DELETE` físico, arrastaria em cascata publicações,
 *       comentários e curtidas — inclusive comentários de terceiros em
 *       publicações do usuário, apagando conteúdo de quem não pediu nada.
 *
 *       O código pode vir no corpo ou na query: `DELETE` com corpo é aceito
 *       pelo Express, mas nem todo cliente HTTP o envia.
 *     parameters:
 *       - name: codigo
 *         in: query
 *         required: false
 *         schema: { type: string, pattern: '^[0-9]{6}$' }
 *         description: Alternativa ao corpo, para clientes que não enviam corpo em DELETE.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               codigo: { type: string, pattern: '^[0-9]{6}$', example: '048213' }
 *     responses:
 *       204:
 *         description: Conta excluída
 *       400:
 *         description: Código inválido ou expirado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.delete('/me', authController.excluirConta);

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
/**
 * @swagger
 * /users/{alias}/follow:
 *   post:
 *     tags: [Usuários]
 *     summary: Passa a seguir um usuário
 *     description: |
 *       Idempotente — seguir duas vezes não duplica o relacionamento, por
 *       causa da restrição de unicidade no par seguidor/seguido.
 *
 *       Responde com o total de seguidores recontado no banco, e não com um
 *       incremento: o cliente pode ter feito atualização otimista, e esta
 *       resposta é a reconciliação.
 *     parameters:
 *       - name: alias
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: O @ do usuário, sem a arroba.
 *     responses:
 *       200:
 *         description: Estado do relacionamento
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Seguir' }
 *       400:
 *         description: Tentativa de seguir a si mesmo
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   delete:
 *     tags: [Usuários]
 *     summary: Deixa de seguir um usuário
 *     description: Idempotente — deixar de seguir quem não era seguido não é erro.
 *     parameters:
 *       - name: alias
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estado do relacionamento
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Seguir' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post('/:alias/follow', usuariosController.seguir);
router.delete('/:alias/follow', usuariosController.deixarDeSeguir);

/**
 * @swagger
 * /users/{alias}/posts:
 *   get:
 *     tags: [Publicações]
 *     summary: Lista as publicações de um usuário
 *     description: |
 *       Alimenta a seção de publicações do perfil, tanto no próprio perfil
 *       quanto no de outra pessoa — a resposta é a mesma nos dois casos,
 *       porque publicação é conteúdo público.
 *
 *       Ordem cronológica decrescente. `curtido` é relativo ao usuário do
 *       token.
 *
 *       Perfil inexistente responde 404 — e não uma lista vazia, que
 *       afirmaria algo diferente ("existe, mas não publicou nada").
 *     parameters:
 *       - name: alias
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: O @ do usuário, com ou sem a arroba.
 *         example: abraao
 *       - $ref: '#/components/parameters/Pagina'
 *       - $ref: '#/components/parameters/Limite'
 *     responses:
 *       200:
 *         description: Página de publicações do autor
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
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroInterno'
 */
router.get('/:alias/posts', postController.listarDoAutor);

router.get('/:alias', usuariosController.perfilPorAlias);

module.exports = router;