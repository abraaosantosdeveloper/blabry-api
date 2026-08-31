# Vocabulário da API

Tradução única e definitiva dos termos do domínio. Serve ao back-end e ao
front-end: qualquer nome novo deve sair desta tabela, e qualquer nome que
apareça no código e não esteja aqui é um termo que ninguém decidiu.

Comentários e mensagens de erro permanecem em **português** — os primeiros
porque são para quem mantém o código, e as segundas porque são lidas pelo
usuário final, que é brasileiro.

## Campos do JSON

| Português | Inglês | Onde aparece |
|---|---|---|
| `nome` | `name` | usuário, perfil, autor |
| `apelido` / `alias` | `alias` | usuário (o `@`) |
| `fotoUrl` | `photoUrl` | usuário, autor |
| `nascimento` | `birthDate` | perfil próprio |
| `nacionalidade` | `nationality` | perfil próprio |
| `bio` | `bio` | perfil (igual nos dois idiomas) |
| `seguidores` | `followers` | perfil |
| `seguindo` | `following` | perfil |
| `seguindoEste` | `isFollowing` | perfil de terceiro |
| `teSegue` | `followsYou` | perfil de terceiro |
| `desde` | `memberSince` | perfil |
| `texto` | `text` | publicação, comentário |
| `criadoEm` | `createdAt` | publicação, comentário |
| `editadoEm` | `editedAt` | publicação, comentário |
| `autor` | `author` | publicação, comentário |
| `curtidas` | `likes` | publicação |
| `comentarios` | `comments` | publicação |
| `curtido` | `liked` | publicação |
| `senha` | `password` | autenticação |
| `novaSenha` | `newPassword` | troca de senha |
| `codigo` | `code` | verificação |
| `aceitouPolitica` | `acceptedPolicy` | cadastro |
| `verificacaoPendente` | `verificationPending` | cadastro |
| `usuario` | `user` | envelope de autenticação |
| `erro` | `error` | envelope de erro |
| `pagina` | `page` | paginação |
| `totalPaginas` | `totalPages` | paginação |
| `limite` | `limit` | paginação (query) |
| `senhaAtual` | `currentPassword` | troca de e-mail no perfil |

`id`, `email`, `token`, `total`, `ok` e `country` já eram iguais.

### Uma correção de rota

`usuario.toJSON()` expunha `apelido` enquanto `paraPerfil()` expunha
`alias` — dois nomes para o mesmo dado, dependendo do endpoint. Fica
`alias` nos dois.

## Caminhos das rotas

| Antes | Depois |
|---|---|
| `POST /auth/cadastro` | `POST /auth/signup` |
| `POST /auth/verificar-email` | `POST /auth/verify-email` |
| `POST /auth/verificar-email/reenviar` | `POST /auth/verify-email/resend` |
| `POST /auth/senha/codigo` | `POST /auth/password/code` |
| `POST /auth/senha` | `POST /auth/password` |
| `POST /users/me/exclusao/codigo` | `POST /users/me/deletion/code` |
| `.../comments/:comentarioId` | `.../comments/:commentId` |

As demais já estavam em inglês.

## Campo do upload

O upload de foto é `multipart/form-data`, e o **nome do campo** também faz
parte do contrato:

| Antes | Depois |
|---|---|
| `foto` | `photo` |

## Variável de ambiente

| Antes | Depois |
|---|---|
| `EMAIL_REMETENTE` | `EMAIL_SENDER` |

## O que NÃO muda

- **Colunas do banco.** Já estão em inglês (`full_name`, `pic_url`,
  `created_at`). A tradução entre elas e o domínio continua sendo
  responsabilidade dos repositórios, em `deLinha`/`paraLinha`.
- **`idx_verificacao_usuario_proposito`.** Índice já criado em produção;
  renomear exigiria migração própria, sem ganho algum.
- **Mensagens de erro.** Permanecem em português — são lidas pelo usuário.
- **Comentários.** Permanecem em português.
- **`ChatLog` do Docusaurus.** O componente de diálogo do modelo 3C usa
  `autor`/`texto` nas suas próprias props. É componente do site de
  documentação, não da API.

## Como usar este documento

Um nome que aparece no código e não está aqui é um nome que ninguém
decidiu. Ao introduzir um termo novo do domínio, acrescente a linha antes
de escrever o código — é mais barato discordar de uma linha de tabela do
que de uma alteração espalhada por dois repositórios.
