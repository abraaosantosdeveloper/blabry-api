/* ============================================================
   Blabry — esquema do banco
   ------------------------------------------------------------
   Este arquivo é o retrato do banco como ele está hoje, em
   produção. Não há mais pasta `migrations/`: o histórico de como
   o esquema chegou aqui vive no git, que já é um registro
   numerado e imutável, e mantê-lo duplicado em SQL só criava a
   pergunta de qual dos dois estava certo.

   ATENÇÃO — este arquivo CRIA, não ATUALIZA.

   `create table if not exists` é silencioso: se a tabela já
   existe, ele não faz nada, e não adiciona colunas que faltem.
   Rodar este arquivo sobre um banco antigo não o traz para o
   estado atual — apenas não reclama. Para evoluir um banco que
   já existe, escreva o ALTER correspondente à mão, compare com
   este arquivo e confira o resultado com `SHOW CREATE TABLE`.

   utf8mb4 é obrigatório: os nomes de países têm acentos e os
   posts têm emojis, que ocupam 4 bytes e não cabem no utf8 do
   MySQL (que, apesar do nome, guarda no máximo 3).
   ============================================================ */

create database if not exists blabry_db
    character set utf8mb4
    collate utf8mb4_unicode_ci;

use blabry_db;

/* Países para a nacionalidade */
create table if not exists countries(
    country char(3) not null unique,
    name varchar(100),
    primary key(country)
);

/* Tabela de usuário */
create table if not exists user(
    id char(36) not null,
    full_name varchar(100) not null,
    alias varchar(100) not null unique,
    email varchar(100) not null unique,
    /* Quando o e-mail foi confirmado por código. NULL = não confirmado,
       e o login é recusado enquanto for NULL. É data, e não booleano,
       porque responde também "quando?" pelo mesmo espaço. */
    email_verified_at datetime null default null,
    password_hash varchar(60) not null,
    /* Anuláveis para que a exclusão de conta possa anonimizá-las. A
       obrigatoriedade no cadastro é regra do serviço, não da coluna. */
    nationality char(3) null default null,
    birth_date date null default null,
    pic_url varchar(255),
    bio varchar(280),
    created_at datetime default current_timestamp,
    deleted_at datetime null default null,

    primary key(id),
    foreign key(nationality) references countries(country),

    /* Busca de usuários: LIKE 'termo%' em full_name.
       alias e email já são indexados por serem unique. */
    index idx_user_nome (full_name)
);

/* Chat (suporta conversas privadas e grupos) */
create table if not exists chat(
    id char(36) not null,
    name varchar(100) null,
    is_group boolean default false,
    created_by char(36),
    created_at datetime default current_timestamp,

    primary key(id),
    foreign key(created_by) references user(id) on delete set null
);

/* Membros do chat */
create table if not exists chat_member(
    id char(36) not null,
    chat_id char(36) not null,
    user_id char(36),
    is_admin boolean default false,
    joined_at datetime default current_timestamp,
    left_at datetime null default null,

    primary key(id),
    unique key unique_member (chat_id, user_id),
    foreign key(chat_id) references chat(id) on delete cascade,
    foreign key(user_id) references user(id) on delete set null
);

/* Mensagens */
create table if not exists message(
    id char(36) not null,
    sender_id char(36),
    content text not null,
    created_at datetime default current_timestamp,
    deleted_by_sender datetime null default null,
    deleted_by_recipient datetime null default null,
    deleted_at datetime null default null,
    chat_id char(36),
    message_status enum("pending", "sent", "received", "read") not null default "pending",

    primary key(id),
    foreign key(sender_id) references user(id) on delete set null,
    foreign key(chat_id) references chat(id) on delete cascade
);

/* Postagens do feed */
create table if not exists post(
    id char(36) not null,
    user_id char(36) not null,
    content text not null,
    created_at datetime default current_timestamp,
    /* Preenchido na primeira edição. A interface exibe "editado" a partir
       dele: quem curtiu endossou o texto que leu. */
    edited_at datetime null default null,

    primary key(id),
    foreign key(user_id) references user(id) on delete cascade,

    /* Feed: ORDER BY created_at DESC, id DESC */
    index idx_post_created (created_at desc, id desc),
    /* Publicações de um perfil */
    index idx_post_autor (user_id, created_at desc),
    /* Busca por conteúdo. LIKE '%termo%' não usa índice; MATCH usa. */
    fulltext index idx_post_conteudo (content)
);

