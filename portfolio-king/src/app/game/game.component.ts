import {Component, OnInit} from '@angular/core';
import * as $ from 'jquery';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {UtilityService} from "../shared/utils/utility-service";
import {ActivatedRoute, Router} from "@angular/router";

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss']
})
export class GameComponent implements OnInit {

  private gameStatus: any;
  public allowGame: any;
  public game: any;
  private socket: any;
  public user: any;
  public diceStatus: boolean = false;
  private timer: any;
  public completeMessage: any;
  private gameId: any;
  public curr_player_id: any;
  public curr_round: any;
  public curr_state: any;
  public year: any = 0;
  public quarter: any = 0;
  public game_state = true;
  public retryVisible: boolean = false;
  public enableRetry: boolean = false;
  public retryTimer: any;
  public isRetry: boolean = false;
  public diceAnimationTimer: any;
  public waitingTimer: any;

  get isSpectator(): boolean {
    return this.user && (this.user.isSpectator || this.user.userType === 'spectator');
  }

  constructor(private portfolioService: PortfolioService,
              private activatedRoute: ActivatedRoute,
              private route: Router) {
  }

  ngOnInit() {
    this.activatedRoute.params.subscribe(({id}) => {
      this.socket = this.portfolioService.socket;
      this.user = this.portfolioService.user;
      this.socket.on('get-rolled-dice', this.onGetDice);
      this.socket.on('game-state-changed', this.onGameStateChanged);
      this.gameId = id;
      if (!this.portfolioService.game) {
        let user = this.portfolioService.user;
        let userType = 'player';
        if (user.isAdmin) {
          userType = 'admin';
        }
        this.portfolioService.onJoinGame(this.gameId, user.socketId, userType, user.userName, user.id);
        this.portfolioService.onGetGame(this.gameId);
        this.gameStatus = this.portfolioService.gameStatus.subscribe((res) => {
          if (res === undefined) {
            UtilityService.showError('4 players already added. Please refresh ');
            this.route.navigate(['']);
          } else {
            this.game = this.portfolioService.game;
            this.allowGame = res;
            let game_status = true;
            this.game.players.forEach(player => {
              console.log(player);
              if (player.game_status !== 'ready') {
                game_status = false;
              }
            });
            if (this.game.players.length !== 4) {
              game_status = false;
            }
            if (this.game.game_status === 'paused') {
              game_status = false;
            }
            if (game_status) {
              this.startGame();
            }
            this.allowGame = game_status;
          }
        });
      } else {
        this.gameStatus = this.portfolioService.gameStatus.subscribe((res) => {
          if (res === undefined) {
            UtilityService.showError('4 players already added. Please refresh ');
            this.route.navigate(['']);
          } else {
            this.game = this.portfolioService.game;
            let game_status = res;
            if (this.game.players.length !== 4) {
              game_status = false;
            }
            if (this.game.game_status === 'paused') {
              game_status = false;
            }
            if (game_status) {
              this.startGame();
            }
            this.allowGame = game_status;
          }
        });
      }
    });
  }

  onDiceRoll(num1, num2) {
    console.log("Dice rolled", num1, num2);
    let dice1 = $('#dice1');
    let dice2 = $('#dice2');
    this.addAnimationToDice(dice1, num1);
    this.addAnimationToDice(dice2, num2);
  }

  addAnimationToDice(dice, num) {
    console.log('animation', dice, num);
    dice.attr("class", "dice");
    this.playAudio("../assets/audios/dice_1.mp3");
    dice.animate({left: '+2px'}, 200, function () {
      dice.addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '-2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_" + num);
    });
  }

  async playAudio(src) {
    let audio = new Audio();
    audio.src = src;
    audio.load();
    await audio.play();
  }

