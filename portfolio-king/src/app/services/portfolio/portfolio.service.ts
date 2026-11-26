import {Inject, Injectable} from '@angular/core';
import * as io from 'socket.io-client';
import {ApiService} from "../api/api.service";
import {EndPoints} from "../api/endpoints";
import {LOCAL_STORAGE, StorageService} from 'ngx-webstorage-service';
import {Subject} from "rxjs/index";
import {share} from "rxjs/internal/operators";

const STORAGE_KEY = 'login_obj';

@Injectable({
  providedIn: 'root'
})
export class PortfolioService {

  //private url = 'http://192.168.1.6:3000';
  //private url = 'http://localhost:3000';
  private url = 'http://localhost:3000';
  private _socket;
  private _user: any = false;
  public gameStatus = new Subject<boolean>();
  public game: any;

  constructor(private api: ApiService,
              private endpoint: EndPoints,
              @Inject(LOCAL_STORAGE) private storage: StorageService) {
  }

  get user() {
    return this._user;
  }

  set user(user) {
    this.setLoginObj(user);
    this._user = user;
  }

  get socket() {
    return this._socket;
  }

  initSocket() {
    let user = this.getLoginObj();
    let queryString = '';
    if (user) {
      queryString = JSON.stringify(user);
    }
    this._socket = io(this.url, {query: 'user=' + queryString});
    this._socket.on('update-user', (user) => {
      this.user = user;
    });
  }


  onLogin(user, userType = 'Player') {
    user.userType = userType;
    let {login} = this.endpoint;
    user.socketId = this._socket.id;
    let seq = this.api.get(login, user);
    return seq;
  }

  getLoginObj() {
    return this.storage.get(STORAGE_KEY);
  }

  setLoginObj(loginObj) {
    this.storage.set(STORAGE_KEY, loginObj);
  }

  isAuthenticated() {
    let user = this.getLoginObj();
    if (user && user.isAdmin) {
      this.user = user;
      return true;
    } else if (user && user.isPlayer) {
      this.user = user;
      return true;
    }
    return false;
  }

  getTeam(id) {
    if (!this.game)
      return;
    return this.game.players.filter(({_id}) => _id === id);
  }

  createGame() {
    let {createGame} = this.endpoint;
    let seq = this.api.post(createGame, {});
    return seq;
  }

  getAllGames() {
    let {getAllGames} = this.endpoint;
    let seq = this.api.get(getAllGames);
    return seq;
  }

  addPlayerToGame = ({gameId, player}) => {
    console.log(player);
    if (player.socketId == this._socket.id) {
      let u = this.user;
      u.id = player._id;
      u.gameId = gameId;
      this.user = u;
      console.log(this.user);
    }
    this.onGetGame(gameId);
  }

  onPlayerAddError = () => {
    this._socket.off('player-added-to-game');
    this.gameStatus.next();
  }

  onJoinGame(gameId, socketId, userType, userName, userId = false) {
    console.log("onJoinGame", gameId, socketId, userType, userName, userId)
    console.log(userName);
    this._socket.emit('join-game', {
      gameId: gameId,
      socketId: socketId,
      userType: userType,
      userId: userId,
      userName: userName
    });
    this._socket.on('player-added-to-game', this.addPlayerToGame);
    this._socket.on('player-add-error', this.onPlayerAddError);
    this._socket.on('game-updated', this.onGameUpdated);
  }

  onGameUpdated = (game) => {
    this.game = game;
    console.log(this.game, this.game.players);
    if (this.game.players.length === 4 && this.game.game_status !== 'done') {
      let gameStatus = true;
      this.game.players.forEach(player => {
        if (player.game_status !== "ready") {
          gameStatus = false;
        }
      });
      this.gameStatus.next(gameStatus);
    } else if (this.game.game_status !== 'done') {
      this.gameStatus.next(false);
    }
  }

  onGetGame(gameId) {
    let {getGame} = this.endpoint;
    this.api.get(getGame, {gameId: gameId}).subscribe((game) => {
      this.game = game;
      if (this.game.players.length === 4 && this.game.game_status !== 'done') {
        let gameStatus = true;
        this.game.players.forEach(player => {
          if (player.game_status !== "ready") {
            gameStatus = false;
          }
        });
        this.gameStatus.next(gameStatus);
      } else if (this.game.game_status !== 'done') {
        this.gameStatus.next(false);
      }
    });
  }

  onPlayerLeaveGame(gameId, socketId, userId) {
    this._socket.off('player-added-to-game');
    this._socket.off('player-add-error');
    this._socket.off('game-updated');
    this._socket.emit('leave-game', {gameId: gameId, socketId: socketId, userId: userId});
  }

  onGameStart(gameId) {
    this._socket.emit('game-start', {gameId: gameId});
  }

  onRoundReady(gameId){
    this._socket.emit('round-ready', {gameId: gameId});
  }

  onPlayerReady(roundData, totalInvestment, loan, prevLoans) {
    let {gameId, socketId, id} = this.user;
    this._socket.emit('player-ready', {
      gameId: gameId,
      socketId: socketId,
      userId: id,
      round: roundData,
      totalInvestment: totalInvestment,
      loan: loan,
      prevLoans: prevLoans
    });
  }

  _getAllGames() {
    return this.game;
  }

  onLogout() {
    let {logout} = this.endpoint;
    let seq = this.api.post(logout, {userId: this.user.id, socketId: this.socket.id}, {
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .pipe(
        share()
      );
    seq.subscribe(() => {
      this.socket.removeAllListeners();
      this.storage.remove(STORAGE_KEY);
      this._user = false;
      this.game = false;
    });
    return seq;
  }

  getNavValue(playerId) {
    let navExtra = {
      ptValue: 1000000,
      loans: [],
      players: []
    };
    this.game.players.forEach((player) => {
      navExtra.players.push(player._id);
      if (player._id === playerId) {
        if (player.rounds.length > 0) {
          navExtra.ptValue = player.rounds[player.rounds.length - 1].total_portfolio_value;
          navExtra.loans = player.loans;
          return;
        }
      }
    });
    return navExtra;
  }
}
