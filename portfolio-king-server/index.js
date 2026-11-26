require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http').createServer(app);
const adminRoutes = require('./routes/admin');
const s = require('searchjs');
const bodyParser = require('body-parser');
const mongoClient = require('./db/portfolio_db').mongoConnect;
const getDb = require('./db/portfolio_db').getDb;
const ObjectID = require('./db/portfolio_db').ObjectID;
const io = require('./socket').init(http);
const formula = require('./formulas/formulas').formulas;
const investmentReturnSheet = require('./investments/investments').investmentReturnSheet;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@1234';
const clientDistPath = path.resolve(__dirname, '../portfolio-king/dist/Client');

var users = [];
var games = [];
var investment_seq = ['govt_bond', 'corporate_bond', 'blue_chip', 'mid_cap', 'speculative_stock', 'international_stock', 'US_dollar', 'gold_ETF'];
var diceTimer;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.get('/login', function (req, res, next) {
    if (!req.query.userType) {
        if (fs.existsSync(clientDistPath)) {
            return res.sendFile(path.join(clientDistPath, 'index.html'));
        }
        return next();
    }
    let response = {};
    console.log(req.query.userType);
    if (req.query.userType === 'Admin') {
        if (req.query.username === ADMIN_USERNAME && req.query.password === ADMIN_PASSWORD) {
            response.isAdmin = 'true';
            response.userName = ADMIN_USERNAME;
            users.forEach(user => {
                if (user.socketId === req.query.socketId) {
                    user.type = 'admin';
                    user.name = req.query.username;
                }
            });
        } else {
            response.message = 'authentication failed';
        }
    } else if (req.query.userType === 'Player') {
        response.isPlayer = 'true';
        response.userName = req.query.username;
        users.forEach(user => {
            if (user.socketId === req.query.socketId) {
                user.type = 'player';
                user.name = req.query.username;
            }
        });
    }
    response.socketId = req.query.socketId;
    res.send(response);
});

app.post('/logout', function (req, res) {
    users = users.filter(user => user.socketId !== req.body.socketId);
    users.push({
        socketId: req.body.socketId,
        status: 'active'
    });
    res.send({message: 'ok'});
});

app.get('/users', function (req, res) {
    res.send(users);
});
app.get('/games', function (req, res) {
    res.send(games);
});

app.get('/clean', function (req, res) {
    if (users) {
        users = users.filter(user => user.status !== 'inactive');
    }
    res.send(users);
})

app.post('/create-game', function (req, res) {
    createNewGame()
        .then((result) => {
            games.push(result.ops[0]);
            res.send(result);
        })
        .catch((err) => {
            res.send(err);
        });
});

app.get('/get-all-games', function (req, res) {
    res.send(games);
});

app.get('/get-game', function (req, res) {
    let game;
    let id = req.query.gameId;
    games.forEach((g) => {
        if (g._id == id) {
            game = g;
        }
    });
    res.send(game);
});

const getAllGames = () => {
    const db = getDb();
    return db.collection('games')
        .find()
        .toArray();
}

