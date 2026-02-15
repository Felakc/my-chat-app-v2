const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Подключение к MongoDB
mongoose.connect('mongodb+srv://felak:Felak22113d@chatdb.sf9erka.mongodb.net/chat_db')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('DB Error:', err));

// Схема пользователя
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Схема сообщения (теперь с полем room)
const messageSchema = new mongoose.Schema({
    room: String, 
    username: String,
    text: String,
    type: { type: String, default: 'text' },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

app.use(express.static(__dirname));
app.use(express.json());

// API для регистрации и логина
app.post('/register', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).send({ status: 'ok' });
    } catch (e) { res.status(400).send({ status: 'error' }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne(req.body);
    if (user) res.send({ status: 'ok' });
    else res.status(401).send({ status: 'error' });
});

// API для получения списка всех пользователей (для боковой панели)
app.get('/users', async (req, res) => {
    const users = await User.find({}, 'username');
    res.send(users);
});

// Socket.io логика
io.on('connection', (socket) => {
    socket.on('join room', async (room) => {
        socket.rooms.forEach(r => socket.leave(r)); // Выходим из старых комнат
        socket.join(room);
        
        // Загружаем историю только этой комнаты
        const history = await Message.find({ room }).sort({ timestamp: 1 }).limit(50);
        socket.emit('chat history', history);
    });

    socket.on('chat message', async (data) => {
        const { room, msg, sender, type } = data;
        const newMessage = new Message({ room, username: sender, text: msg, type: type || 'text' });
        await newMessage.save();
        io.to(room).emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));