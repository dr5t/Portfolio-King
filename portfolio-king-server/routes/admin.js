var express = require('express');
var router = express.Router();

router.get('/login', function (req, res) {
    let response = {
    }
    if(req.query.userType === 'Admin'){
        if(req.query.username === 'admin' && req.query.password === 'admin@123'){
            response.isAdmin = 'true';
            response.userName= 'admin';
        } else {
            response.message = 'authentication failed';
        }
    } else if(req.query.userType === 'Player'){
        response.isPlayer = 'true';
        response.userName= req.query.username;
    }
    response.id = req.query.socket_id;
    res.send(response);
})

router.get('/', function(req, res){
    res.send('Welcome to server');
});

module.exports = router;