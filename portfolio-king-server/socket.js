let io;

module.exports = {
    init: httpServer => {
        return require('socket.io').listen(httpServer);
    },
    getIO: () => {
        return io;
    }
}