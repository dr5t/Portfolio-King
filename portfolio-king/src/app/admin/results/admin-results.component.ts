import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {PortfolioService} from '../../services/portfolio/portfolio.service';
import {getGameLeaderboard} from '../../shared/utils/game-results';

@Component({
  standalone: false,
  selector: 'app-admin-results',
  templateUrl: './admin-results.component.html',
  styleUrls: ['../admin-page.scss']
})
export class AdminResultsComponent implements OnInit, OnDestroy {
  games: any[] = [];
  selectedGameId = '';
  loading = true;
  error = '';
  showAnalytics = false;
  private socketHandler: () => void;
  private socketDeleteHandler: () => void;
  private notificationHandler: () => void;
  private destroyed = false;

  constructor(private portfolioService: PortfolioService, private route: ActivatedRoute,
              private changeDetector: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params.gameId) this.selectedGameId = String(params.gameId);
    });
    this.loadGames();
    const socket = this.portfolioService.socket;
    if (socket) {
      this.socketHandler = () => this.loadGames();
      this.socketDeleteHandler = () => this.loadGames();
      this.notificationHandler = () => this.loadGames();
      socket.on('game-updated', this.socketHandler);
      socket.on('game-deleted', this.socketDeleteHandler);
      socket.on('admin-notification', this.notificationHandler);
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    const socket = this.portfolioService.socket;
    if (socket && this.socketHandler) socket.off('game-updated', this.socketHandler);
    if (socket && this.socketDeleteHandler) socket.off('game-deleted', this.socketDeleteHandler);
    if (socket && this.notificationHandler) socket.off('admin-notification', this.notificationHandler);
  }

  loadGames() {
    this.loading = true;
    this.error = '';
    this.portfolioService.getAllGames().subscribe(
      (games: any) => {
        this.games = (games || []).filter(game => game.game_status === 'completed');
        if (!this.games.some(game => String(game._id) === this.selectedGameId)) {
          this.selectedGameId = this.games.length ? String(this.games[0]._id) : '';
        }
        this.loading = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      },
      error => {
        this.error = this.errorMessage(error, 'Could not load completed game results.');
        this.loading = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      }
    );
  }

  get selectedGame(): any {
    return this.games.find(game => String(game._id) === this.selectedGameId);
  }

  get leaderboard(): any[] {
    return getGameLeaderboard(this.selectedGame);
  }

  selectGame(gameId: string) {
    this.selectedGameId = gameId;
  }

  get maxReturnMagnitude(): number {
    return Math.max(1, ...this.leaderboard.map(item => Math.abs(item.returnPct)));
  }

  returnBarWidth(item: any): number {
    return Math.abs(item.returnPct) / this.maxReturnMagnitude * 100;
  }

  get roundsRecorded(): number {
    return this.selectedGame && this.selectedGame.players
      ? Math.max(0, ...this.selectedGame.players.map(player => (player.rounds || []).length))
      : 0;
  }

  exportResults() {
    if (!this.selectedGame) return;
    this.portfolioService.downloadGameCsv(String(this.selectedGame._id)).subscribe(
      file => {
        const url = window.URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `portfolio-king-${String(this.selectedGame._id).slice(-4).toUpperCase()}.csv`;
        link.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 0);
      },
      error => this.errorMessage(error, 'Could not export game results.')
    );
  }

  private errorMessage(error: any, fallback: string): string {
    if (error && error.status === 401) {
      this.portfolioService.clearExpiredSession('Your admin session has expired. Please sign in again.');
      return '';
    }
    this.error = error && error.error && error.error.message ? error.error.message : fallback;
    this.changeDetector.detectChanges();
    return this.error;
  }
}
