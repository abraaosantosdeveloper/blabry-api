create database if not exists blabry_db;
use blabry_db;

/* Países para a nacionalidade */
create table if not exists countries(
    id int not null auto_increment,
    country char(3) not null unique,
    primary key(id)
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
    created_at datetime default current_timestamp,
    deleted_at datetime null default null,

    primary key(id),
    foreign key(nationality) references countries(country)
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

    primary key(id),
    foreign key(user_id) references user(id) on delete cascade
);

/* Comentários das postagens */
create table if not exists comment(
    id char(36) not null,
    post_id char(36) not null,
    user_id char(36) not null,
    content text not null,
    created_at datetime default current_timestamp,

    primary key(id),
    foreign key(post_id) references post(id) on delete cascade,
    foreign key(user_id) references user(id) on delete cascade
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

INSERT INTO countries (country) VALUES ('BRA');