  startGame() {
    if (this.game.round_seq.length === 0) {
      setTimeout(() => {
        this.completeMessage = true;
        this.playAudio("../assets/audios/chinese-gong.mp3");
        setTimeout(() => {
          this.completeMessage = false;
          this.gameStatus.unsubscribe();
          this.socket.off('get-rolled-dice');
          this.route.navigate([`game-status/${this.gameId}`]);
        }, 5000);
      });
    }
    if (this.game.players[0].rounds.length % 4 === 0) {
      this.quarter = 4;
      this.year = Math.trunc(this.game.players[0].rounds.length / 5) + 1;
    } else {
      this.quarter = this.game.players[0].rounds.length % 4;
      this.year = Math.trunc(this.game.players[0].rounds.length / 4) + 1;
    }
    if (this.game.players[0].rounds.length >= 2) {
      this.enableRetry = true;
    }
    if (this.game.round_seq[0]) {
      setTimeout(() => {
        $('.l-half .half-inner').addClass('animate-l');
        $('.r-half .half-inner').addClass('animate-r');
      }, 0);
      this.curr_player_id = this.game.round_seq[0].playerId;
      this.curr_round = this.game.round_seq[0].investment;
      this.curr_state = 'start';
    }
    console.log(this.game);
    if (this.game.round_seq[0] && JSON.stringify(this.game.round_seq[0].playerId) === JSON.stringify(this.user.id)) {
      this.diceStatus = true;
      this.timer = setTimeout(() => {
        if (this.diceStatus === true) {
          let num1 = Math.floor(Math.random() * 6 + 1);
          let num2 = Math.floor(Math.random() * 6 + 1);
          this.onDiceRoll(num1, num2);
          this.diceStatus = false;
          let investment = this.onGetInvestmentValue(this.game.round_seq[0].playerId, this.game.round_seq[0].investment);
          this.socket.emit('dice-rolled', {
            gameId: this.game._id,
            diceValue1: num1,
            diceValue2: num2,
            investment_opt: this.game.round_seq[0].investment,
            investment: investment,
            player_id: this.user.id,
            isRetry: false,
            retryTaken: false,
            retryEnable: this.enableRetry
          });
          $('.l-half .half-inner').removeClass('animate-l');
          $('.r-half .half-inner').removeClass('animate-r');
          clearTimeout(this.timer);
        } else {
          clearTimeout(this.timer);
        }
      }, 30000);
    } else {
      this.diceStatus = false;
    }
  }

  onDiceClick(e?: any) {
    console.log("Dice clicked")
    let num1 = Math.floor(Math.random() * 6 + 1);
    let num2 = Math.floor(Math.random() * 6 + 1);
    this.diceStatus = false;
    this.onDiceRoll(num1, num2);
    clearTimeout(this.timer);
    if (this.isRetry) {
      clearTimeout(this.retryTimer);
    }
    this.curr_state = 'start';
    let investment = this.onGetInvestmentValue(this.game.round_seq[0].playerId, this.game.round_seq[0].investment);
    this.socket.emit('dice-rolled', {
      gameId: this.game._id,
      diceValue1: num1,
      diceValue2: num2,
      investment_opt: this.game.round_seq[0].investment,
      investment: investment,
      player_id: this.user.id,
      isRetry: this.isRetry,
      retryTaken: this.isRetry,
      retryEnable: this.enableRetry
    });
    this.isRetry = false;
    $('.l-half .half-inner').removeClass('animate-l');
    $('.r-half .half-inner').removeClass('animate-r');
  }

