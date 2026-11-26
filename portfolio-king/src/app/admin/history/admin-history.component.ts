import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {PortfolioService} from '../../services/portfolio/portfolio.service';
import {getGameLeaderboard} from '../../shared/utils/game-results';

@Component({
  standalone: false,
  selector: 'app-admin-history',
  templateUrl: './admin-history.component.html',
  styleUrls: ['../admin-page.scss']
})
export class AdminHistoryComponent implements OnInit, OnDestroy {
  games: any[] = [];
  loading = true;
  error = '';
  search = '';
  statusFilter = 'all';
  dateFrom = '';
  dateTo = '';
  private socketHandler: () => void;
  private socketDeleteHandler: () => void;
  private notificationHandler: () => void;
  private destroyed = false;

  constructor(private portfolioService: PortfolioService, private changeDetector: ChangeDetectorRef) {
  }

  ngOnInit() {
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
        this.games = games || [];
        this.loading = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      },
      error => {
        this.error = this.errorMessage(error, 'Could not load game history.');
        this.loading = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      }
    );
  }

  get completedGames(): any[] {
    return this.games.filter(game => game.game_status === 'completed' || game.game_status === 'archived');
  }

  get filteredGames(): any[] {
    const query = this.search.trim().toLowerCase();
    const from = this.dateFrom ? new Date(`${this.dateFrom}T00:00:00`).getTime() : null;
    const to = this.dateTo ? new Date(`${this.dateTo}T23:59:59.999`).getTime() : null;
    return this.completedGames.filter(game => {
      const name = (game.name || '').toLowerCase();
      const id = String(game._id || '').toLowerCase();
      const status = game.game_status || 'completed';
      const timestamp = new Date(game.timestamp || game.createdAt || 0).getTime();
      return (!query || name.includes(query) || id.includes(query)) &&
        (this.statusFilter === 'all' || status === this.statusFilter) &&
        (from === null || timestamp >= from) &&
        (to === null || timestamp <= to);
    }).sort((a, b) =>
      new Date(b.timestamp || b.createdAt || 0).getTime() -
      new Date(a.timestamp || a.createdAt || 0).getTime()
    );
  }

  winner(game: any): string {
    const leaderboard = getGameLeaderboard(game);
    return leaderboard.length ? leaderboard[0].name || '—' : '—';
  }

  exportGame(game: any) {
    this.portfolioService.downloadGameCsv(String(game._id)).subscribe(
      file => {
        const url = window.URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `portfolio-king-${String(game._id).slice(-4).toUpperCase()}.csv`;
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
