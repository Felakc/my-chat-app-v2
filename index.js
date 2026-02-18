const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

mongoose.connect('mongodb+srv://felak:Felak22113d@chatdb.sf9erka.mongodb.net/chat_db')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('DB Error:', err));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true },
    tag: { type: String, unique: true, sparse: true }, 
    password: { type: String, required: true }
}));

const Group = mongoose.model('Group', new mongoose.Schema({
    name: String,
    members: [String]
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String, 
    username: String,
    text: String,
    type: { type: String, default: 'text' },
    timestamp: { type: Date, default: Date.now }
}));

app.use(express.static(__dirname));
app.use(express.json());

const userSockets = {};

// РЕГИСТРАЦИЯ (Всегда создает тег)
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if(!username || !password) return res.send({ status: 'error', message: 'Заполни все поля!' });
        
        const exists = await User.findOne({ username });
        if (exists) return res.send({ status: 'error', message: 'Имя уже занято' });

        const tag = `${username}#${Math.floor(1000 + Math.random() * 9000)}`;
        await new User({ username, tag, password }).save();
        res.send({ status: 'ok', tag });
    } catch(e) { res.send({ status: 'error', message: 'Ошибка базы' }); }
});

// ЛОГИН (Чинит старые аккаунты)
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username, password: req.body.password });
        if (!user) return res.send({ status: 'error', message: 'Неверный логин или пароль' });

        // Если это старый акк без тега — создаем его прямо сейчас
        if (!user.tag) {
            user.tag = `${user.username}#${Math.floor(1000 + Math.random() * 9000)}`;
            await user.save();
        }

        res.send({ status: 'ok', tag: user.tag });
    } catch (e) { res.send({ status: 'error' }); }
});

app.post('/search-user', async (req, res) => {
    const user = await User.findOne({ tag: req.body.tag }, 'tag');
    res.send(user ? user : { status: 'not_found' });
});

app.get('/my-groups/:tag', async (req, res) => {
    const groups = await Group.find({ members: req.params.tag });
    res.send(groups);
});

app.post('/create-group', async (req, res) => {
    const group = new Group(req.body);
    await group.save();
    group.members.forEach(m => userSockets[m] && io.to(userSockets[m]).emit('refresh-groups'));
    res.send(group);
});

app.post('/leave-group', async (req, res) => {
    const { groupId, tag } = req.body;
    const group = await Group.findById(groupId);
    if (group) {
        group.members = group.members.filter(m => m !== tag);
        group.members.length === 0 ? await Group.findByIdAndDelete(groupId) : await group.save();
    }
    res.send({ status: 'ok' });
});

app.delete('/messages/:id', async (req, res) => {
    await Message.findByIdAndDelete(req.params.id);
    res.send({ status: 'ok' });
});

io.on('connection', (socket) => {
    socket.on('store-user', (tag) => { userSockets[tag] = socket.id; });
    socket.on('join room', async (room) => {
        socket.rooms.forEach(r => r !== socket.id && socket.leave(r));
        socket.join(room);
        const history = await Message.find({ room }).sort({ timestamp: 1 });
        socket.emit('chat history', history);
    });
    socket.on('chat message', async (data) => {
        const msg = new Message({ room: data.room, username: data.sender, text: data.msg, type: data.type });
        const saved = await msg.save();
        io.to(data.room).emit('chat message', { ...data, _id: saved._id });
    });
    socket.on('delete-msg-client', (data) => { io.to(data.room).emit('msg-deleted-server', data.id); });
    socket.on('disconnect', () => { for (let u in userSockets) if (userSockets[u] === socket.id) delete userSockets[u]; });
});

server.listen(process.env.PORT || 3000);