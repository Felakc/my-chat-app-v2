// ... (начало кода такое же, как в прошлом ответе)

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

        const partner = data.room.split('_').find(p => p !== data.sender);
        if (partner) io.to('notify-' + partner).emit('new-notification');
    });

    // Удаление конкретного сообщения
    socket.on('delete-msg', async (id) => {
        await Message.findByIdAndDelete(id);
        io.emit('msg-deleted', id);
    });

    // Удаление всей переписки с человеком (очистка комнаты)
    socket.on('clear-chat', async (room) => {
        await Message.deleteMany({ room });
        io.to(room).emit('chat-cleared');
    });

    // ... (код групп остается как в прошлом ответе)
});