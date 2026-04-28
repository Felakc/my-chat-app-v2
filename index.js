const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Подключаемся к твоей базе (она уже работает, судя по логам!)
mongoose.connect('mongodb+srv://felak:Felak22113d@cluster0.sf9erka.mongodb.net/chat_db')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('DB Error:', err));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String,
    username: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
}));

const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    tag: { type: String, unique: true },
    password: String
}));

app.use(express.static(__dirname));
app.use(express.json());

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const tag = `${username}#${Math.floor(1000 + Math.random() * 9000)}`;
    await new User({ username, tag, password }).save();
    res.send({ status: 'ok', tag });
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username, password: req.body.password });
    res.send(user ? { status: 'ok', tag: user.tag } : { status: 'error' });
});

io.on('connection', (socket) => {
    socket.on('join room', async (room) => {
        socket.join(room);
        const history = await Message.find({ room }).sort({ timestamp: 1 });
        socket.emit('chat history', history);
    });

    socket.on('chat message', async (data) => {
        const msg = new Message({ room: data.room, username: data.sender, text: data.msg });
        const saved = await msg.save();
        io.to(data.room).emit('chat message', { ...data, _id: saved._id });
    });

    // Удаление сообщений
    socket.on('delete-msg', async (id) => {
        await Message.findByIdAndDelete(id);
        io.emit('msg-deleted', id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log('Server started on port ' + PORT));