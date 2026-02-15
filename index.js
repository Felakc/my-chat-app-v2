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

// Схемы данных
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
    timestamp: { type: Date, default: Date.now }
}));

app.use(express.static(__dirname));
app.use(express.json());

// API Авторизации
app.post('/register', async (req, res) => {
    try { await new User(req.body).save(); res.send({status:'ok'}); } 
    catch(e) { res.send({status:'error'}); }
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

app.post('/create-group', async (req, res) => {
    const group = new Group(req.body);
    await group.save();
    io.emit('refresh-groups', group.members); // Мгновенное уведомление
    res.send(group);
});

// Socket.io
io.on('connection', (socket) => {
    socket.on('join room', async (room) => {
        socket.rooms.forEach(r => { if(r !== socket.id) socket.leave(r) });
        socket.join(room);
        const history = await Message.find({ room }).sort({ timestamp: 1 });
        socket.emit('chat history', history);
    });

    socket.on('chat message', async (data) => {
        await new Message({ room: data.room, username: data.sender, text: data.msg }).save();
        io.to(data.room).emit('chat message', data);
    });
});

server.listen(process.env.PORT || 3000, () => console.log('Server started'));