const ioConnection = () => {
    io.on('connection', function (socket) {
        console.log('a user connected');
        let socketUser = socket.handshake.query.user;
        let connectedUser = {
            socketId: socket.id,
            status: 'active'
        };
        if (socketUser) {
            socketUser = JSON.parse(socketUser);
            users = users.filter(user => user.socketId !== socketUser.socketId);
            connectedUser.name = socketUser.userName;
            if (socketUser.isAdmin === 'true') {
                connectedUser.userType = 'admin';
            } else if (socketUser.isAdmin !== 'true') {
                connectedUser.userType = 'player';
                if (socketUser.gameId && socketUser.id) {
                    users.forEach(user => {
                        if (user.socketId === socketUser.socketId) {
                            socket.join(user.gameId);
                            if (connectedUser.userType === 'player') {
                                games.forEach(game => {
                                    if (JSON.stringify(game._id) === JSON.stringify(user.gameId)) {
                                        game.players.forEach(player => {
                                            if (JSON.stringify(player._id) === JSON.stringify(socketUser.id)) {
                                                player.status = 'active';
                                                socket.broadcast.to(JSON.stringify(game._id)).emit("game-updated", game);
                                                updatePlayer(user.gameId, player._id, 'active', 'paused', player.rounds);
                                            }
                                        })
                                    }
                                })
                            }

                        }
                    });
                }
            }
            socketUser.socketId = socket.id;
            io.to(socket.id).emit("update-user", socketUser);
        }
        users.push(connectedUser);
        socket.on('disconnect', () => {
            users.forEach(user => {
                if (user.socketId === socket.id) {
                    user.status = 'inactive'
                }
            });
        });
        socket.on('join-game', (data) => {
            console.log(data);
            users.forEach(user => {
                if (user.socketId === data.socketId) {
                    user.gameId = data.gameId;
                }
            });
            if (data.userType === 'player' && !data.userId) {
                let checkError = false;
                games.forEach(game => {
                    if (JSON.stringify(game._id) === JSON.stringify(data.gameId)
                        && game.players.length >= 4) {
                        console.log(game);
                        io.to(socket.id).emit("player-add-error", {msg: 'game full'});
                        checkError = true;
                    }
                });
                if (checkError) {
                    return;
                }
                addPlayerToGame(data.gameId, data.socketId, data.userName, 'paused')
                    .then(({value, ok}) => {
                        let player = value.players[value.players.length - 1];
                        if (ok === 1) {
                            games.forEach(game => {
                                if (JSON.stringify(game._id) === JSON.stringify(value._id)) {
                                    game.players = value.players;
                                }
                            });
                            socket.broadcast.to(data.gameId).emit("player-added-to-game", {
                                player: player,
                                gameId: data.gameId
                            });
                            io.to(socket.id).emit("player-added-to-game", {player: player, gameId: data.gameId});
                        }
                    });
            }
            else if (data.userType === 'player' && data.userId) {
                games.forEach(game => {
                    if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                        game.players.forEach(player => {
                            if (JSON.stringify(player._id) === JSON.stringify(data.userId)) {
                                player.status = 'active';
                                updatePlayer(data.gameId, player._id, 'active', player.game_status, player.rounds, player.loans)
                                    .then(() => {
                                        socket.broadcast.to(JSON.stringify(game._id)).emit("game-updated", game);
                                        io.to(socket.id).emit("game-updated", game);
                                    });
                            }
                        })
                    }
                })
            }
            socket.join(data.gameId);
        });
        socket.on('leave-game', (data) => {
            users.forEach(user => {
                if (user.socketId === data.socketId) {
                    let userGameId = user.gameId;
                    socket.leave(user.gameId);
                    delete user.gameId;
                    if (data.userType === 'Player') {
                        games.forEach(game => {
                            if (JSON.stringify(game._id) === JSON.stringify(userGameId)) {
                                game.players.forEach(player => {
                                    if (JSON.stringify(player._id) === JSON.stringify(data.userId)) {
                                        player.status = 'inactive';
                                        socket.broadcast.to(JSON.stringify(game._id)).emit("game-updated", game);
                                        updatePlayer(userGameId, player._id, 'inactive', 'paused', player.rounds, player.loans);
                                    }
                                })
                            }
                        })
                    }

                }
            });
        });
        socket.on('player-ready', (data) => {
            if (data.userId) {
                games.forEach(game => {
                    console.log(JSON.stringify(game._id), data.gameId, JSON.stringify(game._id) === JSON.stringify(data.gameId));
                    if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                        game.players.forEach(player => {
                            if (JSON.stringify(player._id) === JSON.stringify(data.userId)) {
                                player.game_status = 'ready';
                                let round = {};
                                round.total_invested_value = data.totalInvestment;
                                if (player.rounds.length === 0) {
                                    round.round_starting_value = 1000000;
                                    round.total_portfolio_value = 1000000;
                                } else {
                                    round.round_starting_value = data.totalInvestment;
                                    round.total_portfolio_value = data.totalInvestment;
                                }
                                // Bank FD
                                if (data.round[0].return_value > 0) {
                                    round.total_portfolio_value += (data.round[0].return_value - data.round[0].value);
                                }
                                // Loan
                                player.loans = data.prevLoans;
                                if (data.loan && data.loan.status === 'active') {
                                    // round.total_portfolio_value += data.loan.amount;
                                    // round.round_starting_value += data.loan.amount;
                                    data.loan.pmt = parseFloat(formula.PMT(data.loan.rate / (4 * 100), data.loan.duration * 4, data.loan.amount, 0, 0).toFixed(2));
                                    data.loan.balance = data.loan.amount;
                                    player.loans.push(data.loan);
                                }
                                round.investment = data.round;
                                round.status = 'ongoing';
                                player.rounds.push(round);
                                updatePlayer(data.gameId, player._id, player.status, 'ready', round, player.loans)
                                    .then(() => {
                                        socket.broadcast.to(data.gameId).emit("game-updated", game);
                                        io.to(socket.id).emit("game-updated", game);
                                    });
                            }
                        })
                    }
                })
            }
        });
        socket.on('game-start', (data) => {
            games.forEach(game => {
                if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                    game.game_status = 'active';
                    updateGame(data.gameId, true, "active", game.players)
                        .then(res => {
                            game.round_seq = getGameSequence(game._id);
                            socket.broadcast.to(data.gameId).emit("game-updated", game);
                            io.to(socket.id).emit("game-updated", game);
                            if (game.round_seq.length === 0) {
                                let g_status = false;
                                game.players.forEach(player => {
                                    player.rounds[player.rounds.length - 1].status = 'complete';
                                    if (player.rounds.length === 12) {
                                        g_status = true;
                                    }
                                    player.rounds[player.rounds.length - 1].returnAvg = 6.2;
                                    player.game_status = "paused";
                                    if (player.rounds.length >= 12) {
                                        player.loans.forEach(loan => {
                                            if (loan.status === 'active') {
                                                loan.totalRepayments += 1;
                                                player.rounds[player.rounds.length - 1].total_portfolio_value += (loan.balance * 0.1 + loan.balance);
                                                loan.balance = 0;
                                                loan.status = 'paid';
                                            }
                                        });
                                    } else {
                                        player.loans.forEach(loan => {
                                            if (loan.status === 'active') {
                                                let installmentPerYear = 4;
                                                loan.totalRepayments += 1;
                                                player.rounds[player.rounds.length - 1].total_portfolio_value += loan.pmt;
                                                loan.balance += parseFloat(formula.PPMT(loan.rate / (installmentPerYear * 100), loan.totalRepayments, loan.duration * installmentPerYear, loan.amount, 0, 0).toFixed(2));
                                                if (loan.balance <= 0) {
                                                    loan.status = 'paid';
                                                }
                                            }
                                        });
                                    }
                                    player.rounds[player.rounds.length - 1].total_portfolio_value = Math.ceil(player.rounds[player.rounds.length - 1].total_portfolio_value);
                                });
                                if (g_status) {
                                    game.game_status = 'completed';
                                }
                                game.roundReady = false;
                                updateGame(game._id, false, game.game_status, game.players);
                            }
                        });
                }
            })
        });

        socket.on('round-ready', (data) => {
            games.forEach(game => {
                if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
                    game.roundReady = true;
                    updateGame(data.gameId, true, "active", game.players)
                        .then(res => {
                            game.round_seq = getGameSequence(game._id);
                            socket.broadcast.to(data.gameId).emit("game-updated", game);
                            io.to(socket.id).emit("game-updated", game);
                        });
                }
            })
        });

        socket.on('dice-rolled', (data) => {
            clearTimeout(diceTimer);
             diceTimer = setTimeout(() => {
                 onDiceRolled(false, data, socket);
             }, 60000);
            onDiceRolled(true, data, socket);
        })
    });
};

