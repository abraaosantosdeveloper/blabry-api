create database if not exists chat_app;
use chat_app;

create table users (
    id         int          not null auto_increment,
    full_name	varchar(120) not null,
    username   varchar(30)  not null unique,
    email      varchar(120) not null unique,
    pswd       varchar(64)  not null,
    created_at datetime     default current_timestamp,
    primary key (id)
);

create table conversations (
    id         int      not null auto_increment,
    user1_id   int      not null,
    user2_id   int      not null,
    created_at datetime default current_timestamp,
    primary key (id),
    unique key uq_pair (user1_id, user2_id),
    check (user1_id < user2_id),
    foreign key (user1_id) references users(id) on delete cascade,
    foreign key (user2_id) references users(id) on delete cascade
);

create table messages (
    id              int           not null auto_increment,
    conversation_id int           not null,
    sender_id       int           not null,
    content         varchar(5000) not null,
    created_at      datetime      default current_timestamp,
    primary key (id),
    foreign key (conversation_id) references conversations(id) on delete cascade,
    foreign key (sender_id)       references users(id) on delete cascade
);