/* Comentários das postagens */
create table if not exists comment(
    id char(36) not null,
    post_id char(36) not null,
    /* Resposta a outro comentário — um nível só, com menção ao autor.
       A listagem permanece plana: sem árvore recursiva. */
    reply_to char(36) null default null,
    user_id char(36) not null,
    content text not null,
    created_at datetime default current_timestamp,
    /* Preenchido na primeira edição, dentro da janela de 15 minutos. */
    edited_at datetime null default null,

    primary key(id),
    foreign key(post_id) references post(id) on delete cascade,
    foreign key(user_id) references user(id) on delete cascade,
    /* SET NULL: apagar o comentário original não apaga as respostas. */
    foreign key(reply_to) references comment(id) on delete set null,

    /* WHERE post_id = ? ORDER BY created_at, e o COUNT(*) do card */
    index idx_comment_post (post_id, created_at)
);

/* Curtidas das postagens */
create table if not exists like_post(
    id char(36) not null,
    post_id char(36) not null,
    user_id char(36) not null,
    created_at datetime default current_timestamp,

    primary key(id),
    unique key unique_like (post_id, user_id),
    foreign key(post_id) references post(id) on delete cascade,
    foreign key(user_id) references user(id) on delete cascade
);

/* Relacionamentos de seguir */
create table if not exists follow(
    id char(36) not null,
    follower_id char(36) not null,
    following_id char(36) not null,
    created_at datetime default current_timestamp,

    primary key(id),
    unique key unique_follow (follower_id, following_id),
    foreign key(follower_id) references user(id) on delete cascade,
    foreign key(following_id) references user(id) on delete cascade
);


/* Códigos de verificação enviados por e-mail.

   Três propósitos: confirmar conta nova, trocar senha e excluir conta.
   O código é gravado como hash — se a tabela vazar, os hashes não
   permitem entrar em conta alguma. `attempts` limita o chute (um código
   de 6 dígitos é adivinhável por script sem esse limite) e `used_at`
   impede que o mesmo código sirva duas vezes. */
create table if not exists verification_code(
    id char(36) not null,
    user_id char(36) not null,
    purpose enum('signup', 'password_reset', 'account_deletion') not null,
    code_hash char(60) not null,
    expires_at datetime not null,
    used_at datetime null default null,
    attempts int not null default 0,
    created_at datetime default current_timestamp,

    primary key(id),
    foreign key(user_id) references user(id) on delete cascade,

    /* A consulta quente é "o último código deste usuário para este
       propósito"; o índice cobre exatamente ela. */
    index idx_verificacao_usuario_proposito (user_id, purpose, created_at)
);

/* Curtidas dos comentários */
create table if not exists like_comment(
    id char(36) not null,
    comment_id char(36) not null,
    user_id char(36) not null,
    created_at datetime default current_timestamp,

    primary key(id),
    unique key unique_like_comment (comment_id, user_id),
    foreign key(comment_id) references comment(id) on delete cascade,
    foreign key(user_id) references user(id) on delete cascade
);

/* A tabela `password_reset` existia aqui e foi removida do esquema.
   Ela guardava o código em TEXTO PURO e sem contagem de tentativas;
   `verification_code` a substituiu por completo, com hash e limite de
   chute, e atende os três fluxos em vez de um.

   Ela ainda existe em bancos criados antes desta limpeza, vazia e sem
   nenhum código a referenciando. Para removê-la de lá:

       DROP TABLE IF EXISTS password_reset;
*/


/* ------------------------------------------------------------
   Carga dos países.

   INSERT IGNORE, e não INSERT: `country` é PRIMARY KEY, então
   reexecutar o arquivo num banco já populado abortaria no
   primeiro duplicado. Com IGNORE, rodar de novo é inofensivo —
   o que já existe é pulado e o que faltava entra.
   ------------------------------------------------------------ */