const onDiceRolled = (rollStatus, data, socket) => {
    games.forEach(game => {
        if (JSON.stringify(game._id) === JSON.stringify(data.gameId)) {
            let errorMsg = '';
            let playerId = data.player_id;
            let diceValue = data.diceValue1 + data.diceValue2;
            let investment = data.investment;
            let investment_opt = data.investment_opt;
            let returnVal = {
                return_rate: 0,
                return_value: 0
            };
            console.log('dice values : ', diceValue, data.diceValue1, data.diceValue2, data.enableRetry);
            if (data.isRetry || !data.retryEnable) {
                let g = game.round_seq.splice(0, 1);
            } else {
                game.round_seq[0].retry = true;
            }
            if (rollStatus) {
                if (investment > 5000 && data.isRetry && data.retryTaken) {
                    returnVal = getInvestmentReturn(investment_opt, investment - 5000, diceValue);
                } else {
                    returnVal = getInvestmentReturn(investment_opt, investment, diceValue);
                }
            } else {
                playerId = game.round_seq[0].playerId;
                investment_opt = game.round_seq[0].investment;
            }
            game.players.forEach(player => {
                if (JSON.stringify(player._id) === JSON.stringify(playerId)) {
                    console.log("PlayerId", playerId)
                    player.rounds[player.rounds.length - 1].investment.forEach(insvt => {
                        if (insvt.name === investment_opt) {
                            insvt.return_rate = returnVal.return_rate;
                            if ((data.isRetry && data.retryTaken) || !data.isRetry) {
                                if (insvt.value > 5000 && data.isRetry && data.retryTaken) {
                                    insvt.value -= 5000;
                                    player.rounds[player.rounds.length - 1].total_portfolio_value -= parseFloat((insvt.return_value - insvt.value).toFixed(2));
                                } else {
                                    errorMsg = 'Not enough portfolio value for this investment option';
                                }
                                insvt.return_value = parseFloat(returnVal.return_value.toFixed(2));
                                player.rounds[player.rounds.length - 1].total_portfolio_value += parseFloat((insvt.return_value - insvt.value).toFixed(2));
                            }
                        }
                    })
                }
            });

            let gameEnd = false;
            if (game.round_seq.length === 0) {
                gameEnd = true;
                let g_status = false;
                game.players.forEach(player => {
                    player.rounds[player.rounds.length - 1].status = 'complete';
                    let totalVal = 0, totalReturn = 0;
                    // round end check
                    if (player.rounds.length === 8) {
                        g_status = true;
                    }
                    player.rounds[player.rounds.length - 1].investment.forEach(invst => {
                        if ((investment_seq.indexOf(invst.name) > -1 || invst.name === 'bank_FD') &&
                            invst.value > 0) {
                            totalVal += invst.value;
                            totalReturn += (invst.return_value - invst.value);
                        }
                    });
                    player.loans.forEach(loan => {
                        if (loan.status === 'active') {
                            totalReturn += loan.pmt;
                        }
                    });
                    player.rounds[player.rounds.length - 1].returnAvg = parseFloat(((totalReturn / totalVal) * 100).toFixed(2));
                    player.game_status = "paused";
                });
                if (g_status) {
                    game.game_status = 'completed';
                }

                clearTimeout(diceTimer);
                game.game_status = "paused";
                setTimeout(() => {
                    game.players.forEach(player => {
                        let g_status = false;
                        player.rounds[player.rounds.length - 1].investment.forEach(insvt => {
                            if (insvt.name === 'fof') {
                                insvt.return_rate = currentFofReturn(game, insvt.target_player, insvt.value);
                                let returnVal = parseFloat(((insvt.value * 0.98) * (insvt.return_rate / 100 + 1)).toFixed(2));
                                insvt.return_value = returnVal;
                                player.rounds[player.rounds.length - 1].total_portfolio_value += returnVal - insvt.value;
                            }
                        });
                        // years can be changed from here
                        if (player.rounds.length >= 8) {
                            player.loans.forEach(loan => {
                                if (loan.status === 'active') {
                                    loan.totalRepayments += 1;
                                    player.rounds[player.rounds.length - 1].total_portfolio_value -= (loan.balance * 0.1 + loan.balance);
                                    loan.balance = 0;
                                    loan.status = 'paid';
                                }
                            });
                            g_status = true;
                        } else {
                            player.loans.forEach(loan => {
                                if (loan.status === 'active') {
                                    let installmentPerYear = 4;
                                    loan.totalRepayments += 1;
                                    player.rounds[player.rounds.length - 1].total_portfolio_value += loan.pmt;
                                    loan.balance += parseFloat(formula.PPMT(loan.rate / (installmentPerYear * 100), loan.totalRepayments, loan.duration * installmentPerYear, loan.amount, 0, 0).toFixed(2));
                                    if (loan.balance <= 0) {
                                        loan.status = 'paid';
                                    }
                                }
                            });
                        }
                    });
                    game.players.forEach(player => {
                        player.rounds[player.rounds.length - 1].total_portfolio_value = Math.ceil(player.rounds[player.rounds.length - 1].total_portfolio_value);
                    });
                    if (g_status) {
                        game.game_status = 'completed';
                    }
                    game.roundReady = false;
                    updateGame(game._id, false, game.game_status, game.players);
                }, 5000);
            }
            socket.broadcast.to(data.gameId).emit("get-rolled-dice", {
                game: game,
                diceValue1: data.diceValue1,
                diceValue2: data.diceValue2,
                prevPlayer: playerId,
                gameEnd: gameEnd,
                isRetry: data.isRetry,
                errorMsg: errorMsg,
                retryTaken: data.retryTaken
            });
            io.to(socket.id).emit("get-rolled-dice", {
                game: game,
                diceValue1: data.diceValue1,
                diceValue2: data.diceValue2,
                prevPlayer: playerId,
                gameEnd: gameEnd,
                errorMsg: errorMsg,
                isRetry: data.isRetry,
                retryTaken: data.retryTaken
            });
        }
    })
};

