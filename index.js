const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

// Подключение к БД
mongoose.connect('mongodb+srv://felak:Felak22113d@chatdb.sf9erka.mongodb.net/chat_db')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ DB Error:', err));

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

const Group = mongoose.model('Group', new mongoose.Schema({
    name: String,
    owner: String,
    members: [String]
}));

app.use(express.static(__dirname));
app.use(express.json());

// API Регистрация и Вход
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const tag = `${username}#${Math.floor(1000 + Math.random() * 9000)}`;
        await new User({ username, tag, password }).save();
        res.send({ status: 'ok', tag });
    } catch(e) { res.send({ status: 'error' }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username, password: req.body.password });
    res.send(user ? { status: 'ok', tag: user.tag } : { status: 'error' });
});

// Получение списка чатов и групп
app.get('/my-chats/:tag', async (req, res) => {
    try {
        const messages = await Message.find({ room: { $regex: req.params.tag } });
        const partners = new Set();
        messages.forEach(m => {
            const parts = m.room.split('_');
            if (parts.length === 2) {
                const partner = parts.find(p => p !== req.params.tag);
                if (partner) partners.add(partner);
            }
        });
        const groups = await Group.find({ members: req.params.tag });
        res.send({ partners: Array.from(partners), groups });
    } catch (e) { res.send({ partners: [], groups: [] }); }
});

app.post('/search-user', async (req, res) => {
    const user = await User.findOne({ tag: req.body.tag }, 'tag');
    res.send(user || { status: 'not_found' });
});

// Socket.io Логика
io.on('connection', (socket) => {
    socket.on('store-user', (tag) => { socket.join('notify-' + tag); });

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
        const partner = data.room.split('_').find(p => p !== data.sender);
        if (partner) io.to('notify-' + partner).emit('new-chat-notification');
    });

    socket.on('delete-msg', async (id) => {
        await Message.findByIdAndDelete(id);
        io.emit('msg-deleted', id);
    });

    // ГРУППЫ: Создание
    socket.on('create-group', async (data) => {
        const group = new Group({ name: data.name, owner: data.owner, members: [data.owner] });
        await group.save();
        io.to('notify-' + data.owner).emit('new-chat-notification');
    });

    // ГРУППЫ: Добавление участника
    socket.on('add-to-group', async (data) => {
        const group = await Group.findById(data.groupId);
        if(group && !group.members.includes(data.tag)) {
            group.members.push(data.tag);
            await group.save();
            io.to('notify-' + data.tag).emit('new-chat-notification');
            io.to(data.groupId).emit('chat message', { sender: 'System', msg: `${data.tag} добавлен в группу` });
        }
    });

    // ГРУППЫ: Удаление участника (только владелец)
    socket.on('remove-from-group', async (data) => {
        const group = await Group.findById(data.groupId);
        if (group && group.owner === data.adminTag) {
            group.members = group.members.filter(m => m !== data.userTag);
            await group.save();
            io.to('notify-' + data.userTag).emit('new-chat-notification');
            io.to(data.groupId).emit('chat message', { sender: 'System', msg: `${data.userTag} удален из группы` });
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log('Сервер запущен на порту ' + PORT));