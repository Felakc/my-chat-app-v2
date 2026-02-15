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

// Схемы
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
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

const HiddenUser = mongoose.model('HiddenUser', new mongoose.Schema({
    owner: String,
    hiddenUsername: String
}));

app.use(express.static(__dirname));
app.use(express.json());

const userSockets = {};

// API Авторизация и Списки
app.post('/register', async (req, res) => {
    try { await new User(req.body).save(); res.send({status:'ok'}); } catch(e) { res.send({status:'error'}); }
});
app.post('/login', async (req, res) => {
    const user = await User.findOne(req.body);
    res.send(user ? {status:'ok'} : {status:'error'});
});
app.get('/users', async (req, res) => {
    const users = await User.find({}, 'username');
    res.send(users);
});
app.get('/my-groups/:username', async (req, res) => {
    const groups = await Group.find({ members: req.params.username });
    res.send(groups);
});

// Группы и Удаление
app.post('/create-group', async (req, res) => {
    const group = new Group(req.body);
    await group.save();
    group.members.forEach(m => userSockets[m] && io.to(userSockets[m]).emit('refresh-groups'));
    res.send(group);
});

app.post('/leave-group', async (req, res) => {
    const { groupId, username } = req.body;
    const group = await Group.findById(groupId);
    if (group) {
        group.members = group.members.filter(m => m !== username);
        group.members.length === 0 ? await Group.findByIdAndDelete(groupId) : await group.save();
    }
    res.send({ status: 'ok' });
});

app.delete('/messages/:id', async (req, res) => {
    await Message.findByIdAndDelete(req.params.id);
    res.send({ status: 'ok' });
});

app.post('/hide-user', async (req, res) => {
    await new HiddenUser(req.body).save();
    res.send({ status: 'ok' });
});

app.get('/hidden-users/:username', async (req, res) => {
    const hidden = await HiddenUser.find({ owner: req.params.username });
    res.send(hidden.map(h => h.hiddenUsername));
});

// Socket.io
io.on('connection', (socket) => {
    socket.on('store-user', (username) => { userSockets[username] = socket.id; });
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