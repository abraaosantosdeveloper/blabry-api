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
                     WHERE f.follower_id = ? AND f.following_id = u.id) AS seguindo_este
            FROM user u
            WHERE ${coluna} = ? AND u.deleted_at IS NULL`, [visitanteId, valor]
        )

        if(!rows[0]) return null;
        
        return {
            usuario: User.deLinha(rows[0]),
            seguidores: Number(rows[0].seguidores),
            seguindo: Number(rows[0].seguindo),
            seguindoEste: Boolean(rows[0].seguindo_este),
        }
    }

    async atualizarFoto(usuarioId, url) {
        const [resultado] = await this.pool.execute(
        'UPDATE user SET pic_url = ? WHERE id = ? AND deleted_at IS NULL',
        [url, usuarioId]
        );
        return resultado.affectedRows;
    }
}

module.exports = UsuariosRepository