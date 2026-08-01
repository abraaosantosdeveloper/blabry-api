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
    id int not null auto_increment,
    full_name varchar(100) not null,
    alias varchar(100) not null,
    email varchar(100) not null,
    password_hash varchar(60) not null,
    nationality char(3) not null,
    birth_date date not null,
    created_at datetime default current_timestamp,
    deleted_at datetime null default null,

    primary key(id),
    foreign key(nationality) references countries(country)
);

/* Chat (seção que contém registros de mensagens agrupados) */
create table if not exists chat(
	id int not null auto_increment,
    user_a_id int,
    user_b_id int,
    created_at datetime default current_timestamp,
    deleted_by_a datetime null default null,
    deleted_by_b datetime null default null,
    
    primary key(id),
    unique key unique_chat (user_a_id, user_b_id),
    foreign key(user_a_id) references user(id) on delete set null,
    foreign key(user_b_id) references user(id) on delete set null
);

/* Mensagens */
create table if not exists message(
	id int not null auto_increment,
    sender_id int,
    recipient_id int,
    content text not null,
    created_at datetime default current_timestamp,
    deleted_by_sender datetime null default null,
    deleted_by_recipient datetime null default null,
    deleted_at datetime null default null,
    chat_id int,
    message_status enum("pending", "sent", "received", "read") not null default "pending",
    
    primary key(id),
    foreign key(sender_id) references user(id) on delete set null,
    foreign key(recipient_id) references user(id) on delete set null,
    foreign key(chat_id) references chat(id) on delete cascade
);