const currentFofReturn = (game, target_player, value) => {
    let return_val = 0;
    game.players.forEach(player => {
        if (JSON.stringify(player._id) === JSON.stringify(target_player)) {
            return_val = player.rounds[player.rounds.length - 1].returnAvg;
            if (player.rounds[player.rounds.length - 1].investment[player.rounds[player.rounds.length - 1].investment.length - 1].name === 'fof_return') {
                player.rounds[player.rounds.length - 1].investment[player.rounds[player.rounds.length - 1].investment.length - 1].return_value += value * 0.02;
            } else {
                player.rounds[player.rounds.length - 1].investment.push({
                    name: 'fof_return',
                    value: 0,
                    return_rate: 0,
                    return_value: value * 0.02
                });
            }
            player.rounds[player.rounds.length - 1].total_portfolio_value += value * 0.02;
        }
    });
    console.log(return_val);
    return return_val;
};

const getGameSequence = (gameId) => {
    let game = games.filter(game => JSON.stringify(game._id) === JSON.stringify(gameId))[0];
    let seq = [];
    for (let [key, value] of investment_seq.entries()) {
        for (let player of game.players) {
            if (player.rounds[player.rounds.length - 1] && player.rounds[player.rounds.length - 1].investment[key + 1].value > 0) {
                seq.push({playerId: player._id, investment: value, retry: false});
            }
        }
    }
    console.log('sequence', seq);
    return seq;
};

