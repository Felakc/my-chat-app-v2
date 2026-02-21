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

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const tag = `${username}#${Math.floor(1000 + Math.random() * 9000)}`;
        await new User({ username, tag, password }).save();
        res.send({ status: 'ok', tag });
    } catch (e) { res.send({ status: 'error' }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username, password: req.body.password });
    res.send(user ? { status: 'ok', tag: user.tag } : { status: 'error' });
});

app.get('/my-sidebar/:tag', async (req, res) => {
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
        res.send(Array.from(partners));
    } catch (e) { res.send([]); }
});

app.post('/search-user', async (req, res) => {
    const user = await User.findOne({ tag: req.body.tag }, 'tag');
    res.send(user || { status: 'not_found' });
});

io.on('connection', (socket) => {
    socket.on('store-user', (tag) => { 
        userSockets[tag] = socket.id;
        socket.join('notify-' + tag);
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

        const partner = data.room.split('_').find(p => p !== data.sender);
        if (partner) io.to('notify-' + partner).emit('new-chat-notification', { from: data.sender });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));