  onGetDice = ({game, diceValue1, diceValue2, prevPlayer, gameEnd, diceMissed, isRetry, errorMsg, retryTaken}) => {
    console.log('retry game', game);
    $('.l-half .half-inner').removeClass('animate-l');
    $('.r-half .half-inner').removeClass('animate-r');
    console.log(isRetry, retryTaken, errorMsg);
    if (JSON.stringify(prevPlayer) !== JSON.stringify(this.user.id) && !isRetry) {
      this.onDiceRoll(diceValue1, diceValue2);
    } else if (JSON.stringify(prevPlayer) !== JSON.stringify(this.user.id) && isRetry && retryTaken && errorMsg.length === 0) {
      this.onDiceRoll(diceValue1, diceValue2);
    }
    let waitTime = 15000;
    let diceAnimationTime = 6000;
    let retryTime = 5000;
    let autoRollTime = 30000;
    if (diceMissed) {
      waitTime = 0;
    }
    if (isRetry && !retryTaken) {
      diceAnimationTime = 0;
    }
    clearTimeout(this.timer);
    this.diceAnimationTimer = setTimeout(() => {
      this.game = game;
      this.portfolioService.game = game;
      this.curr_state = 'played';
      if (this.enableRetry && !isRetry && this.game.round_seq[0]) {
        clearTimeout(this.waitingTimer);
        clearTimeout(this.retryTimer);
        clearTimeout(this.timer);
        if (JSON.stringify(this.game.round_seq[0].playerId) === JSON.stringify(this.user.id)) {
          this.retryVisible = true;
          this.isRetry = true;
          let investment = this.onGetInvestmentValue(this.game.round_seq[0].playerId, this.game.round_seq[0].investment);
          this.diceStatus = (investment>5000);
          console.log('check here', investment);
          // this.diceStatus = true;
          console.log('retry timer called');
          this.retryTimer = setTimeout(() => {
            this.retryVisible = false;
            this.diceStatus = false;
            this.curr_state = 'start';
            this.socket.emit('dice-rolled', {
              gameId: this.game._id,
              diceValue1: diceValue1,
              diceValue2: diceValue2,
              investment_opt: this.game.round_seq[0].investment,
              investment: investment,
              player_id: this.user.id,
              isRetry: this.isRetry,
              retryTaken: false,
              retryEnable: this.enableRetry
            });
          }, retryTime);
        } else {
          setTimeout(() => {
            this.curr_state = 'start';
          }, 5000);
        }
      } else {
        this.isRetry = false;
        this.waitingTimer = setTimeout(() => {
          console.log(gameEnd);
          if (gameEnd) {
            setTimeout(() => {
              this.completeMessage = true;
              this.playAudio("../assets/audios/chinese-gong.mp3");
              setTimeout(() => {
                this.completeMessage = false;
                this.gameStatus.unsubscribe();
                this.socket.off('get-rolled-dice');
                this.route.navigate([`game-status/${this.gameId}`]);
              }, 5000);
            }, 5000);
          } else if (!diceMissed) {
            $('.l-half .half-inner').addClass('animate-l');
            $('.r-half .half-inner').addClass('animate-r');
          }
          if (this.game.round_seq[0] && JSON.stringify(this.game.round_seq[0].playerId) === JSON.stringify(this.user.id)) {
            this.diceStatus = true;
            this.timer = setTimeout(() => {
              console.log('player timeout', this.user.id);
              let num1 = Math.floor(Math.random() * 6 + 1);
              let num2 = Math.floor(Math.random() * 6 + 1);
              this.diceStatus = false;
              clearTimeout(this.timer);
              this.onDiceRoll(num1, num2);
              let investment = this.onGetInvestmentValue(this.game.round_seq[0].playerId, this.game.round_seq[0].investment);
              this.socket.emit('dice-rolled', {
                gameId: this.game._id,
                diceValue1: num1,
                diceValue2: num2,
                investment_opt: this.game.round_seq[0].investment,
                investment: investment,
                player_id: this.user.id,
                isRetry: false,
                retryTaken: false,
                retryEnable: this.enableRetry
              });
              $('.l-half .half-inner').removeClass('animate-l');
              $('.r-half .half-inner').removeClass('animate-r');
              clearTimeout(this.timer);
            }, autoRollTime);
          } else {
            this.diceStatus = false;
            clearTimeout(this.timer);
          }
          if (this.game.round_seq[0]) {
            this.curr_player_id = this.game.round_seq[0].playerId;
            this.curr_round = this.game.round_seq[0].investment;
            this.curr_state = 'start';
          }
        }, waitTime);
      }
    }, diceAnimationTime);
  };

  onGetInvestmentValue(playerId, investmentOpt) {
    let player = this.game.players.filter(player => player._id === playerId)[0];
    return player.rounds[player.rounds.length - 1].investment.filter(invest => invest.name === investmentOpt)[0].value;
  }

  ngOnLeave() {
    this.gameStatus.unsubscribe();
  }

  onContinue() {
    this.gameStatus.unsubscribe();
    this.socket.off('get-rolled-dice');
    this.route.navigate([`game-status/${this.gameId}`]);
  }

  onStateChange(state) {
    this.socket.emit('game-state-change', {
      gameId: this.game._id,
      state: state
    });
  }

  onGameStateChanged = (data) => {
    if (data.game_state === 'paused') {
      $('.l-half .half-inner').css('animation-play-state', 'paused');
      $('.r-half .half-inner').css('animation-play-state', 'paused');
      this.diceStatus = false;
    } else {
      $('.l-half .half-inner').css('animation-play-state', 'running');
      $('.r-half .half-inner').css('animation-play-state', 'running');
    }
  }

}
