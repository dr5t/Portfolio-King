import {ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {PortfolioService} from '../../services/portfolio/portfolio.service';

@Component({
  standalone: false,
  selector: 'app-admin-overview',
  templateUrl: './admin-overview.component.html',
  styleUrls: ['../admin-page.scss']
})
export class AdminOverviewComponent implements OnInit {
  games: any[] = [];
  teams: any[] = [];
  loadingGames = true;
  loadingTeams = true;
  gamesError = '';
  teamsError = '';
  monthlyActivity: Array<{ label: string, count: number }> = [];
  readonly statuses = ['active', 'waiting', 'paused', 'completed', 'archived'];

  constructor(private portfolioService: PortfolioService, private router: Router,
              private changeDetector: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.loadGames();
    this.loadTeams();
  }

  loadGames() {
    this.portfolioService.getAllGames().subscribe(
      (games: any) => {
        this.games = games || [];
        this.monthlyActivity = this.buildMonthlyActivity(this.games);
        this.loadingGames = false;
        this.changeDetector.detectChanges();
      },
      error => {
        this.gamesError = this.errorMessage(error, 'Could not load game statistics.');
        this.loadingGames = false;
        this.changeDetector.detectChanges();
      }
    );
  }

  loadTeams() {
    this.portfolioService.getTeams().subscribe(
      (teams: any) => {
        this.teams = teams || [];
        this.loadingTeams = false;
        this.changeDetector.detectChanges();
      },
      error => {
        this.teamsError = this.errorMessage(error, 'Could not load team statistics.');
        this.loadingTeams = false;
        this.changeDetector.detectChanges();
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
