const { time } = require('console');
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const timestamp = new Date().toLocaleString();
        const method = req.method;
        const url = req.originalUrl;
        const status = res.statusCode;

        // Exibe, no console, os códigos de estado das respostas
        console.log(`${timestamp} - "${url}" - ${status} - ${method}`);
    })
    next();
});

app.get('/', (req, res)=>{
    res.send("Hello, world!");
});

app.get('/usuarios', (req, res) => {
    const {userID} = req.query;
    const query = "SELECT * FROM usuarios";
});

app.get('/chats', (req, res) => {
    const {chatID} = req.query;
});

app.listen(PORT, ()=>{

    /* API start */
    console.log("\n======================= API Information =======================\n");
    console.log("\t🚀 Chat App API: \t\t Starting...");
    sleep(1000).then(() => {
        console.log(`\n\t🌐 API status: \t\t\t On-line!`);
        sleep(1000).then(() => {
            console.log(`\n\t🔗 Address: \t\t\t http://127.0.0.1:${PORT}`);
            console.log("\n===============================================================\n");

        });
        
    });
});