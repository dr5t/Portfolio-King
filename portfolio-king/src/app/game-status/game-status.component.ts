import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {ActivatedRoute, NavigationExtras, Router} from "@angular/router";
import {UtilityService} from "../shared/utils/utility-service";
import {getGameLeaderboard} from "../shared/utils/game-results";
import {OwlOptions} from 'ngx-owl-carousel-o';

@Component({
  standalone: false,
  selector: 'app-game-status',
  templateUrl: './game-status.component.html',
  styleUrls: ['./game-status.component.scss']
})
export class GameStatusComponent implements OnInit {

  private gameId: any;
  public user: any;
  public onPlayerReady: boolean = false;
  public game: any;
  private gameStatus: any;
  public customOptions: OwlOptions;
  public portfolioLeaderId: any = [];
  public portfolioLeaderValue: any = [];
  public quarter: any = 0;
  public year: any = 0;
  public gameEnd: any = false;
  public leaderName: any = [];
  public status_timer: any;
  public roundReady: any = false;
  public _ifTimer: boolean = true;
  public _ifLeaderShown: boolean = false;
  public isYearEnd: boolean = false;
  public audio1: any;
  public audio2: any;
  public roundNumber: any = 0;
  public activeViewMode: 'leaderboard' | 'carousel' = 'leaderboard';

  public showCelebration = false;
  public videoEnded = false;
  public celebrationVideoSrc = '';
  @ViewChild('celebrationVideo') celebrationVideoRef!: ElementRef<HTMLVideoElement>;

  constructor(public portfolioService: PortfolioService,
              private route: Router,
              private activatedRoute: ActivatedRoute) {
  }

