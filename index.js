const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 }); // Лимит 100мб для файлов

mongoose.connect('mongodb+srv://felak:Felak22113d@chatdb.sf9erka.mongodb.net/chat_db');

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    username: String, tag: { type: String, unique: true }, password: String
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String, sender: String, text: String, 
    file: String, fileName: String, fileType: String,
    timestamp: { type: Date, default: Date.now }
}));

const Group = mongoose.model('Group', new mongoose.Schema({
    name: String, owner: String, members: [String]
}));

app.use(express.static(__dirname));
app.use(express.json());

// API
app.post('/register', async (req, res) => {
    const tag = `${req.body.username}#${Math.floor(1000 + Math.random() * 9000)}`;
    await new User({ ...req.body, tag }).save();
    res.send({ status: 'ok', tag });
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username, password: req.body.password });
    res.send(user ? { status: 'ok', tag: user.tag } : { status: 'error' });
});

app.post('/search-user', async (req, res) => {
    const user = await User.findOne({ tag: req.body.tag });
    res.send(user || { status: 'not_found' });
});

// Получение списка чатов и ГРУПП
app.get('/my-sidebar/:tag', async (req, res) => {
    const messages = await Message.find({ room: { $regex: req.params.tag } });
    const privates = new Set();
    messages.forEach(m => {
        const parts = m.room.split('_');
        if (parts.length === 2) {
            const p = parts.find(x => x !== req.params.tag);
            if(p) privates.add(p);
        }
    });
    const groups = await Group.find({ members: req.params.tag });
    res.send({ privates: Array.from(privates), groups });
});

io.on('connection', (socket) => {
    socket.on('store-user', (tag) => {
        socket.join('notify-' + tag);
    });

    socket.on('join room', async (room) => {
        socket.rooms.forEach(r => { if(r !== socket.id && !r.startsWith('notify-')) socket.leave(r); });
        socket.join(room);
        const history = await Message.find({ room }).sort({ timestamp: 1 });
        socket.emit('chat history', history);
    });

    socket.on('chat message', async (data) => {
        const msg = new Message({ 
            room: data.room, sender: data.sender, text: data.msg,
            file: data.file, fileName: data.fileName, fileType: data.fileType 
        });
        const saved = await msg.save();
        io.to(data.room).emit('chat message', saved);

        // Уведомление для личных чатов
        if(data.room.includes('_')) {
            const partner = data.room.split('_').find(p => p !== data.sender);
            io.to('notify-' + partner).emit('new-notification');
        }
    });

    socket.on('delete-msg', async (id) => {
        await Message.findByIdAndDelete(id);
        io.emit('msg-deleted', id);
    });

    socket.on('create-group', async (data) => {
        const group = new Group({ name: data.name, owner: data.owner, members: [data.owner] });
        await group.save();
        io.to('notify-' + data.owner).emit('new-notification');
    });

    socket.on('add-to-group', async (data) => {
        const group = await Group.findById(data.groupId);
        if(group && !group.members.includes(data.tag)) {
            group.members.push(data.tag);
            await group.save();
            io.to('notify-' + data.tag).emit('new-notification');
        }
    });

    socket.on('delete-group', async (groupId) => {
        const group = await Group.findById(groupId);
        if(group) {
            await Message.deleteMany({ room: groupId });
            await Group.findByIdAndDelete(groupId);
            io.emit('group-deleted', groupId);
        }
    });
});

server.listen(3000, () => console.log('Server OK'));