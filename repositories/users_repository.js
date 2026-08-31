const User = require('../models/user')

class UsersRepository {
    constructor(pool) {
        this.pool = pool;
    }

    static get COLUMNS() {
        return `u.id, u.full_name, u.alias, u.email, u.password_hash, u.nationality,
            u.birth_date, u.bio, u.pic_url, u.created_at, u.deleted_at`;
    }

    /** Colunas que o próprio usuário pode alterar. Chave = campo da API. */
    static get EDITABLE_FIELDS() {
        return {
            name: 'full_name',
            bio: 'bio',
            email: 'email',
            birthDate: 'birth_date',
            nationality: 'nationality',
        };
    }

    /**
     * Atualização parcial do perfil.
     * Só as chaves presentes em EDITABLE_FIELDS chegam ao SQL — o nome da
     * coluna nunca vem do cliente.
     * @returns {number} linhas afetadas
     */
    async update(userId, fields) {
        const allowed = UsersRepository.EDITABLE_FIELDS;

        const entries = Object.entries(fields)
            .filter(([key]) => Object.hasOwn(allowed, key));

        if (!entries.length) return 0;

        const assignments = entries.map(([key]) => `${allowed[key]} = ?`);
        const values = entries.map(([, value]) => value);

        const [result] = await this.pool.execute(
            `UPDATE user SET ${assignments.join(', ')}
                WHERE id = ? AND deleted_at IS NULL`,
            [...values, userId]
        );

        return result.affectedRows;
    }

    /** Verifica se um email já pertence a outro usuário. */
    async emailInUse(email, exceptUserId) {
        const [rows] = await this.pool.execute(
            'SELECT 1 FROM user WHERE email = ? AND id <> ? AND deleted_at IS NULL LIMIT 1',
            [email, exceptUserId]
        );
        return rows.length > 0;
    }

    async findProfile(field, value, viewerId = null) {
        const column = field === 'alias' ? 'u.alias' : 'u.id';

        const [rows] = await this.pool.execute(
            `SELECT ${UsersRepository.COLUMNS},
              (SELECT COUNT(*) FROM follow f WHERE f.following_id = u.id) AS followers,
              (SELECT COUNT(*) FROM follow f WHERE f.follower_id  = u.id) AS following,
              EXISTS(SELECT 1 FROM follow f
                     WHERE f.follower_id = ? AND f.following_id = u.id) AS is_following,
              -- Direção oposta: o dono do perfil segue quem está visitando.
              -- As colunas trocam de lado em relação ao EXISTS acima; inverter
              -- aqui não gera erro, apenas devolve a resposta errada.
              EXISTS(SELECT 1 FROM follow f
                     WHERE f.follower_id = u.id AND f.following_id = ?) AS follows_you
            FROM user u
            WHERE ${column} = ? AND u.deleted_at IS NULL`,
            // A ordem acompanha os "?": is_following, follows_you e o WHERE.
            [viewerId, viewerId, value]
        )

        if (!rows[0]) return null;

        return {
            user: User.fromRow(rows[0]),
            followers: Number(rows[0].followers),
            following: Number(rows[0].following),
            isFollowing: Boolean(rows[0].is_following),
            followsYou: Boolean(rows[0].follows_you),
        }
    }

    async updatePhoto(userId, url) {
        const [result] = await this.pool.execute(
            'UPDATE user SET pic_url = ? WHERE id = ? AND deleted_at IS NULL',
            [url, userId]
        );
        return result.affectedRows;
    }

    /**
     * Busca usuários por nome ou pelo @, com paginação.
     *
     * @param {object}  options
     * @param {string}  options.q        termo digitado, já normalizado pelo service
     * @param {string}  options.viewerId quem está buscando — excluído dos resultados
     * @param {number}  options.limit    quantos registros trazer nesta página
     * @param {number}  options.offset   quantos registros pular antes de começar
     * @returns {Promise<{users: object[], total: number}>}
     */
    async search({ q, viewerId, limit = 8, offset = 0 }) {
        // LIMIT e OFFSET não aceitam placeholder "?" em prepared statement no
        // MySQL: o servidor precisa conhecê-los para compilar a consulta. Como
        // eles são interpolados direto na string, esta checagem é o que impede
        // que qualquer coisa diferente de um inteiro chegue ao SQL.
        if (!Number.isInteger(limit) || !Number.isInteger(offset))
            throw new TypeError('limit e offset devem ser inteiros');

        // O termo é usado em três comparações diferentes, cada uma com um
        // formato próprio. Montamos os três aqui para deixar a query legível.
        const prefix = `${q}%`;      // "abra%"  → casa quem COMEÇA com o termo
        const middle = `%${q}%`;     // "%abra%" → casa quem CONTÉM o termo
        const exact = q;             // "abra"   → casa quem é exatamente o termo

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
              LIMIT ${limit} OFFSET ${offset}`,
            // A ordem deste array segue exatamente a ordem dos "?" acima:
            // visitante, alias LIKE prefixo, nome LIKE meio, alias exato, alias LIKE prefixo
            [viewerId, prefix, middle, exact, prefix]
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
            [viewerId, prefix, middle]
        );

        // Formato enxuto de propósito: a lista de resultados só precisa do
        // suficiente para desenhar cada linha e navegar até o perfil.
        return {
            users: rows.map((row) => ({
                name: row.full_name,
                alias: row.alias,
                photoUrl: row.pic_url ?? null,
                bio: row.bio ?? null,
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
    async findIdByAlias(alias) {
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
     * @param {string} followerId quem está seguindo
     * @param {string} followingId quem passou a ser seguido
     */
    async follow(id, followerId, followingId) {
        await this.pool.execute(
            `INSERT INTO follow (id, follower_id, following_id) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE follower_id = follower_id`,
            [id, followerId, followingId]
        );
    }

    /**
     * Desfaz o relacionamento.
     *
     * Também idempotente: deixar de seguir quem não era seguido não é erro,
     * apenas não afeta linha alguma.
     */
    async unfollow(followerId, followingId) {
        await this.pool.execute(
            'DELETE FROM follow WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
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
    async countFollowers(userId) {
        const [[{ total }]] = await this.pool.execute(
            'SELECT COUNT(*) AS total FROM follow WHERE following_id = ?',
            [userId]
        );
        // COUNT vem como número no mysql2, mas a conversão explícita protege
        // contra variação de driver e deixa o tipo evidente para quem lê.
        return Number(total);
    }
}

module.exports = UsersRepository
