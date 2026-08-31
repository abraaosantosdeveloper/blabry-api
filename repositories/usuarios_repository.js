const User = require('../models/user')

class UsuariosRepository {
    constructor(pool){
        this.pool = pool;
    }

    static get COLUNAS(){
        return `u.id, u.full_name, u.alias, u.email, u.password_hash, u.nationality,
            u.birth_date, u.bio, u.pic_url, u.created_at, u.deleted_at`;
    }

      /** Colunas que o próprio usuário pode alterar. Chave = campo da API. */
    static get CAMPOS_EDITAVEIS() {
        return {
        nome: 'full_name',
        bio: 'bio',
        email: 'email',
        nascimento: 'birth_date',
        nacionalidade: 'nationality',
        };
    }

    /**
     * Atualização parcial do perfil.
     * Só as chaves presentes em CAMPOS_EDITAVEIS chegam ao SQL — o nome da
     * coluna nunca vem do cliente.
     * @returns {number} linhas afetadas
     */
    async atualizar(usuarioId, campos) {
        const permitidos = UsuariosRepository.CAMPOS_EDITAVEIS;

        const entradas = Object.entries(campos)
        .filter(([chave]) => Object.hasOwn(permitidos, chave));

        if (!entradas.length) return 0;

        const atribuicoes = entradas.map(([chave]) => `${permitidos[chave]} = ?`);
        const valores = entradas.map(([, valor]) => valor);

        const [resultado] = await this.pool.execute(
        `UPDATE user SET ${atribuicoes.join(', ')}
            WHERE id = ? AND deleted_at IS NULL`,
        [...valores, usuarioId]
        );

        return resultado.affectedRows;
    }

    /** Verifica se um email já pertence a outro usuário. */
    async emailEmUso(email, exceroUsuarioId) {
        const [rows] = await this.pool.execute(
        'SELECT 1 FROM user WHERE email = ? AND id <> ? AND deleted_at IS NULL LIMIT 1',
        [email, exceroUsuarioId]
        );
        return rows.length > 0;
    }
        
    async buscarPerfil(campo, valor, visitanteId= null){
        const coluna = campo === 'alias' ? 'u.alias' : 'u.id';

        const [rows] = await this.pool.execute(
            `SELECT ${UsuariosRepository.COLUNAS},
              (SELECT COUNT(*) FROM follow f WHERE f.following_id = u.id) AS seguidores,
              (SELECT COUNT(*) FROM follow f WHERE f.follower_id  = u.id) AS seguindo,
              EXISTS(SELECT 1 FROM follow f
                     WHERE f.follower_id = ? AND f.following_id = u.id) AS seguindo_este,
              -- Direção oposta: o dono do perfil segue quem está visitando.
              -- As colunas trocam de lado em relação ao EXISTS acima; inverter
              -- aqui não gera erro, apenas devolve a resposta errada.
              EXISTS(SELECT 1 FROM follow f
                     WHERE f.follower_id = u.id AND f.following_id = ?) AS te_segue
            FROM user u
            WHERE ${coluna} = ? AND u.deleted_at IS NULL`,
            // A ordem acompanha os "?": seguindo_este, te_segue e o WHERE.
            [visitanteId, visitanteId, valor]
        )

        if(!rows[0]) return null;
        
        return {
            usuario: User.deLinha(rows[0]),
            seguidores: Number(rows[0].seguidores),
            seguindo: Number(rows[0].seguindo),
            seguindoEste: Boolean(rows[0].seguindo_este),
            teSegue: Boolean(rows[0].te_segue),
        }
    }

    async atualizarFoto(usuarioId, url) {
        const [resultado] = await this.pool.execute(
        'UPDATE user SET pic_url = ? WHERE id = ? AND deleted_at IS NULL',
        [url, usuarioId]
        );
        return resultado.affectedRows;
    }

