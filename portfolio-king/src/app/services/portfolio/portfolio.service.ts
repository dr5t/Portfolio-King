import {Inject, Injectable} from '@angular/core';
import * as io from 'socket.io-client';
import {ApiService} from "../api/api.service";
import {EndPoints} from "../api/endpoints";
import {LOCAL_STORAGE, StorageService} from 'ngx-webstorage-service';
import {Subject} from "rxjs/index";
import {share} from "rxjs/internal/operators";
import {environment} from "../../../environments/environment";

const STORAGE_KEY = 'login_obj';

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PortfolioService {

  private url = environment.endpoint || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  private _socket;
  private _user: any = false;
  public gameStatus = new Subject<boolean>();
  public sessionExpired = new Subject<string>();
  public notifications: AppNotification[] = [];
  public game: any;
  public isMuted: boolean = false;

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
    this._socket.on('connect', () => {
      if (this.user && this.user.token) {
        this._socket.emit('authenticate', { token: this.user.token });
      }
    });
    this._socket.on('admin-notification', notification => {
      if (this.user && this.user.isAdmin === 'true') {
        this.addNotification(notification);
      }
    });
    this._socket.on('connect_error', () => {
      if (this.user && this.user.isAdmin === 'true') {
        this.addNotification({
          title: 'Connection issue',
          description: 'The live connection could not be established.'
        });
      }
    });
    this._socket.on('session-expired', event => {
      this.clearExpiredSession(event && event.message
        ? event.message
        : 'Your session has expired. Please sign in again.');
    });
    this._socket.on('game-deleted', event => {
      if (this.user && this.user.isPlayer && this.user.gameId === String(event.gameId)) {
        this.clearExpiredSession('This game session was ended by an administrator. Please sign in again.');
      }
    });
    this._socket.on('team-session-revoked', event => {
      if (this.user && this.user.isPlayer) {
        const message = event && event.reason === 'disabled'
          ? 'Your team account was disabled by an administrator.'
          : event && event.reason === 'password-reset'
            ? 'Your password was reset. Please sign in again.'
            : 'Your team account was removed by an administrator.';
        this.clearExpiredSession(message);
      }
    });
  }

  authenticateSocket() {
    if (!this._socket) {
      this.initSocket();
      return;
    }
    if (this._socket.connected && this.user && this.user.token) {
      this._socket.emit('authenticate', { token: this.user.token });
    }
  }

  addNotification(notification: any) {
    if (!notification || typeof notification.title !== 'string' ||
        typeof notification.description !== 'string') return;

    const timestamp = notification.timestamp ? new Date(notification.timestamp) : new Date();
    const validTimestamp = isNaN(timestamp.getTime()) ? new Date() : timestamp;
    const duplicate = this.notifications.find(item =>
      item.title === notification.title &&
      item.description === notification.description &&
      Math.abs(validTimestamp.getTime() - item.timestamp.getTime()) < 30000
    );
    if (duplicate) return;

    this.notifications.unshift({
      id: `${validTimestamp.getTime()}-${this.notifications.length}`,
      title: notification.title,
      description: notification.description,
      timestamp: validTimestamp,
      read: false
    });
    this.notifications = this.notifications.slice(0, 60);
  }

  get unreadNotificationCount(): number {
    return this.notifications.filter(notification => !notification.read).length;
  }

  markNotificationRead(id: string) {
    const notification = this.notifications.find(item => item.id === id);
    if (notification) notification.read = true;
  }

  markAllNotificationsRead() {
    this.notifications.forEach(notification => notification.read = true);
  }

  clearNotifications() {
    this.notifications = [];
  }

  clearExpiredSession(message: string) {
    this.storage.remove(STORAGE_KEY);
    this._user = false;
    this.game = false;
    this.sessionExpired.next(message);
  }


  onLogin(user, userType = 'Player') {
    user.userType = userType;
    let {login} = this.endpoint;
    user.socketId = this._socket ? this._socket.id : null;
    let seq = this.api.post(login, user);
    return seq;
  }

  getTeams(gameId: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.get('api/teams', { gameId }, reqOpts);
  }

  createTeam(teamData: any) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.post('api/teams', teamData, reqOpts);
  }

  generateAllTeams(gameId: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.post('api/teams/generate-all', { gameId }, reqOpts);
  }

  updateTeam(teamId: string, data: any) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.put('api/teams/' + teamId, data, reqOpts);
  }

  resetTeamPassword(teamId: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.post('api/teams/' + teamId + '/reset-password', {}, reqOpts);
  }

  deleteTeam(teamId: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.delete('api/teams/' + teamId, reqOpts);
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

  createGame(name?: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    let {createGame} = this.endpoint;
    return this.api.post(createGame, { name }, reqOpts);
  }

  renameGame(gameId: string, name: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.post('api/games/rename', { gameId, name }, reqOpts);
  }

  duplicateGame(gameId: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.post('api/games/duplicate', { gameId }, reqOpts);
  }

  updateGameLifecycleStatus(gameId: string, status: string) {
    let reqOpts: any = {};
    if (this.user && this.user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + this.user.token };
    }
    return this.api.post('api/games/status', { gameId, status }, reqOpts);
  }

  deleteGame(gameId: string, confirmName: string) {
    let reqOpts: any = {};
    const user = this.user || this.getLoginObj();
    if (user && user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + user.token };
    }
    return this.api.post('api/games/delete', { gameId, confirmName }, reqOpts);
  }

  bulkDeleteGames(gameIds: string[], deleteAll: boolean, confirmationText?: string) {
    let reqOpts: any = {};
    const user = this.user || this.getLoginObj();
    if (user && user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + user.token };
    }
    return this.api.post('api/games/bulk-delete', {
      gameIds,
      deleteAll,
      confirmationText
    }, reqOpts);
  }

  bulkDeleteTeams(gameId: string, teamIds: string[], deleteAll: boolean, confirmationText?: string) {
    let reqOpts: any = {};
    const user = this.user || this.getLoginObj();
    if (user && user.token) {
      reqOpts.headers = { Authorization: 'Bearer ' + user.token };
    }
    return this.api.post('api/teams/bulk-delete', {
      gameId,
      teamIds,
      deleteAll,
      confirmationText
    }, reqOpts);
  }

  getGameCsvExportUrl(gameId: string): string {
    const token = this.user ? this.user.token : '';
    return `${this.url}/api/games/export/${gameId}?token=${token}`;
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

  onPlayerAddError = (err?: any) => {
    this._socket.off('player-added-to-game');
    const errObj = (typeof err === 'object' && err !== null) ? { error: true, ...err } : { error: true, msg: '4 players already added. Please refresh ' };
    this.gameStatus.next(errObj);
  }

  onJoinGame(gameId, socketId, userType, userName, userId = false) {
    console.log("onJoinGame", gameId, socketId, userType, userName, userId);
    this._socket.emit('join-game', {
      gameId: gameId,
      socketId: socketId,
      userType: userType,
      userId: userId,
      userName: userName,
      token: this.user ? this.user.token : null
    });
    this._socket.off('player-added-to-game');
    this._socket.off('player-add-error');
    this._socket.off('game-updated');
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
    const currentUser = this.user || this.getLoginObj();
    const socketId = this.socket ? this.socket.id : null;
    let seq = this.api.post(logout, {
      userId: currentUser && currentUser.id,
      socketId,
      token: currentUser && currentUser.token
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...(currentUser && currentUser.token ? { Authorization: 'Bearer ' + currentUser.token } : {})
      }
    })
      .pipe(
        share()
      );
    seq.subscribe(() => {
      this.clearLocalSession();
    }, error => {
      if (error.status === 401) this.clearLocalSession();
    });
    return seq;
  }

  private clearLocalSession() {
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket.disconnect();
      this._socket = null;
    }
    this.storage.remove(STORAGE_KEY);
    this._user = false;
    this.game = false;
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
