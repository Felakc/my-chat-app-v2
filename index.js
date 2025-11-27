// index.js (Финальная версия сервера с Аутентификацией, Историей и Картинками)

// --- A. Инициализация Модулей и БД ---
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mongoose = require('mongoose'); 
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 🚨🚨 ВАШ РАБОЧИЙ АДРЕС MONGODB 🚨🚨
const dbURI = 'mongodb+srv://felak:Felak22113d@chatdb.sf9erka.mongodb.net/chat_db'; 

const JWT_SECRET = 'my_super_secret_key_12345'; 
const saltRounds = 10; 

mongoose.connect(dbURI)
  .then(() => console.log('Подключение к MongoDB установлено'))
  .catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Схемы для сообщений и пользователей
const Message = mongoose.model('Message', new mongoose.Schema({ sender: String, msg: String, timestamp: { type: Date, default: Date.now } }));
const User = mongoose.model('User', new mongoose.Schema({ username: { type: String, required: true, unique: true }, password: { type: String, required: true } })); 

// --- B. Вспомогательные функции и карта пользователей ---
const PORT = process.env.PORT || 3000;
const users = new Map(); 

// --- C. Отдача Клиентского Файла ---
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- D. Логика Socket.IO ---
io.on('connection', async (socket) => {

    // РЕГИСТРАЦИЯ
    socket.on('register', async ({ username, password }) => {
        try {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            const user = new User({ username, password: hashedPassword });
            await user.save();
            socket.emit('auth message', 'Регистрация успешна! Теперь Вы можете войти.');
        } catch (err) {
            socket.emit('auth error', 'Ошибка регистрации. Имя пользователя уже занято.');
        }
    });

    // ВХОД
    socket.on('login', async ({ username, password }) => {
        try {
            const user = await User.findOne({ username });
            if (!user) {
                return socket.emit('auth error', 'Неверное имя пользователя или пароль.');
            }
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return socket.emit('auth error', 'Неверное имя пользователя или пароль.');
            }

            const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1h' });
            socket.emit('auth success', { username: user.username, token });
        } catch (err) {
            socket.emit('auth error', 'Ошибка входа.');
        }
    });
    
    // АУТЕНТИКАЦИЯ / ИСТОРИЯ
    socket.on('authenticate', async (username) => {
        socket.username = username;
        users.set(username, socket.id);
        io.emit('chat message', { sender: '[СИСТЕМА]', msg: `Пользователь ${username} подключился.` });
        try {
            const history = await Message.find().sort({ timestamp: -1 }).limit(100);
            socket.emit('history', history.reverse()); 
        } catch (err) {
            console.error('Ошибка загрузки истории:', err);
        }
    });

    // СООБЩЕНИЯ И КАРТИНКИ
    socket.on('chat message', (data) => {
        if (!socket.username) return socket.emit('chat message', { sender: '[СИСТЕМА]', msg: 'Сначала войдите в систему!' });
        
        // В MongoDB сохраняем только текст
        if (!data.fileData && data.msg) {
            const messageModel = new Message({ sender: data.sender, msg: data.msg });
            messageModel.save();
        }
        
        if (data.receiver) {
            // ПРИВАТНОЕ
            const receiverSocketId = users.get(data.receiver);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('chat message', data);
                socket.emit('chat message', data); 
            } else {
                socket.emit('chat message', { sender: '[СИСТЕМА]', msg: `Пользователь ${data.receiver} не в сети.` });
            }
        } else {
            // ОБЩИЙ ЧАТ
            io.emit('chat message', data); 
        }
    });
  
    // ОТКЛЮЧЕНИЕ
    socket.on('disconnect', () => {
        if (socket.username) {
            users.delete(socket.username);
            io.emit('chat message', { sender: '[СИСТЕМА]', msg: `Пользователь ${socket.username} отключился.` });
        }
    });
});

// --- E. Запуск Сервера ---
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});