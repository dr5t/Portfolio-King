import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {PortfolioService} from '../../services/portfolio/portfolio.service';

@Component({
  standalone: false,
  selector: 'app-admin-overview',
  templateUrl: './admin-overview.component.html',
  styleUrls: ['../admin-page.scss']
})
export class AdminOverviewComponent implements OnInit, OnDestroy {
  games: any[] = [];
  teams: any[] = [];
  loadingGames = true;
  loadingTeams = true;
  gamesError = '';
  teamsError = '';
  monthlyActivity: Array<{ label: string, count: number }> = [];
  readonly statuses = ['active', 'waiting', 'paused', 'completed', 'archived'];
  private socketHandler: (game: any) => void;
  private socketDeleteHandler: (event: any) => void;
  private notificationHandler: () => void;
  private destroyed = false;

  constructor(private portfolioService: PortfolioService, private router: Router,
              private changeDetector: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.loadGames();
    this.loadTeams();
    const socket = this.portfolioService.socket;
    if (socket) {
      this.socketHandler = (game: any) => {
        if (!game || !game._id) return;
        const id = String(game._id);
        const idx = this.games.findIndex(g => String(g._id) === id);
        if (idx >= 0) {
          this.games[idx] = { ...this.games[idx], ...game };
        } else {
          this.games.push(game);
        }
        this.monthlyActivity = this.buildMonthlyActivity(this.games);
        if (!this.destroyed) this.changeDetector.detectChanges();
      };
      this.socketDeleteHandler = (event: any) => {
        const id = event && event.gameId ? String(event.gameId) : '';
        if (id) {
          this.games = this.games.filter(game => String(game._id) !== id);
          this.monthlyActivity = this.buildMonthlyActivity(this.games);
          if (!this.destroyed) this.changeDetector.detectChanges();
        }
      };
      this.notificationHandler = () => {
        this.loadGames();
        this.loadTeams();
      };
      socket.on('game-updated', this.socketHandler);
      socket.on('game-deleted', this.socketDeleteHandler);
      socket.on('admin-notification', this.notificationHandler);
      socket.on('teams-updated', this.notificationHandler);
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    const socket = this.portfolioService.socket;
    if (socket && this.socketHandler) socket.off('game-updated', this.socketHandler);
    if (socket && this.socketDeleteHandler) socket.off('game-deleted', this.socketDeleteHandler);
    if (socket && this.notificationHandler) {
      socket.off('admin-notification', this.notificationHandler);
      socket.off('teams-updated', this.notificationHandler);
    }
  }

  loadGames() {
    this.portfolioService.getAllGames().subscribe(
      (games: any) => {
        this.games = games || [];
        this.monthlyActivity = this.buildMonthlyActivity(this.games);
        this.loadingGames = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      },
      error => {
        this.gamesError = this.errorMessage(error, 'Could not load game statistics.');
        this.loadingGames = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      }
    );
  }

  loadTeams() {
    this.portfolioService.getTeams().subscribe(
      (teams: any) => {
        this.teams = teams || [];
        this.loadingTeams = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      },
      error => {
        this.teamsError = this.errorMessage(error, 'Could not load team statistics.');
        this.loadingTeams = false;
        if (!this.destroyed) this.changeDetector.detectChanges();
      }
    );
  }

  get activeGamesCount(): number {
    return this.games.filter(game => game.game_status === 'active' || game.game_status === 'in_progress').length;
  }

  get waitingGamesCount(): number {
    return this.games.filter(game => game.game_status === 'waiting' || game.game_status === 'ready').length;
  }

  get completedGamesCount(): number {
    return this.games.filter(game => game.game_status === 'completed').length;
  }

  get totalTeamsCount(): number {
    return this.teams.length;
  }

  get assignedTeamsCount(): number {
    const validGameIds = new Set(this.games.map(g => String(g._id)));
    return this.teams.filter(t => t.gameId && validGameIds.has(String(t.gameId))).length;
  }

  get unassignedTeamsCount(): number {
    const validGameIds = new Set(this.games.map(g => String(g._id)));
    return this.teams.filter(t => !t.gameId || !validGameIds.has(String(t.gameId))).length;
  }

  get connectedTeamsCount(): number {
    return this.teams.filter(t => t.isConnected).length;
  }

  getConnectedCount(game: any): number {
    if (game && typeof game.connectedPlayerCount === 'number') {
      return game.connectedPlayerCount;
    }
    if (!game || !Array.isArray(game.players)) return 0;
    const activeTeams = new Set<string>();
    for (const p of game.players) {
      if (p && p.status === 'active') {
        const key = String(p.teamId || p._id || p.name || '');
        if (key) activeTeams.add(key);
      }
    }
    return activeTeams.size;
  }

  countByStatus(status: string): number {
    return this.games.filter(game => {
      const current = game.game_status === 'in_progress' ? 'active' : game.game_status;
      return current === status || (status === 'waiting' && current === 'ready');
    }).length;
  }

  get maxMonthlyCount(): number {
    return Math.max(1, ...this.monthlyActivity.map(month => month.count));
  }

  get recentGames(): any[] {
    return this.games.slice().sort((a, b) =>
      new Date(b.timestamp || b.createdAt || 0).getTime() -
      new Date(a.timestamp || a.createdAt || 0).getTime()
    ).slice(0, 5);
  }

  openCreateGame() {
    this.router.navigate(['/admin/games'], { queryParams: { action: 'create' } });
  }

  navigateToGames(status: string) {
    this.router.navigate(['/admin/games'], {
      queryParams: { status: status || 'all' }
    });
  }

  navigateToSessions() {
    this.router.navigate(['/admin/sessions']);
  }

  navigateToTeams(filter: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.router.navigate(['/admin/teams'], {
      queryParams: { filter: filter || 'all' }
    });
  }

  private buildMonthlyActivity(games: any[]): Array<{ label: string, count: number }> {
    const now = new Date();
    const months = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthGames = games.filter(game => {
        const created = new Date(game.timestamp || game.createdAt || 0);
        return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth();
      });
      months.push({
        label: date.toLocaleString('en', { month: 'short' }),
        count: monthGames.length
      });
    }
    return months;
  }

  private errorMessage(error: any, fallback: string): string {
    if (error && error.status === 401) {
      this.portfolioService.clearExpiredSession('Your admin session has expired. Please sign in again.');
      return '';
    }
    return error && error.error && error.error.message ? error.error.message : fallback;
  }

  statusClass(status: string): string {
    if (status === 'active' || status === 'in_progress') return 'status-active';
    if (status === 'completed') return 'status-completed';
    if (status === 'paused') return 'status-paused';
    if (status === 'archived') return 'status-archived';
    return 'status-waiting';
  }

  refresh() {
    this.loadingGames = true;
    this.loadingTeams = true;
    this.gamesError = '';
    this.teamsError = '';
    this.loadGames();
    this.loadTeams();
  }
}
