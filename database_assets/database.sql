/* ============================================================
   Blabry — esquema completo
   ------------------------------------------------------------
   Este arquivo cria o banco do zero, já com todas as decisões
   tomadas até aqui. Para evoluir um banco que já existe, use os
   arquivos em migrations/ — o `create table if not exists` abaixo
   NÃO adiciona colunas a tabelas existentes.

   utf8mb4 é obrigatório: os nomes de países têm acentos e os posts
   têm emojis, que ocupam 4 bytes e não cabem no utf8 do MySQL.
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
    password_hash varchar(60) not null,
    nationality char(3) not null,
    birth_date date not null,
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

create table if not exists password_reset (
    id char(36) not null,
    user_id char(36) not null,
    code char(6) not null,
    expires_at datetime not null,
    used boolean default false,
    created_at datetime default current_timestamp,

    primary key(id),
    foreign key(user_id) references user(id) on delete cascade
);

INSERT INTO countries (country, name) VALUES ('AFG', 'Afeganistão');
INSERT INTO countries (country, name) VALUES ('ALB', 'Albânia');
INSERT INTO countries (country, name) VALUES ('DEU', 'Alemanha');
INSERT INTO countries (country, name) VALUES ('AND', 'Andorra');
INSERT INTO countries (country, name) VALUES ('AGO', 'Angola');
INSERT INTO countries (country, name) VALUES ('ATG', 'Antígua e Barbuda');
INSERT INTO countries (country, name) VALUES ('ARG', 'Argentina');
INSERT INTO countries (country, name) VALUES ('DZA', 'Argélia');
INSERT INTO countries (country, name) VALUES ('ARM', 'Armênia');
INSERT INTO countries (country, name) VALUES ('SAU', 'Arábia Saudita');
INSERT INTO countries (country, name) VALUES ('AUS', 'Austrália');
INSERT INTO countries (country, name) VALUES ('AZE', 'Azerbaijão');
INSERT INTO countries (country, name) VALUES ('BHS', 'Bahamas');
INSERT INTO countries (country, name) VALUES ('BHR', 'Bahrein');
INSERT INTO countries (country, name) VALUES ('BGD', 'Bangladesh');
INSERT INTO countries (country, name) VALUES ('BRB', 'Barbados');
INSERT INTO countries (country, name) VALUES ('BLZ', 'Belize');
INSERT INTO countries (country, name) VALUES ('BEN', 'Benim');
INSERT INTO countries (country, name) VALUES ('BLR', 'Bielorrússia');
INSERT INTO countries (country, name) VALUES ('BOL', 'Bolívia');
INSERT INTO countries (country, name) VALUES ('BWA', 'Botsuana');
INSERT INTO countries (country, name) VALUES ('BRA', 'Brasil');
INSERT INTO countries (country, name) VALUES ('BRN', 'Brunei');
INSERT INTO countries (country, name) VALUES ('BGR', 'Bulgária');
INSERT INTO countries (country, name) VALUES ('BFA', 'Burquina Faso');
INSERT INTO countries (country, name) VALUES ('BDI', 'Burundi');
INSERT INTO countries (country, name) VALUES ('BTN', 'Butão');
INSERT INTO countries (country, name) VALUES ('BEL', 'Bélgica');
INSERT INTO countries (country, name) VALUES ('BIH', 'Bósnia e Herzegovina');
INSERT INTO countries (country, name) VALUES ('CPV', 'Cabo Verde');
INSERT INTO countries (country, name) VALUES ('CMR', 'Camarões');
INSERT INTO countries (country, name) VALUES ('KHM', 'Camboja');
INSERT INTO countries (country, name) VALUES ('CAN', 'Canadá');
INSERT INTO countries (country, name) VALUES ('QAT', 'Catar');
INSERT INTO countries (country, name) VALUES ('KAZ', 'Cazaquistão');
INSERT INTO countries (country, name) VALUES ('TCD', 'Chade');
INSERT INTO countries (country, name) VALUES ('CHL', 'Chile');
INSERT INTO countries (country, name) VALUES ('CHN', 'China');
INSERT INTO countries (country, name) VALUES ('CYP', 'Chipre');
INSERT INTO countries (country, name) VALUES ('COL', 'Colômbia');
INSERT INTO countries (country, name) VALUES ('COM', 'Comores');
INSERT INTO countries (country, name) VALUES ('COG', 'Congo-Brazzaville');
INSERT INTO countries (country, name) VALUES ('COD', 'Congo-Kinshasa');
INSERT INTO countries (country, name) VALUES ('PRK', 'Coreia do Norte');
INSERT INTO countries (country, name) VALUES ('KOR', 'Coreia do Sul');
INSERT INTO countries (country, name) VALUES ('CRI', 'Costa Rica');
INSERT INTO countries (country, name) VALUES ('CIV', 'Costa do Marfim');
INSERT INTO countries (country, name) VALUES ('HRV', 'Croácia');
INSERT INTO countries (country, name) VALUES ('CUB', 'Cuba');
INSERT INTO countries (country, name) VALUES ('DNK', 'Dinamarca');
INSERT INTO countries (country, name) VALUES ('DJI', 'Djibuti');
INSERT INTO countries (country, name) VALUES ('DMA', 'Dominica');
INSERT INTO countries (country, name) VALUES ('EGY', 'Egito');
INSERT INTO countries (country, name) VALUES ('SLV', 'El Salvador');
INSERT INTO countries (country, name) VALUES ('ARE', 'Emirados Árabes Unidos');
INSERT INTO countries (country, name) VALUES ('ECU', 'Equador');
INSERT INTO countries (country, name) VALUES ('ERI', 'Eritreia');
INSERT INTO countries (country, name) VALUES ('SVK', 'Eslováquia');
INSERT INTO countries (country, name) VALUES ('SVN', 'Eslovênia');
INSERT INTO countries (country, name) VALUES ('ESP', 'Espanha');
INSERT INTO countries (country, name) VALUES ('USA', 'Estados Unidos');
INSERT INTO countries (country, name) VALUES ('EST', 'Estônia');
INSERT INTO countries (country, name) VALUES ('SWZ', 'Eswatini');
INSERT INTO countries (country, name) VALUES ('ETH', 'Etiópia');
INSERT INTO countries (country, name) VALUES ('FJI', 'Fiji');
INSERT INTO countries (country, name) VALUES ('PHL', 'Filipinas');
INSERT INTO countries (country, name) VALUES ('FIN', 'Finlândia');
INSERT INTO countries (country, name) VALUES ('FRA', 'França');
INSERT INTO countries (country, name) VALUES ('GAB', 'Gabão');
INSERT INTO countries (country, name) VALUES ('GHA', 'Gana');
INSERT INTO countries (country, name) VALUES ('GEO', 'Geórgia');
INSERT INTO countries (country, name) VALUES ('GRD', 'Granada');
INSERT INTO countries (country, name) VALUES ('GRC', 'Grécia');
INSERT INTO countries (country, name) VALUES ('GTM', 'Guatemala');
INSERT INTO countries (country, name) VALUES ('GUY', 'Guiana');
INSERT INTO countries (country, name) VALUES ('GIN', 'Guiné');
INSERT INTO countries (country, name) VALUES ('GNQ', 'Guiné Equatorial');
INSERT INTO countries (country, name) VALUES ('GNB', 'Guiné-Bissau');
INSERT INTO countries (country, name) VALUES ('GMB', 'Gâmbia');
INSERT INTO countries (country, name) VALUES ('HTI', 'Haiti');
INSERT INTO countries (country, name) VALUES ('HND', 'Honduras');
INSERT INTO countries (country, name) VALUES ('HUN', 'Hungria');
INSERT INTO countries (country, name) VALUES ('MHL', 'Ilhas Marshall');
INSERT INTO countries (country, name) VALUES ('SLB', 'Ilhas Salomão');
INSERT INTO countries (country, name) VALUES ('IDN', 'Indonésia');
INSERT INTO countries (country, name) VALUES ('IRQ', 'Iraque');
INSERT INTO countries (country, name) VALUES ('IRL', 'Irlanda');
INSERT INTO countries (country, name) VALUES ('IRN', 'Irã');
INSERT INTO countries (country, name) VALUES ('ISL', 'Islândia');
INSERT INTO countries (country, name) VALUES ('ISR', 'Israel');
INSERT INTO countries (country, name) VALUES ('ITA', 'Itália');
INSERT INTO countries (country, name) VALUES ('YEM', 'Iêmen');
INSERT INTO countries (country, name) VALUES ('JAM', 'Jamaica');
INSERT INTO countries (country, name) VALUES ('JPN', 'Japão');
INSERT INTO countries (country, name) VALUES ('JOR', 'Jordânia');
INSERT INTO countries (country, name) VALUES ('KWT', 'Kuwait');
INSERT INTO countries (country, name) VALUES ('LAO', 'Laos');
INSERT INTO countries (country, name) VALUES ('LSO', 'Lesoto');
INSERT INTO countries (country, name) VALUES ('LVA', 'Letônia');
INSERT INTO countries (country, name) VALUES ('LBR', 'Libéria');
INSERT INTO countries (country, name) VALUES ('LIE', 'Liechtenstein');
INSERT INTO countries (country, name) VALUES ('LTU', 'Lituânia');
INSERT INTO countries (country, name) VALUES ('LUX', 'Luxemburgo');
INSERT INTO countries (country, name) VALUES ('LBN', 'Líbano');
INSERT INTO countries (country, name) VALUES ('LBY', 'Líbia');
INSERT INTO countries (country, name) VALUES ('MKD', 'Macedônia do Norte');
INSERT INTO countries (country, name) VALUES ('MDG', 'Madagascar');
INSERT INTO countries (country, name) VALUES ('MWI', 'Malawi');
INSERT INTO countries (country, name) VALUES ('MDV', 'Maldivas');
INSERT INTO countries (country, name) VALUES ('MLI', 'Mali');
INSERT INTO countries (country, name) VALUES ('MLT', 'Malta');
INSERT INTO countries (country, name) VALUES ('MYS', 'Malásia');
INSERT INTO countries (country, name) VALUES ('MAR', 'Marrocos');
INSERT INTO countries (country, name) VALUES ('MRT', 'Mauritânia');
INSERT INTO countries (country, name) VALUES ('MUS', 'Maurício');
INSERT INTO countries (country, name) VALUES ('MMR', 'Mianmar');
INSERT INTO countries (country, name) VALUES ('FSM', 'Micronésia');
INSERT INTO countries (country, name) VALUES ('MDA', 'Moldávia');
INSERT INTO countries (country, name) VALUES ('MNG', 'Mongólia');
INSERT INTO countries (country, name) VALUES ('MNE', 'Montenegro');
INSERT INTO countries (country, name) VALUES ('MOZ', 'Moçambique');
INSERT INTO countries (country, name) VALUES ('MEX', 'México');
INSERT INTO countries (country, name) VALUES ('MCO', 'Mônaco');
INSERT INTO countries (country, name) VALUES ('NAM', 'Namíbia');
INSERT INTO countries (country, name) VALUES ('NRU', 'Nauru');
INSERT INTO countries (country, name) VALUES ('NPL', 'Nepal');
INSERT INTO countries (country, name) VALUES ('NIC', 'Nicarágua');
INSERT INTO countries (country, name) VALUES ('NGA', 'Nigéria');
INSERT INTO countries (country, name) VALUES ('NOR', 'Noruega');
INSERT INTO countries (country, name) VALUES ('NZL', 'Nova Zelândia');
INSERT INTO countries (country, name) VALUES ('NER', 'Níger');
INSERT INTO countries (country, name) VALUES ('OMN', 'Omã');
INSERT INTO countries (country, name) VALUES ('PLW', 'Palau');
INSERT INTO countries (country, name) VALUES ('PAN', 'Panamá');
INSERT INTO countries (country, name) VALUES ('PNG', 'Papua-Nova Guiné');
INSERT INTO countries (country, name) VALUES ('PAK', 'Paquistão');
INSERT INTO countries (country, name) VALUES ('PRY', 'Paraguai');
INSERT INTO countries (country, name) VALUES ('NLD', 'Países Baixos');
INSERT INTO countries (country, name) VALUES ('PER', 'Peru');
INSERT INTO countries (country, name) VALUES ('POL', 'Polônia');
INSERT INTO countries (country, name) VALUES ('PRT', 'Portugal');
INSERT INTO countries (country, name) VALUES ('KGZ', 'Querguistão');
INSERT INTO countries (country, name) VALUES ('KEN', 'Quênia');
INSERT INTO countries (country, name) VALUES ('GBR', 'Reino Unido');
INSERT INTO countries (country, name) VALUES ('CAF', 'República Centro-Africana');
INSERT INTO countries (country, name) VALUES ('CZE', 'República Checa');
INSERT INTO countries (country, name) VALUES ('DOM', 'República Dominicana');
INSERT INTO countries (country, name) VALUES ('ROU', 'Romênia');
INSERT INTO countries (country, name) VALUES ('RWA', 'Ruanda');
INSERT INTO countries (country, name) VALUES ('RUS', 'Rússia');
INSERT INTO countries (country, name) VALUES ('WSM', 'Samoa');
INSERT INTO countries (country, name) VALUES ('SMR', 'San Marino');
INSERT INTO countries (country, name) VALUES ('LCA', 'Santa Lúcia');
INSERT INTO countries (country, name) VALUES ('SYC', 'Seicheles');
INSERT INTO countries (country, name) VALUES ('SEN', 'Senegal');
INSERT INTO countries (country, name) VALUES ('SLE', 'Serra Leoa');
INSERT INTO countries (country, name) VALUES ('SGP', 'Singapura');
INSERT INTO countries (country, name) VALUES ('SOM', 'Somália');
INSERT INTO countries (country, name) VALUES ('LKA', 'Sri Lanka');
INSERT INTO countries (country, name) VALUES ('SDN', 'Sudão');
INSERT INTO countries (country, name) VALUES ('SSD', 'Sudão do Sul');
INSERT INTO countries (country, name) VALUES ('SUR', 'Suriname');
INSERT INTO countries (country, name) VALUES ('SWE', 'Suécia');
INSERT INTO countries (country, name) VALUES ('CHE', 'Suíça');
INSERT INTO countries (country, name) VALUES ('KNA', 'São Cristóvão e Neves');
INSERT INTO countries (country, name) VALUES ('STP', 'São Tomé e Príncipe');
INSERT INTO countries (country, name) VALUES ('VCT', 'São Vicente e Granadinhas');
INSERT INTO countries (country, name) VALUES ('SRB', 'Sérvia');
INSERT INTO countries (country, name) VALUES ('SYR', 'Síria');
INSERT INTO countries (country, name) VALUES ('THA', 'Tailândia');
INSERT INTO countries (country, name) VALUES ('TWN', 'Taiwan');
INSERT INTO countries (country, name) VALUES ('TJK', 'Tajiquistão');
INSERT INTO countries (country, name) VALUES ('TZA', 'Tanzânia');
INSERT INTO countries (country, name) VALUES ('TLS', 'Timor-Leste');
INSERT INTO countries (country, name) VALUES ('TGO', 'Togo');
INSERT INTO countries (country, name) VALUES ('TON', 'Tonga');
INSERT INTO countries (country, name) VALUES ('TTO', 'Trinidad e Tobago');
INSERT INTO countries (country, name) VALUES ('TUN', 'Tunísia');
INSERT INTO countries (country, name) VALUES ('TKM', 'Turcomenistão');
INSERT INTO countries (country, name) VALUES ('TUR', 'Turquia');
INSERT INTO countries (country, name) VALUES ('TUV', 'Tuvalu');
INSERT INTO countries (country, name) VALUES ('UKR', 'Ucrânia');
INSERT INTO countries (country, name) VALUES ('UGA', 'Uganda');
INSERT INTO countries (country, name) VALUES ('URY', 'Uruguai');
INSERT INTO countries (country, name) VALUES ('UZB', 'Uzbequistão');
INSERT INTO countries (country, name) VALUES ('VUT', 'Vanuatu');
INSERT INTO countries (country, name) VALUES ('VAT', 'Vaticano');
INSERT INTO countries (country, name) VALUES ('VEN', 'Venezuela');
INSERT INTO countries (country, name) VALUES ('VNM', 'Vietnã');
INSERT INTO countries (country, name) VALUES ('ZWE', 'Zimbábue');
INSERT INTO countries (country, name) VALUES ('ZMB', 'Zâmbia');
INSERT INTO countries (country, name) VALUES ('AUT', 'Áustria');
INSERT INTO countries (country, name) VALUES ('IND', 'Índia');