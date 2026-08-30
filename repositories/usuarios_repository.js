const User = require('../models/user')

class UsuariosRepository {
    constructor(pool){
        this.pool = pool;
    }

    static get COLUNAS(){
        return `u.id, u.full_name, u.alias, u.email, u.password_hash, u.nationality,
            u.birth_date, u.bio, u.pic_url, u.created_at, u.deleted_at`;
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