INSERT IGNORE INTO countries (country, name) VALUES ('AFG', 'Afeganistão');
INSERT IGNORE INTO countries (country, name) VALUES ('ALB', 'Albânia');
INSERT IGNORE INTO countries (country, name) VALUES ('DEU', 'Alemanha');
INSERT IGNORE INTO countries (country, name) VALUES ('AND', 'Andorra');
INSERT IGNORE INTO countries (country, name) VALUES ('AGO', 'Angola');
INSERT IGNORE INTO countries (country, name) VALUES ('ATG', 'Antígua e Barbuda');
INSERT IGNORE INTO countries (country, name) VALUES ('ARG', 'Argentina');
INSERT IGNORE INTO countries (country, name) VALUES ('DZA', 'Argélia');
INSERT IGNORE INTO countries (country, name) VALUES ('ARM', 'Armênia');
INSERT IGNORE INTO countries (country, name) VALUES ('SAU', 'Arábia Saudita');
INSERT IGNORE INTO countries (country, name) VALUES ('AUS', 'Austrália');
INSERT IGNORE INTO countries (country, name) VALUES ('AZE', 'Azerbaijão');
INSERT IGNORE INTO countries (country, name) VALUES ('BHS', 'Bahamas');
INSERT IGNORE INTO countries (country, name) VALUES ('BHR', 'Bahrein');
INSERT IGNORE INTO countries (country, name) VALUES ('BGD', 'Bangladesh');
INSERT IGNORE INTO countries (country, name) VALUES ('BRB', 'Barbados');
INSERT IGNORE INTO countries (country, name) VALUES ('BLZ', 'Belize');
INSERT IGNORE INTO countries (country, name) VALUES ('BEN', 'Benim');
INSERT IGNORE INTO countries (country, name) VALUES ('BLR', 'Bielorrússia');
INSERT IGNORE INTO countries (country, name) VALUES ('BOL', 'Bolívia');
INSERT IGNORE INTO countries (country, name) VALUES ('BWA', 'Botsuana');
INSERT IGNORE INTO countries (country, name) VALUES ('BRA', 'Brasil');
INSERT IGNORE INTO countries (country, name) VALUES ('BRN', 'Brunei');
INSERT IGNORE INTO countries (country, name) VALUES ('BGR', 'Bulgária');
INSERT IGNORE INTO countries (country, name) VALUES ('BFA', 'Burquina Faso');
INSERT IGNORE INTO countries (country, name) VALUES ('BDI', 'Burundi');
INSERT IGNORE INTO countries (country, name) VALUES ('BTN', 'Butão');
INSERT IGNORE INTO countries (country, name) VALUES ('BEL', 'Bélgica');
INSERT IGNORE INTO countries (country, name) VALUES ('BIH', 'Bósnia e Herzegovina');
INSERT IGNORE INTO countries (country, name) VALUES ('CPV', 'Cabo Verde');
INSERT IGNORE INTO countries (country, name) VALUES ('CMR', 'Camarões');
INSERT IGNORE INTO countries (country, name) VALUES ('KHM', 'Camboja');
INSERT IGNORE INTO countries (country, name) VALUES ('CAN', 'Canadá');
INSERT IGNORE INTO countries (country, name) VALUES ('QAT', 'Catar');
INSERT IGNORE INTO countries (country, name) VALUES ('KAZ', 'Cazaquistão');
INSERT IGNORE INTO countries (country, name) VALUES ('TCD', 'Chade');
INSERT IGNORE INTO countries (country, name) VALUES ('CHL', 'Chile');
INSERT IGNORE INTO countries (country, name) VALUES ('CHN', 'China');
INSERT IGNORE INTO countries (country, name) VALUES ('CYP', 'Chipre');
INSERT IGNORE INTO countries (country, name) VALUES ('COL', 'Colômbia');
INSERT IGNORE INTO countries (country, name) VALUES ('COM', 'Comores');
INSERT IGNORE INTO countries (country, name) VALUES ('COG', 'Congo-Brazzaville');
INSERT IGNORE INTO countries (country, name) VALUES ('COD', 'Congo-Kinshasa');
INSERT IGNORE INTO countries (country, name) VALUES ('PRK', 'Coreia do Norte');
INSERT IGNORE INTO countries (country, name) VALUES ('KOR', 'Coreia do Sul');
INSERT IGNORE INTO countries (country, name) VALUES ('CRI', 'Costa Rica');
INSERT IGNORE INTO countries (country, name) VALUES ('CIV', 'Costa do Marfim');
INSERT IGNORE INTO countries (country, name) VALUES ('HRV', 'Croácia');
INSERT IGNORE INTO countries (country, name) VALUES ('CUB', 'Cuba');
INSERT IGNORE INTO countries (country, name) VALUES ('DNK', 'Dinamarca');
INSERT IGNORE INTO countries (country, name) VALUES ('DJI', 'Djibuti');
INSERT IGNORE INTO countries (country, name) VALUES ('DMA', 'Dominica');
INSERT IGNORE INTO countries (country, name) VALUES ('EGY', 'Egito');
INSERT IGNORE INTO countries (country, name) VALUES ('SLV', 'El Salvador');
INSERT IGNORE INTO countries (country, name) VALUES ('ARE', 'Emirados Árabes Unidos');
INSERT IGNORE INTO countries (country, name) VALUES ('ECU', 'Equador');
INSERT IGNORE INTO countries (country, name) VALUES ('ERI', 'Eritreia');
INSERT IGNORE INTO countries (country, name) VALUES ('SVK', 'Eslováquia');
INSERT IGNORE INTO countries (country, name) VALUES ('SVN', 'Eslovênia');
INSERT IGNORE INTO countries (country, name) VALUES ('ESP', 'Espanha');
INSERT IGNORE INTO countries (country, name) VALUES ('USA', 'Estados Unidos');
INSERT IGNORE INTO countries (country, name) VALUES ('EST', 'Estônia');
INSERT IGNORE INTO countries (country, name) VALUES ('SWZ', 'Eswatini');
INSERT IGNORE INTO countries (country, name) VALUES ('ETH', 'Etiópia');
INSERT IGNORE INTO countries (country, name) VALUES ('FJI', 'Fiji');
INSERT IGNORE INTO countries (country, name) VALUES ('PHL', 'Filipinas');
INSERT IGNORE INTO countries (country, name) VALUES ('FIN', 'Finlândia');
INSERT IGNORE INTO countries (country, name) VALUES ('FRA', 'França');
INSERT IGNORE INTO countries (country, name) VALUES ('GAB', 'Gabão');
INSERT IGNORE INTO countries (country, name) VALUES ('GHA', 'Gana');
INSERT IGNORE INTO countries (country, name) VALUES ('GEO', 'Geórgia');
INSERT IGNORE INTO countries (country, name) VALUES ('GRD', 'Granada');
INSERT IGNORE INTO countries (country, name) VALUES ('GRC', 'Grécia');
INSERT IGNORE INTO countries (country, name) VALUES ('GTM', 'Guatemala');
INSERT IGNORE INTO countries (country, name) VALUES ('GUY', 'Guiana');
INSERT IGNORE INTO countries (country, name) VALUES ('GIN', 'Guiné');
INSERT IGNORE INTO countries (country, name) VALUES ('GNQ', 'Guiné Equatorial');
INSERT IGNORE INTO countries (country, name) VALUES ('GNB', 'Guiné-Bissau');
INSERT IGNORE INTO countries (country, name) VALUES ('GMB', 'Gâmbia');
INSERT IGNORE INTO countries (country, name) VALUES ('HTI', 'Haiti');
INSERT IGNORE INTO countries (country, name) VALUES ('HND', 'Honduras');
INSERT IGNORE INTO countries (country, name) VALUES ('HUN', 'Hungria');
INSERT IGNORE INTO countries (country, name) VALUES ('MHL', 'Ilhas Marshall');
INSERT IGNORE INTO countries (country, name) VALUES ('SLB', 'Ilhas Salomão');
INSERT IGNORE INTO countries (country, name) VALUES ('IDN', 'Indonésia');
INSERT IGNORE INTO countries (country, name) VALUES ('IRQ', 'Iraque');
INSERT IGNORE INTO countries (country, name) VALUES ('IRL', 'Irlanda');
INSERT IGNORE INTO countries (country, name) VALUES ('IRN', 'Irã');
INSERT IGNORE INTO countries (country, name) VALUES ('ISL', 'Islândia');
INSERT IGNORE INTO countries (country, name) VALUES ('ISR', 'Israel');
INSERT IGNORE INTO countries (country, name) VALUES ('ITA', 'Itália');
INSERT IGNORE INTO countries (country, name) VALUES ('YEM', 'Iêmen');
INSERT IGNORE INTO countries (country, name) VALUES ('JAM', 'Jamaica');
INSERT IGNORE INTO countries (country, name) VALUES ('JPN', 'Japão');
INSERT IGNORE INTO countries (country, name) VALUES ('JOR', 'Jordânia');
INSERT IGNORE INTO countries (country, name) VALUES ('KWT', 'Kuwait');
INSERT IGNORE INTO countries (country, name) VALUES ('LAO', 'Laos');
INSERT IGNORE INTO countries (country, name) VALUES ('LSO', 'Lesoto');
INSERT IGNORE INTO countries (country, name) VALUES ('LVA', 'Letônia');
INSERT IGNORE INTO countries (country, name) VALUES ('LBR', 'Libéria');
INSERT IGNORE INTO countries (country, name) VALUES ('LIE', 'Liechtenstein');
INSERT IGNORE INTO countries (country, name) VALUES ('LTU', 'Lituânia');
INSERT IGNORE INTO countries (country, name) VALUES ('LUX', 'Luxemburgo');
INSERT IGNORE INTO countries (country, name) VALUES ('LBN', 'Líbano');
INSERT IGNORE INTO countries (country, name) VALUES ('LBY', 'Líbia');
INSERT IGNORE INTO countries (country, name) VALUES ('MKD', 'Macedônia do Norte');
INSERT IGNORE INTO countries (country, name) VALUES ('MDG', 'Madagascar');
INSERT IGNORE INTO countries (country, name) VALUES ('MWI', 'Malawi');
INSERT IGNORE INTO countries (country, name) VALUES ('MDV', 'Maldivas');
INSERT IGNORE INTO countries (country, name) VALUES ('MLI', 'Mali');
INSERT IGNORE INTO countries (country, name) VALUES ('MLT', 'Malta');
INSERT IGNORE INTO countries (country, name) VALUES ('MYS', 'Malásia');
INSERT IGNORE INTO countries (country, name) VALUES ('MAR', 'Marrocos');
INSERT IGNORE INTO countries (country, name) VALUES ('MRT', 'Mauritânia');
INSERT IGNORE INTO countries (country, name) VALUES ('MUS', 'Maurício');
INSERT IGNORE INTO countries (country, name) VALUES ('MMR', 'Mianmar');
INSERT IGNORE INTO countries (country, name) VALUES ('FSM', 'Micronésia');
INSERT IGNORE INTO countries (country, name) VALUES ('MDA', 'Moldávia');
INSERT IGNORE INTO countries (country, name) VALUES ('MNG', 'Mongólia');
INSERT IGNORE INTO countries (country, name) VALUES ('MNE', 'Montenegro');
INSERT IGNORE INTO countries (country, name) VALUES ('MOZ', 'Moçambique');
INSERT IGNORE INTO countries (country, name) VALUES ('MEX', 'México');
INSERT IGNORE INTO countries (country, name) VALUES ('MCO', 'Mônaco');
INSERT IGNORE INTO countries (country, name) VALUES ('NAM', 'Namíbia');
INSERT IGNORE INTO countries (country, name) VALUES ('NRU', 'Nauru');
INSERT IGNORE INTO countries (country, name) VALUES ('NPL', 'Nepal');
INSERT IGNORE INTO countries (country, name) VALUES ('NIC', 'Nicarágua');
INSERT IGNORE INTO countries (country, name) VALUES ('NGA', 'Nigéria');
INSERT IGNORE INTO countries (country, name) VALUES ('NOR', 'Noruega');
INSERT IGNORE INTO countries (country, name) VALUES ('NZL', 'Nova Zelândia');
INSERT IGNORE INTO countries (country, name) VALUES ('NER', 'Níger');
INSERT IGNORE INTO countries (country, name) VALUES ('OMN', 'Omã');
INSERT IGNORE INTO countries (country, name) VALUES ('PLW', 'Palau');
INSERT IGNORE INTO countries (country, name) VALUES ('PAN', 'Panamá');
INSERT IGNORE INTO countries (country, name) VALUES ('PNG', 'Papua-Nova Guiné');
INSERT IGNORE INTO countries (country, name) VALUES ('PAK', 'Paquistão');
INSERT IGNORE INTO countries (country, name) VALUES ('PRY', 'Paraguai');
INSERT IGNORE INTO countries (country, name) VALUES ('NLD', 'Países Baixos');
INSERT IGNORE INTO countries (country, name) VALUES ('PER', 'Peru');
INSERT IGNORE INTO countries (country, name) VALUES ('POL', 'Polônia');
INSERT IGNORE INTO countries (country, name) VALUES ('PRT', 'Portugal');
INSERT IGNORE INTO countries (country, name) VALUES ('KGZ', 'Querguistão');
INSERT IGNORE INTO countries (country, name) VALUES ('KEN', 'Quênia');
INSERT IGNORE INTO countries (country, name) VALUES ('GBR', 'Reino Unido');
INSERT IGNORE INTO countries (country, name) VALUES ('CAF', 'República Centro-Africana');
INSERT IGNORE INTO countries (country, name) VALUES ('CZE', 'República Checa');
INSERT IGNORE INTO countries (country, name) VALUES ('DOM', 'República Dominicana');
INSERT IGNORE INTO countries (country, name) VALUES ('ROU', 'Romênia');
INSERT IGNORE INTO countries (country, name) VALUES ('RWA', 'Ruanda');
INSERT IGNORE INTO countries (country, name) VALUES ('RUS', 'Rússia');
INSERT IGNORE INTO countries (country, name) VALUES ('WSM', 'Samoa');
INSERT IGNORE INTO countries (country, name) VALUES ('SMR', 'San Marino');
INSERT IGNORE INTO countries (country, name) VALUES ('LCA', 'Santa Lúcia');
INSERT IGNORE INTO countries (country, name) VALUES ('SYC', 'Seicheles');
INSERT IGNORE INTO countries (country, name) VALUES ('SEN', 'Senegal');
INSERT IGNORE INTO countries (country, name) VALUES ('SLE', 'Serra Leoa');
INSERT IGNORE INTO countries (country, name) VALUES ('SGP', 'Singapura');
INSERT IGNORE INTO countries (country, name) VALUES ('SOM', 'Somália');
INSERT IGNORE INTO countries (country, name) VALUES ('LKA', 'Sri Lanka');
INSERT IGNORE INTO countries (country, name) VALUES ('SDN', 'Sudão');
INSERT IGNORE INTO countries (country, name) VALUES ('SSD', 'Sudão do Sul');
INSERT IGNORE INTO countries (country, name) VALUES ('SUR', 'Suriname');
INSERT IGNORE INTO countries (country, name) VALUES ('SWE', 'Suécia');
INSERT IGNORE INTO countries (country, name) VALUES ('CHE', 'Suíça');
INSERT IGNORE INTO countries (country, name) VALUES ('KNA', 'São Cristóvão e Neves');
INSERT IGNORE INTO countries (country, name) VALUES ('STP', 'São Tomé e Príncipe');
INSERT IGNORE INTO countries (country, name) VALUES ('VCT', 'São Vicente e Granadinhas');
INSERT IGNORE INTO countries (country, name) VALUES ('SRB', 'Sérvia');
INSERT IGNORE INTO countries (country, name) VALUES ('SYR', 'Síria');
INSERT IGNORE INTO countries (country, name) VALUES ('THA', 'Tailândia');
INSERT IGNORE INTO countries (country, name) VALUES ('TWN', 'Taiwan');
INSERT IGNORE INTO countries (country, name) VALUES ('TJK', 'Tajiquistão');
INSERT IGNORE INTO countries (country, name) VALUES ('TZA', 'Tanzânia');
INSERT IGNORE INTO countries (country, name) VALUES ('TLS', 'Timor-Leste');
INSERT IGNORE INTO countries (country, name) VALUES ('TGO', 'Togo');
INSERT IGNORE INTO countries (country, name) VALUES ('TON', 'Tonga');
INSERT IGNORE INTO countries (country, name) VALUES ('TTO', 'Trinidad e Tobago');
INSERT IGNORE INTO countries (country, name) VALUES ('TUN', 'Tunísia');
INSERT IGNORE INTO countries (country, name) VALUES ('TKM', 'Turcomenistão');
INSERT IGNORE INTO countries (country, name) VALUES ('TUR', 'Turquia');
INSERT IGNORE INTO countries (country, name) VALUES ('TUV', 'Tuvalu');
INSERT IGNORE INTO countries (country, name) VALUES ('UKR', 'Ucrânia');
INSERT IGNORE INTO countries (country, name) VALUES ('UGA', 'Uganda');
INSERT IGNORE INTO countries (country, name) VALUES ('URY', 'Uruguai');
INSERT IGNORE INTO countries (country, name) VALUES ('UZB', 'Uzbequistão');
INSERT IGNORE INTO countries (country, name) VALUES ('VUT', 'Vanuatu');
INSERT IGNORE INTO countries (country, name) VALUES ('VAT', 'Vaticano');
INSERT IGNORE INTO countries (country, name) VALUES ('VEN', 'Venezuela');
INSERT IGNORE INTO countries (country, name) VALUES ('VNM', 'Vietnã');
INSERT IGNORE INTO countries (country, name) VALUES ('ZWE', 'Zimbábue');
INSERT IGNORE INTO countries (country, name) VALUES ('ZMB', 'Zâmbia');
INSERT IGNORE INTO countries (country, name) VALUES ('AUT', 'Áustria');
INSERT IGNORE INTO countries (country, name) VALUES ('IND', 'Índia');