  exportGameCsv() {
    this.portfolioService.downloadGameCsv(this.gameId).subscribe(
      (file: Blob) => {
        const url = window.URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `portfolio-king-${this.getGameShortId()}.csv`;
        link.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 0);
      },
      error => {
        const message = error && error.error && typeof error.error === 'string'
          ? error.error
          : error && error.error && error.error.message
            ? error.error.message
            : 'Could not export game results.';
        UtilityService.showError(message);
      }
    );
  }

  getGameShortId(): string {
    if (!this.gameId) return 'PKG-0000';
    return `PKG-${String(this.gameId).slice(-4).toUpperCase()}`;
  }

  get highestReturn(): number {
    const list = this.getLeaderboardList();
    if (!list || list.length === 0) return 0;
    return Math.max(...list.map(i => i.returnPct));
  }

  get lowestReturn(): number {
    const list = this.getLeaderboardList();
    if (!list || list.length === 0) return 0;
    return Math.min(...list.map(i => i.returnPct));
  }

  getLeaderboardList(): any[] {
    return getGameLeaderboard(this.game);
  }

  ngOnInit() {
    this.customOptions = {
      loop: true,
      dots: true,
      navSpeed: 2000,
      navText: ['', ''],
      items: 2
    };
    this.activatedRoute.params.subscribe(({id}) => {
      this.gameId = id;
      this.user = this.portfolioService.user;
      let userType = 'player';
      if (this.user.isAdmin) {
        userType = 'admin';
      }
      this.loadCrackers();
      this.portfolioService.onJoinGame(this.gameId, this.user.socketId, userType, this.user.userName, this.user.id);
      this.portfolioService.onGetGame(this.gameId);
      this.gameStatus = this.portfolioService.gameStatus.subscribe((res: any) => {
        if (res === undefined || (res && res.error) || (res && res.msg)) {
          let errorMsg = (res && res.msg) ? res.msg : 'Game full. Please refresh.';
          UtilityService.showError(errorMsg);
          this.route.navigate(['']);
        } else {
          this.game = this.portfolioService.game;
          this.onPlayerReady = res;
          let game_status = true;
          this.game.players.forEach(player => {
            console.log(player);
            if (player.game_status !== 'ready') {
              game_status = false;
            }
          });
          if (this.game.players.length !== 4) {
            game_status = false;
          } else {
            this.portfolioLeaderValue = [0];
            this.portfolioLeaderId = [''];
            this.leaderName = [''];
            let status_time = 60000;
            console.log(this.game.roundReady);
            if (this.game.roundReady) {
              this.roundReady = true;
            }
            this.game.players.forEach(player => {
              this.gameEnd = (player.rounds.length === 8 && this.game.game_status === 'completed');
              for (let i = player.rounds.length - 1; i >= 0; i--) {
                if (player.rounds[i] && player.rounds[i].status === 'complete') {
                  if ((i + 1) % 4 === 0) {
                    this.isYearEnd = true;
                    status_time += 10000;
                    this.quarter = 4;
                    this.year = Math.trunc((i + 1) / 5) + 1;
                  } else {
                    this.quarter = (i + 1) % 4;
                    this.year = Math.trunc((i + 1) / 4) + 1;
                  }
                  if (player.rounds[i].total_portfolio_value > this.portfolioLeaderValue[0] && this.portfolioLeaderValue.length === 1) {
                    this.portfolioLeaderValue[0] = player.rounds[i].total_portfolio_value;
                    this.portfolioLeaderId[0] = player._id;
                    this.leaderName[0] = player.name;
                  } else if (player.rounds[i].total_portfolio_value === this.portfolioLeaderValue[0] && this.portfolioLeaderValue.length >= 1) {
                    this.portfolioLeaderValue.push(player.rounds[i].total_portfolio_value);
                    this.portfolioLeaderId.push(player._id);
                    this.leaderName.push(player.name);
                  }
                  break;
                }
              }
            });
            if (this.isYearEnd && !this._ifLeaderShown && !this.gameEnd) {
              this._ifLeaderShown = true;
              if (this.portfolioLeaderValue.length === 1) {
                UtilityService.showMessage("Leader is " + this.leaderName[0], true, 10000);
              } else {
                let leaderMsg = "Leaders are " + this.leaderName[0];
                for (let x = 1; x < this.leaderName.length; x++) {
                  leaderMsg += ", " + this.leaderName[x];
                }
                UtilityService.showMessage(leaderMsg, true, 10000);
              }
            }
            if (this.gameEnd && !this._ifLeaderShown) {
              this.playCrackers();
              this.triggerCelebration();
              this._ifLeaderShown = true;
              this.roundNumber = 8;
              if (this.portfolioLeaderValue.length === 1) {
                UtilityService.showMessage("Winner is " + this.leaderName[0], false, 10000);
              } else {
                let leaderMsg = "Winners are " + this.leaderName[0];
                for (let x = 1; x < this.leaderName.length; x++) {
                  leaderMsg += ", " + this.leaderName[x];
                }
                UtilityService.showMessage(leaderMsg, false, 10000);
              }
              setTimeout(() => {
                this.pauseCrackers();
              }, 10000);
            }
            if (this.user.isAdmin) {
              clearTimeout(this.status_timer);
            } else {
              if (this.game.roundReady) {
                if (this._ifTimer) {
                  this._ifTimer = false;
                  this.status_timer = setTimeout(() => {
                    let navExtra = this.portfolioService.getNavValue(this.user.id);
                    let navigationExtras: NavigationExtras = {
                      state: navExtra
                    };
                    console.log('that is called');
                    clearTimeout(this.status_timer);
                    this.gameStatus.unsubscribe();
                    this.route.navigate([`investment/${this.gameId}`], navigationExtras);
                  }, status_time);
                }
              } else {
                clearTimeout(this.status_timer);
              }
            }
          }
          this.onPlayerReady = game_status;
        }
      });
    });
  }

  onGameStart() {
    this.portfolioService.onGameStart(this.gameId);
    clearTimeout(this.status_timer);
    this.route.navigate([`game/${this.gameId}`]);
  }

  onGameContinue() {
    let navExtra = this.portfolioService.getNavValue(this.user.id);
    let navigationExtras: NavigationExtras = {
      state: navExtra
    };
    clearTimeout(this.status_timer);
    this.gameStatus.unsubscribe();
    this.route.navigate([`investment/${this.gameId}`], navigationExtras);
  }

  onBack() {
    this.gameStatus.unsubscribe();
    this.portfolioService.onPlayerLeaveGame(this.gameId, this.user.socketId, this.user.id);
    clearTimeout(this.status_timer);
    this.route.navigate(['']);
  }

  loadCrackers() {
    this.audio1 = new Audio()
    this.audio2 = new Audio();
    this.audio1.src = "../assets/audios/crackers.mp3";
    this.audio2.src = "../assets/audios/crackers2.mp3";
    this.audio1.loop = true;
    this.audio2.loop = true;
    this.audio1.muted = true;
    this.audio2.muted = true;
    this.audio1.load();
    this.audio2.load();
  }

  playCrackers() {
    this.audio1.play();
    this.audio2.play();
    this.audio1.muted = false;
    this.audio2.muted = false;
  }

  pauseCrackers() {
    this.audio1.pause();
    this.audio2.pause();
  }

  onGoBack() {
    this.gameStatus.unsubscribe();
    this.portfolioService.onPlayerLeaveGame(this.gameId, this.user.socketId, this.user.id);
    clearTimeout(this.status_timer);
    if (this.user && this.user.isAdmin) {
      this.route.navigate(['']);
    } else {
      this.portfolioService.onLogout().subscribe(() => {
        this.route.navigate(['/login']);
      });
    }
  }

  onRoundContinue() {
    this.portfolioService.onRoundReady(this.gameId);
    clearTimeout(this.status_timer);
  }

  getRoundValue(i) {
    this.roundNumber = i;
  }

  get connectedPlayerCount(): number {
    return (this.game && this.game.players)
      ? this.game.players.filter((p: any) => p.status === 'active').length
      : 0;
  }

  private get winnerEntry(): any {
    const list = this.getLeaderboardList();
    return list && list.length > 0 ? list[0] : null;
  }

  get isWinner(): boolean {
    const w = this.winnerEntry;
    return !!(w && this.user && !this.user.isAdmin && w._id === this.user.id);
  }

  get winnerName(): string {
    return this.winnerEntry?.name || '';
  }

  get winnerNetWorth(): number {
    return this.winnerEntry?.netWorth ?? 0;
  }

  get winnerROI(): number {
    return this.winnerEntry?.returnPct ?? 0;
  }

  triggerCelebration(): void {
    if (this.isWinner && !this.showCelebration) {
      this.celebrationVideoSrc = 'assets/videos/celebration.mp4';
      this.showCelebration = true;
      this.videoEnded = false;
    }
  }

  onVideoEnded(): void {
    this.videoEnded = true;
    if (this.celebrationVideoRef?.nativeElement) {
      this.celebrationVideoRef.nativeElement.src = '';
    }
  }

  dismissCelebration(): void {
    this.showCelebration = false;
    this.celebrationVideoSrc = '';
    this.videoEnded = false;
  }
}
