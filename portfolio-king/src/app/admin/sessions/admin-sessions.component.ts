import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {PortfolioService} from '../../services/portfolio/portfolio.service';
import {UtilityService} from '../../shared/utils/utility-service';

@Component({
  standalone: false,
  selector: 'app-admin-sessions',
  templateUrl: './admin-sessions.component.html',
  styleUrls: ['../admin-page.scss']
})
export class AdminSessionsComponent implements OnInit, OnDestroy {
  games: any[] = [];
  loading = true;
  error = '';
  private socketHandler: (game: any) => void;
  private socketDeleteHandler: (event: any) => void;
  private notificationHandler: () => void;

  constructor(private portfolioService: PortfolioService, private router: Router,
              private changeDetector: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.loadGames();
    const socket = this.portfolioService.socket;
    if (socket) {
      this.socketHandler = game => this.updateGame(game);
      this.socketDeleteHandler = event => {
        const id = event && event.gameId ? String(event.gameId) : '';
        this.games = this.games.filter(game => String(game._id) !== id);
        this.changeDetector.detectChanges();
      };
      this.notificationHandler = () => this.loadGames();
      socket.on('game-updated', this.socketHandler);
      socket.on('game-deleted', this.socketDeleteHandler);
      socket.on('admin-notification', this.notificationHandler);
    }
  }

  ngOnDestroy() {
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
        this.changeDetector.detectChanges();
      },
      error => {
        this.error = this.errorMessage(error, 'Could not load live sessions.');
        this.loading = false;
        this.changeDetector.detectChanges();
      }
    );
  }

  get sessions(): any[] {
    return this.games.filter(game =>
      ['active', 'in_progress', 'paused', 'waiting', 'ready'].indexOf(game.game_status) >= 0
    );
  }

  get connectedTeamsCount(): number {
    return this.sessions.reduce((count, game) => count + this.connectedPlayers(game).length, 0);
  }

  countByStatus(status: string): number {
    return this.sessions.filter(game => game.game_status === status ||
      (status === 'waiting' && game.game_status === 'ready')).length;
  }

  connectedPlayers(game: any): any[] {
    return (game.players || []).filter(player => player.status === 'active');
  }

  currentRound(game: any): number {
    const rounds = (game.players || []).map(player => (player.rounds || []).length);
    return rounds.length ? Math.max(...rounds) : 0;
  }

  sessionLabel(game: any): string {
    if (game.game_status === 'active' || game.game_status === 'in_progress') return 'In Progress';
    if (game.game_status === 'ready') return 'Waiting';
    return game.game_status || 'Waiting';
  }

  statusClass(status: string): string {
    if (status === 'active' || status === 'in_progress') return 'status-active';
    if (status === 'paused') return 'status-paused';
    if (status === 'waiting' || status === 'ready') return 'status-waiting';
    return '';
  }

  changeStatus(game: any, status: string) {
    this.portfolioService.updateGameLifecycleStatus(String(game._id), status).subscribe(
      () => {
        game.game_status = status;
        const label = status === 'completed' ? 'ended' : status === 'active' ? 'resumed' : status;
        UtilityService.showMessage(`Session ${label}.`, false, 2200);
        this.changeDetector.detectChanges();
      },
      error => this.errorMessage(error, 'Could not update this session.')
    );
  }

  openGame(game: any) {
    this.router.navigate(['/game-status', game._id]);
  }

  private updateGame(game: any) {
    if (!game || !game._id) return;
    const index = this.games.findIndex(item => String(item._id) === String(game._id));
    if (index < 0) this.games.unshift(game);
    else this.games[index] = game;
    this.changeDetector.detectChanges();
  }

  private errorMessage(error: any, fallback: string): string {
    if (error && error.status === 401) {
      this.portfolioService.clearExpiredSession('Your admin session has expired. Please sign in again.');
      return '';
    }
    this.error = error && error.error && error.error.message ? error.error.message : fallback;
    return this.error;
  }
}