    /**
     * Busca usuários por nome ou pelo @, com paginação.
     *
     * @param {object}  opcoes
     * @param {string}  opcoes.q          termo digitado, já normalizado pelo service
     * @param {string}  opcoes.visitanteId quem está buscando — excluído dos resultados
     * @param {number}  opcoes.limite     quantos registros trazer nesta página
     * @param {number}  opcoes.offset     quantos registros pular antes de começar
     * @returns {Promise<{usuarios: object[], total: number}>}
     */
    async buscar({ q, visitanteId, limite = 8, offset = 0 }) {
        // LIMIT e OFFSET não aceitam placeholder "?" em prepared statement no
        // MySQL: o servidor precisa conhecê-los para compilar a consulta. Como
        // eles são interpolados direto na string, esta checagem é o que impede
        // que qualquer coisa diferente de um inteiro chegue ao SQL.
        if (!Number.isInteger(limite) || !Number.isInteger(offset))
            throw new TypeError('limite e offset devem ser inteiros');

        // O termo é usado em três comparações diferentes, cada uma com um
        // formato próprio. Montamos os três aqui para deixar a query legível.
        const prefixo = `${q}%`;      // "abra%"  → casa quem COMEÇA com o termo
        const meio = `%${q}%`;        // "%abra%" → casa quem CONTÉM o termo
        const exato = q;              // "abra"   → casa quem é exatamente o termo

        const [rows] = await this.pool.execute(
            `SELECT u.id, u.full_name, u.alias, u.pic_url, u.bio
               FROM user u
              WHERE u.deleted_at IS NULL          -- contas excluídas não aparecem
                AND u.id <> ?                     -- não faz sentido achar a si mesmo
                AND (u.alias LIKE ?                -- @ começando com o termo
                     OR u.full_name LIKE ?)        -- nome contendo o termo
              -- Relevância: quem é exatamente o termo vem primeiro, depois quem
              -- começa com ele, e por último quem apenas o contém no meio do nome.
              -- O CASE devolve 0, 1 ou 2 e o ORDER BY crescente coloca o 0 no topo.
              ORDER BY CASE
                         WHEN u.alias = ? THEN 0
                         WHEN u.alias LIKE ? THEN 1
                         ELSE 2
                       END,
                       u.full_name ASC
              LIMIT ${limite} OFFSET ${offset}`,
            // A ordem deste array segue exatamente a ordem dos "?" acima:
            // visitante, alias LIKE prefixo, nome LIKE meio, alias exato, alias LIKE prefixo
            [visitanteId, prefixo, meio, exato, prefixo]
        );

        // O total precisa das MESMAS condições da consulta acima, senão a
        // paginação promete páginas que não existem. Só o ORDER BY e o LIMIT
        // ficam de fora, porque não afetam a contagem.
        const [[{ total }]] = await this.pool.execute(
            `SELECT COUNT(*) AS total
               FROM user u
              WHERE u.deleted_at IS NULL
                AND u.id <> ?
                AND (u.alias LIKE ? OR u.full_name LIKE ?)`,
            [visitanteId, prefixo, meio]
        );

        // Formato enxuto de propósito: a lista de resultados só precisa do
        // suficiente para desenhar cada linha e navegar até o perfil.
        return {
            usuarios: rows.map((linha) => ({
                nome: linha.full_name,
                alias: linha.alias,
                fotoUrl: linha.pic_url ?? null,
                bio: linha.bio ?? null,
            })),
            total: Number(total),
        };
    }

    /**
     * Traduz um @ no identificador interno do usuário.
     *
     * As rotas públicas trabalham com alias porque é o que aparece na URL e
     * o que a pessoa conhece; as tabelas de relacionamento guardam o id.
     * Esta consulta é a ponte entre os dois.
     *
     * @param {string} alias o @ do usuário, sem a arroba
     * @returns {Promise<string|null>} o id, ou null se não existir
     */
    async buscarIdPorAlias(alias) {
        const [rows] = await this.pool.execute(
            'SELECT id FROM user WHERE alias = ? AND deleted_at IS NULL LIMIT 1',
            [alias]
        );
        // rows[0] existe apenas se houve resultado; o ?. evita ler de undefined.
        return rows[0]?.id ?? null;
    }

    /**
     * Registra que um usuário passou a seguir outro.
     *
     * A operação é idempotente: a tabela tem UNIQUE (follower_id, following_id),
     * e o ON DUPLICATE KEY absorve a segunda tentativa sem erro — dois cliques
     * rápidos ou duas abas abertas não criam duas linhas.
     *
     * O "UPDATE follower_id = follower_id" é intencionalmente inútil: serve só
     * para dar ao MySQL uma ação válida no caso de duplicata. A alternativa
     * INSERT IGNORE seria pior, porque silenciaria TODOS os erros, inclusive
     * violação de chave estrangeira — seguir alguém inexistente passaria batido.
     *
     * @param {string} id         identificador da linha de relacionamento (UUID v7)
     * @param {string} seguidorId quem está seguindo
     * @param {string} seguidoId  quem passou a ser seguido
     */
    async seguir(id, seguidorId, seguidoId) {
        await this.pool.execute(
            `INSERT INTO follow (id, follower_id, following_id) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE follower_id = follower_id`,
            [id, seguidorId, seguidoId]
        );
    }

    /**
     * Desfaz o relacionamento.
     *
     * Também idempotente: deixar de seguir quem não era seguido não é erro,
     * apenas não afeta linha alguma.
     */
    async deixarDeSeguir(seguidorId, seguidoId) {
        await this.pool.execute(
            'DELETE FROM follow WHERE follower_id = ? AND following_id = ?',
            [seguidorId, seguidoId]
        );
    }

    /**
     * Reconta os seguidores de um usuário.
     *
     * Chamado depois de seguir ou deixar de seguir para devolver o número
     * verdadeiro ao cliente, em vez de um valor incrementado em memória. Se
     * duas pessoas seguirem ao mesmo tempo, o que vale é o que está no banco.
     *
     * Atenção à direção: seguidores de X são as linhas em que X aparece como
     * `following_id` — ou seja, gente que segue ELE. Inverter as colunas aqui
     * não gera erro, só devolve o número errado.
     */
    async contarSeguidores(usuarioId) {
        const [[{ total }]] = await this.pool.execute(
            'SELECT COUNT(*) AS total FROM follow WHERE following_id = ?',
            [usuarioId]
        );
        // COUNT vem como número no mysql2, mas a conversão explícita protege
        // contra variação de driver e deixa o tipo evidente para quem lê.
        return Number(total);
    }
}

module.exports = UsuariosRepository