const createNewGame = () => {
    const db = getDb();
    return db.collection('games')
        .insertOne({
            game_status: 'paused',
            roundReady: false,
            timestamp: new Date(),
            players: []
        });
};

const addPlayerToGame = (gameId, socketId, name) => {
    const db = getDb();
    return db.collection('games')
        .findOneAndUpdate(
            {_id: new ObjectID(gameId)},
            {
                $addToSet: {
                    players: {
                        _id: new ObjectID(),
                        socketId: socketId,
                        name: name,
                        status: 'active',
                        game_status: 'paused',
                        starting_portfolio_value: 1000000,
                        rounds: [],
                        loans: []
                    }
                }
            },
            {returnOriginal: false}
        )
};

const getInvestmentReturn = (investment_option, investemnt, dice_value) => {
    let returnVal = investmentReturnSheet(investment_option, dice_value);
    let insvt = {
        return_rate: 0,
        return_value: 0
    }
    insvt.return_rate = returnVal;
    console.log(investemnt);
    insvt.return_value = investemnt * (returnVal / 100 + 1);
    console.log('invst return', investemnt, dice_value, insvt);
    return insvt;
};

const updatePlayer = (gameId, player_id, status, game_status, round, loans) => {
    const db = getDb();
    const updateDoc = {
        $set: {
            "players.$.status": status,
            "players.$.game_status": game_status
        }
    };
    if (loans !== undefined) {
        updateDoc.$set["players.$.loans"] = loans;
    }
    if (Array.isArray(round)) {
        updateDoc.$set["players.$.rounds"] = round;
    } else if (round) {
        updateDoc.$push = {
            "players.$.rounds": round
        };
    }
    return db.collection('games')
        .findOneAndUpdate(
            {_id: new ObjectID(gameId), 'players._id': new ObjectID(player_id)},
            updateDoc,
            {returnOriginal: false}
        );
};

const updateGame = (gameId, round_ready, game_status, players) => {
    const db = getDb();
    return db.collection('games')
        .findOneAndUpdate(
            {_id: new ObjectID(gameId)},
            {
                $set: {
                    "game_status": game_status,
                    "roundReady": round_ready,
                    "players": players
                }
            },
            {returnOriginal: false}
        )
};

app.get('/update-game', function (req, res) {
    getAllGames()
        .then((result) => {
            games = result;
            res.send(games);
        });
});

app.get('/test-game', function (req, res) {
    res.send(getGameSequence("5d83359f638941340c294d3e"));
});

if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', function (req, res) {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const port = process.env.PORT || 3000;
const hostname = process.env.HOST || process.env.HOST_TEST || '0.0.0.0';

http.listen(port, hostname, function () {
    console.log("PORT", port, "hostname", hostname)
    console.log('server listening on ', port);
    mongoClient(() => {
        console.log('connected to database server');
        getAllGames()
            .then((result) => {
                games.push(...result);
                ioConnection();
                console.log("game ready");
            });
    });
});