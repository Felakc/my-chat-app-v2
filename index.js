const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

// ПОДКЛЮЧЕНИЕ К БАЗЕ
mongoose.connect('mongodb+srv://felak:Felak22113d@chatdb.sf9erka.mongodb.net/chat_db')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('DB Error:', err));

// МОДЕЛИ ДАННЫХ
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true },
    tag: { type: String, unique: true }, 
    password: { type: String, required: true }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String, 
    username: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
}));

app.use(express.static(__dirname));
app.use(express.json());

const userSockets = {};

// РЕГИСТРАЦИЯ И ВХОД
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const tag = `${username}#${Math.floor(1000 + Math.random() * 9000)}`;
    await new User({ username, tag, password }).save();
    res.send({ status: 'ok', tag });
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username, password: req.body.password });
    if (!user) return res.send({ status: 'error' });
    res.send({ status: 'ok', tag: user.tag });
});

app.get('/my-chats/:tag', async (req, res) => {
    const messages = await Message.find({ room: { $regex: req.params.tag } });
    const partners = new Set();
    messages.forEach(m => {
        const parts = m.room.split('_');
        if (parts.length === 2) {
            const partner = parts.find(p => p !== req.params.tag);
            if (partner) partners.add(partner);
        }
    });
    res.send(Array.from(partners));
});

app.post('/search-user', async (req, res) => {
    const user = await User.findOne({ tag: req.body.tag }, 'tag');
    res.send(user || { status: 'not_found' });
});

// СВЯЗЬ ЧЕРЕЗ SOCKET.IO
io.on('connection', (socket) => {
    socket.on('store-user', (tag) => { 
        userSockets[tag] = socket.id;
        socket.join('notify-' + tag); // Личный канал уведомлений
    });

    socket.on('join room', async (room) => {
        socket.rooms.forEach(r => { if(r !== socket.id && !r.startsWith('notify-')) socket.leave(r); });
        socket.join(room);
        const history = await Message.find({ room }).sort({ timestamp: 1 });
        socket.emit('chat history', history);
    });

    socket.on('chat message', async (data) => {
        const msg = new Message({ room: data.room, username: data.sender, text: data.msg });
        const saved = await msg.save();
        
        io.to(data.room).emit('chat message', { ...data, _id: saved._id });

        // Уведомление получателя, чтобы у него всплыл чат
        const partner = data.room.split('_').find(p => p !== data.sender);
        if (partner) {
            io.to('notify-' + partner).emit('new-chat-notification', { from: data.sender });
        }
    });

    socket.on('delete-msg', async (id) => {
        await Message.findByIdAndDelete(id);
        io.emit('msg-deleted', id);
    });

    socket.on('disconnect', () => {
        for (let u in userSockets) if (userSockets[u] === socket.id) delete userSockets[u];
    });
});

server.listen(3000, () => console.log('Server is running on port 3000'));