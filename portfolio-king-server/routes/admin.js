var express = require('express');
var router = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@1234';

router.get('/login', function (req, res) {
    let response = {
    }
    if(req.query.userType === 'Admin'){
        if(req.query.username === ADMIN_USERNAME && req.query.password === ADMIN_PASSWORD){
            response.isAdmin = 'true';
            response.userName= ADMIN_USERNAME;
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