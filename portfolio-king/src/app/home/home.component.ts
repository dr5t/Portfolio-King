import {Component, OnInit} from '@angular/core';
import * as $ from 'jquery';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {Router, ActivatedRoute} from "@angular/router";
import {UtilityService} from "../shared/utils/utility-service";

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public allGames: any[] = [];
  public filteredGames: any[] = [];
  public currGames: any[] = [];
  public prevGames: any[] = [];
  public _user: any;

  // Search & Filter
  public gameSearchQuery: string = '';
  public gameStatusFilter: string = 'all';

  // Game Management State
  public showCreateGameModal: boolean = false;
  public newGameName: string = '';
  public editingGameId: string = null;
  public editingGameName: string = '';
  public gameToDelete: any = null;
  public deleteConfirmGameName: string = '';
  public showDeleteGameModal: boolean = false;
  public activeActionMenuGameId: string = null;

  toggleActionMenu(gameId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.activeActionMenuGameId = this.activeActionMenuGameId === gameId ? null : gameId;
  }

  closeActionMenu() {
    this.activeActionMenuGameId = null;
  }

  get totalGamesCount(): number {
    return this.allGames ? this.allGames.length : 0;
  }

  get runningGamesCount(): number {
    if (!this.allGames) return 0;
    return this.allGames.filter(g => g.game_status === 'active' || g.game_status === 'in_progress').length;
  }

  get waitingGamesCount(): number {
    if (!this.allGames) return 0;
    return this.allGames.filter(g => g.game_status === 'waiting' || g.game_status === 'ready').length;
  }

  get completedGamesCount(): number {
    if (!this.allGames) return 0;
    return this.allGames.filter(g => g.game_status === 'completed').length;
  }

  get archivedGamesCount(): number {
    if (!this.allGames) return 0;
    return this.allGames.filter(g => g.game_status === 'archived').length;
  }

  getGameShortId(id: string): string {
    if (!id) return 'PKG-0000';
    return `PKG-${id.slice(-4).toUpperCase()}`;
  }

  // Team Management State
  public showManageTeams: boolean = false;
  public selectedGameId: string = '';
  public teamsList: any[] = [];
  public showCreateTeamForm: boolean = false;
  public newTeamName: string = '';
  public newTeamId: string = '';
  public newTeamPassword: string = '';
  public latestCredentials: any[] = [];
  public editingTeamId: string = null;
  public editingTeamName: string = '';
  public teamToDelete: any = null;
  public showDeleteConfirm: boolean = false;

  // Active view tab
  public activeTab: string = 'overview';

  constructor(private portfolioService: PortfolioService,
              private router: Router,
              private activatedRoute: ActivatedRoute) {
  }

  ngOnInit() {
    this.activatedRoute.queryParams.subscribe(params => {
      if (params['tab']) {
        this.activeTab = params['tab'];
        if (this.activeTab === 'teams') {
          this.showManageTeams = true;
        }
      }
    });
    this.init();
  }

  init() {
    this._user = this.portfolioService.user;
    UtilityService.showLoader();
    this.onGetGames();
  }

  onGetGames() {
    this.portfolioService.getAllGames().subscribe(
      (games: any) => {
        this.allGames = games || [];
        this.currGames = [];
        this.prevGames = [];
        this.allGames.forEach((game, i) => {
          game._index = i + 1;
          if (!game.name) {
            game.name = `Game ${i + 1}`;
          }
          if (game.game_status === 'active' || game.game_status === 'paused' || game.game_status === 'waiting' || game.game_status === 'ready') {
            this.currGames.push(game);
          } else {
            this.prevGames.push(game);
          }
        });
        if (this.currGames.length > 0 && !this.selectedGameId) {
          this.selectedGameId = this.currGames[this.currGames.length - 1]._id;
        } else if (this.allGames.length > 0 && !this.selectedGameId) {
          this.selectedGameId = this.allGames[0]._id;
        }
        this.applyGameFilters();
        UtilityService.hideLoader();
      },
      (err: any) => {
        UtilityService.hideLoader();
        UtilityService.showError('Failed to load games.');
      }
    );
  }

  applyGameFilters() {
    const query = (this.gameSearchQuery || '').trim().toLowerCase();
    const filter = this.gameStatusFilter;

    this.filteredGames = this.allGames.filter(game => {
      const name = (game.name || '').toLowerCase();
      const id = String(game._id || '').toLowerCase();
      const matchesSearch = !query || name.includes(query) || id.includes(query);

      const status = (game.game_status || 'waiting').toLowerCase();
      let matchesStatus = true;
      if (filter !== 'all') {
        if (filter === 'in_progress') {
          matchesStatus = status === 'active' || status === 'in_progress';
        } else {
          matchesStatus = status === filter;
        }
      }

      return matchesSearch && matchesStatus;
    });
  }

  // --- GAME MANAGEMENT ---

  openCreateGameModal() {
    this.newGameName = `Game ${this.allGames.length + 1}`;
    this.showCreateGameModal = true;
  }

  cancelCreateGame() {
    this.showCreateGameModal = false;
    this.newGameName = '';
  }

  onCreateGame() {
    UtilityService.showLoader();
    const name = this.newGameName.trim() || undefined;
    this.portfolioService.createGame(name).subscribe(
      (res: any) => {
        const newGame = res.ops[0];
        newGame._index = this.allGames.length + 1;
        if (!newGame.name) newGame.name = `Game ${newGame._index}`;
        this.allGames.push(newGame);
        this.currGames.push(newGame);
        this.selectedGameId = newGame._id;
        this.showCreateGameModal = false;
        this.newGameName = '';
        this.applyGameFilters();
        UtilityService.hideLoader();
        UtilityService.showMessage(`Created ${newGame.name} successfully.`, false, 2500);
      },
      (err: any) => {
        UtilityService.hideLoader();
        UtilityService.showError('Failed to create game.');
      }
    );
  }

  startRenameGame(game: any) {
    this.editingGameId = game._id;
    this.editingGameName = game.name || `Game ${game._index}`;
  }

  saveRenameGame(game: any) {
    if (!this.editingGameName || !this.editingGameName.trim()) return;
    const trimmed = this.editingGameName.trim();
    this.portfolioService.renameGame(game._id, trimmed).subscribe(
      () => {
        game.name = trimmed;
        this.editingGameId = null;
        UtilityService.showMessage('Game renamed successfully.', false, 2000);
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to rename game.';
        UtilityService.showError(msg);
      }
    );
  }

  cancelRenameGame() {
    this.editingGameId = null;
    this.editingGameName = '';
  }

  onDuplicateGame(game: any) {
    UtilityService.showLoader();
    this.portfolioService.duplicateGame(game._id).subscribe(
      (res: any) => {
        UtilityService.hideLoader();
        if (res.game) {
          res.game._index = this.allGames.length + 1;
          this.allGames.push(res.game);
          this.currGames.push(res.game);
          this.selectedGameId = res.game._id;
          this.applyGameFilters();
          UtilityService.showMessage(`Duplicated as "${res.game.name}".`, false, 2500);
        }
      },
      (err: any) => {
        UtilityService.hideLoader();
        UtilityService.showError('Failed to duplicate game.');
      }
    );
  }

  onToggleGamePause(game: any) {
    const newStatus = game.game_status === 'active' ? 'paused' : 'active';
    this.portfolioService.updateGameLifecycleStatus(game._id, newStatus).subscribe(
      () => {
        game.game_status = newStatus;
        this.applyGameFilters();
        UtilityService.showMessage(`Game is now ${newStatus}.`, false, 2000);
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to update game status.';
        UtilityService.showError(msg);
      }
    );
  }

  onArchiveGame(game: any) {
    const newStatus = game.game_status === 'archived' ? 'completed' : 'archived';
    this.portfolioService.updateGameLifecycleStatus(game._id, newStatus).subscribe(
      () => {
        game.game_status = newStatus;
        this.applyGameFilters();
        UtilityService.showMessage(`Game ${newStatus === 'archived' ? 'archived' : 'unarchived'} successfully.`, false, 2000);
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to archive game.';
        UtilityService.showError(msg);
      }
    );
  }

  promptDeleteGame(game: any) {
    if (game.game_status === 'active') {
      UtilityService.showError('Active game cannot be deleted. End or pause the game before deletion.');
      return;
    }
    this.gameToDelete = game;
    this.deleteConfirmGameName = '';
    this.showDeleteGameModal = true;
  }

  cancelDeleteGame() {
    this.gameToDelete = null;
    this.deleteConfirmGameName = '';
    this.showDeleteGameModal = false;
  }

  confirmDeleteGame() {
    if (!this.gameToDelete) return;
    const expected = (this.gameToDelete.name || '').trim();
    if (this.deleteConfirmGameName.trim().toLowerCase() !== expected.toLowerCase()) {
      UtilityService.showError(`Confirmation name does not match "${expected}".`);
      return;
    }
    UtilityService.showLoader();
    this.portfolioService.deleteGame(this.gameToDelete._id, this.deleteConfirmGameName.trim()).subscribe(
      () => {
        UtilityService.hideLoader();
        const deletedId = this.gameToDelete._id;
        this.allGames = this.allGames.filter(g => g._id !== deletedId);
        this.currGames = this.currGames.filter(g => g._id !== deletedId);
        this.prevGames = this.prevGames.filter(g => g._id !== deletedId);
        this.cancelDeleteGame();
        this.applyGameFilters();
        UtilityService.showMessage('Game and associated credentials deleted.', false, 2500);
      },
      (err: any) => {
        UtilityService.hideLoader();
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to delete game.';
        UtilityService.showError(msg);
      }
    );
  }

  onExportGameCsv(game: any) {
    const url = this.portfolioService.getGameCsvExportUrl(game._id);
    window.open(url, '_blank');
  }

  // --- TEAM MANAGEMENT ---

  toggleManageTeams() {
    this.showManageTeams = !this.showManageTeams;
    if (this.showManageTeams) {
      if (!this.selectedGameId && this.allGames.length > 0) {
        this.selectedGameId = this.allGames[this.allGames.length - 1]._id;
      }
      this.loadTeamsForSelectedGame();
    }
  }

  onSelectManageGame(gameId: string) {
    this.selectedGameId = gameId;
    this.loadTeamsForSelectedGame();
  }

  loadTeamsForSelectedGame() {
    if (!this.selectedGameId) return;
    this.portfolioService.getTeams(this.selectedGameId).subscribe(
      (teams: any) => {
        this.teamsList = teams || [];
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to load teams.';
        UtilityService.showError(msg);
      }
    );
  }

  onAutoGenerateTeams() {
    if (!this.selectedGameId && this.allGames && this.allGames.length > 0) {
      this.selectedGameId = this.allGames[this.allGames.length - 1]._id;
    }
    if (!this.selectedGameId) return;
    UtilityService.showLoader();
    this.portfolioService.generateAllTeams(this.selectedGameId).subscribe(
      (res: any) => {
        UtilityService.hideLoader();
        this.latestCredentials = res.teams || [];
        this.loadTeamsForSelectedGame();
        UtilityService.showMessage(`Generated ${res.teams.length} teams successfully.`, false, 3000);
      },
      (err: any) => {
        UtilityService.hideLoader();
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to auto-generate teams.';
        UtilityService.showError(msg);
      }
    );
  }

  onCreateSingleTeam() {
    if (!this.selectedGameId) return;
    if (!this.newTeamName || !this.newTeamName.trim()) {
      UtilityService.showError('Missing required fields.');
      return;
    }
    UtilityService.showLoader();
    this.portfolioService.createTeam({
      gameId: this.selectedGameId,
      name: this.newTeamName.trim(),
      teamId: this.newTeamId.trim() || undefined,
      password: this.newTeamPassword.trim() || undefined
    }).subscribe(
      (res: any) => {
        UtilityService.hideLoader();
        this.latestCredentials = [{
          name: res.team.name,
          teamId: res.team.teamId,
          rawPassword: res.rawPassword
        }];
        this.newTeamName = '';
        this.newTeamId = '';
        this.newTeamPassword = '';
        this.showCreateTeamForm = false;
        this.loadTeamsForSelectedGame();
        UtilityService.showMessage('Team created successfully.', false, 2500);
      },
      (err: any) => {
        UtilityService.hideLoader();
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to create team.';
        UtilityService.showError(msg);
      }
    );
  }

  startEditTeam(team: any) {
    this.editingTeamId = team._id;
    this.editingTeamName = team.name;
  }

  saveEditTeam(team: any) {
    if (!this.editingTeamName || !this.editingTeamName.trim()) return;
    this.portfolioService.updateTeam(team._id, { name: this.editingTeamName.trim() }).subscribe(
      () => {
        team.name = this.editingTeamName.trim();
        this.editingTeamId = null;
        UtilityService.showMessage('Team name updated.', false, 2000);
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to update team.';
        UtilityService.showError(msg);
      }
    );
  }

  cancelEditTeam() {
    this.editingTeamId = null;
    this.editingTeamName = '';
  }

  onToggleTeamStatus(team: any) {
    const newStatus = team.status === 'active' ? 'disabled' : 'active';
    this.portfolioService.updateTeam(team._id, { status: newStatus }).subscribe(
      () => {
        team.status = newStatus;
        UtilityService.showMessage(`Team is now ${newStatus}.`, false, 2000);
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to update team status.';
        UtilityService.showError(msg);
      }
    );
  }

  onResetTeamPassword(team: any) {
    this.portfolioService.resetTeamPassword(team._id).subscribe(
      (res: any) => {
        this.latestCredentials = [{
          name: team.name,
          teamId: res.teamId,
          rawPassword: res.rawPassword
        }];
        UtilityService.showMessage('Password reset successfully. Copy new credentials above.', false, 3000);
      },
      (err: any) => {
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to reset password.';
        UtilityService.showError(msg);
      }
    );
  }

  promptDeleteTeam(team: any) {
    this.teamToDelete = team;
    this.showDeleteConfirm = true;
  }

  cancelDeleteTeam() {
    this.teamToDelete = null;
    this.showDeleteConfirm = false;
  }

  confirmDeleteTeam() {
    if (!this.teamToDelete) return;
    UtilityService.showLoader();
    this.portfolioService.deleteTeam(this.teamToDelete._id).subscribe(
      () => {
        UtilityService.hideLoader();
        this.teamsList = this.teamsList.filter(t => t._id !== this.teamToDelete._id);
        this.cancelDeleteTeam();
        UtilityService.showMessage('Team deleted successfully.', false, 2000);
      },
      (err: any) => {
        UtilityService.hideLoader();
        const msg = (err.error && err.error.message) ? err.error.message : 'Failed to delete team.';
        UtilityService.showError(msg);
      }
    );
  }

  copyAllCredentials() {
    if (!this.latestCredentials || this.latestCredentials.length === 0) return;
    const text = this.latestCredentials
      .map(c => `Team: ${c.name} | ID: ${c.teamId} | Password: ${c.rawPassword}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      UtilityService.showMessage('Credentials copied to clipboard.', false, 2000);
    }).catch(() => {
      UtilityService.showMessage('Unable to auto-copy. Please select and copy manually.', false, 2500);
    });
  }

  onLogout() {
    this.portfolioService.onLogout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }
}
