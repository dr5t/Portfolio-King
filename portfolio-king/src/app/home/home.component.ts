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
  public selectedGameIds: string[] = [];
  public bulkActionsOpen: string = '';
  public showBulkDeleteModal: boolean = false;
  public bulkDeleteType: string = '';
  public bulkDeleteAll: boolean = false;
  public bulkConfirmText: string = '';
  public bulkDeletePending: boolean = false;
  public deleteGamePending: boolean = false;
  public createGamePending: boolean = false;
  public refreshPending: boolean = false;
  public duplicatePendingGameIds: string[] = [];

  toggleActionMenu(gameId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.activeActionMenuGameId = this.activeActionMenuGameId === gameId ? null : gameId;
  }

  closeActionMenu() {
    this.activeActionMenuGameId = null;
    this.bulkActionsOpen = '';
  }

  toggleBulkActions(type: string, event: Event) {
    event.stopPropagation();
    this.bulkActionsOpen = this.bulkActionsOpen === type ? '' : type;
  }

  toggleGameSelection(gameId: string, selected: boolean) {
    const id = String(gameId);
    this.selectedGameIds = selected
      ? Array.from(new Set(this.selectedGameIds.concat(id)))
      : this.selectedGameIds.filter(item => item !== id);
  }

  isGameSelected(gameId: string): boolean {
    return this.selectedGameIds.indexOf(String(gameId)) >= 0;
  }

  toggleAllGamesSelection(selected: boolean) {
    const visibleIds = this.filteredGames.map(game => String(game._id));
    this.selectedGameIds = selected
      ? Array.from(new Set(this.selectedGameIds.concat(visibleIds)))
      : this.selectedGameIds.filter(id => visibleIds.indexOf(id) < 0);
  }

  toggleTeamSelection(teamId: string, selected: boolean) {
    const id = String(teamId);
    this.selectedTeamIds = selected
      ? Array.from(new Set(this.selectedTeamIds.concat(id)))
      : this.selectedTeamIds.filter(item => item !== id);
  }

  isTeamSelected(teamId: string): boolean {
    return this.selectedTeamIds.indexOf(String(teamId)) >= 0;
  }

  toggleAllTeamsSelection(selected: boolean) {
    this.selectedTeamIds = selected
      ? this.teamsList.map(team => String(team._id))
      : [];
  }

  openBulkDelete(type: string, deleteAll: boolean) {
    const count = type === 'games'
      ? (deleteAll ? this.allGames.length : this.selectedGameIds.length)
      : (deleteAll ? this.teamsList.length : this.selectedTeamIds.length);
    if (count === 0) {
      UtilityService.showError(`There are no ${type} to delete.`);
      return;
    }
    this.bulkDeleteType = type;
    this.bulkDeleteAll = deleteAll;
    this.bulkConfirmText = '';
    this.bulkActionsOpen = '';
    this.showBulkDeleteModal = true;
  }

  cancelBulkDelete() {
    if (this.bulkDeletePending) return;
    this.showBulkDeleteModal = false;
    this.bulkDeleteType = '';
    this.bulkDeleteAll = false;
    this.bulkConfirmText = '';
  }

  confirmBulkDelete() {
    if (this.bulkDeletePending) return;
    const expected = this.bulkDeleteType === 'games' ? 'DELETE ALL GAMES' : 'DELETE ALL TEAMS';
    if (this.bulkDeleteAll && this.bulkConfirmText !== expected) {
      UtilityService.showError(`Type ${expected} exactly to confirm.`);
      return;
    }

    this.bulkDeletePending = true;
    if (this.bulkDeleteType === 'games') {
      const ids = this.selectedGameIds.slice();
      this.portfolioService.bulkDeleteGames(ids, this.bulkDeleteAll, this.bulkConfirmText).subscribe(
        (res: any) => {
          this.bulkDeletePending = false;
          const deletedIds = (res.results || [])
            .filter(result => result.success)
            .map(result => String(result.gameId));
          this.removeGamesById(deletedIds);
          this.showBulkDeleteModal = false;
          if (res.failedCount > 0) {
            UtilityService.showError(`${res.deletedCount} game(s) deleted; ${res.failedCount} could not be deleted.`);
          } else {
            UtilityService.showMessage(`${res.deletedCount} game(s) deleted. Team accounts were preserved.`, false, 2500);
          }
        },
        (err: any) => {
          this.bulkDeletePending = false;
          this.showAdminRequestError(err, 'Failed to delete games.');
        }
      );
      return;
    }

    const teamIds = this.bulkDeleteAll ? [] : this.selectedTeamIds.slice();
    this.portfolioService.bulkDeleteTeams(
      this.selectedGameId,
      teamIds,
      this.bulkDeleteAll,
      this.bulkConfirmText
    ).subscribe(
      (res: any) => {
        this.bulkDeletePending = false;
        const deletedIds = res.deletedTeamIds || [];
        this.teamsList = this.teamsList.filter(team => deletedIds.indexOf(String(team._id)) < 0);
        this.selectedTeamIds = this.selectedTeamIds.filter(id => deletedIds.indexOf(id) < 0);
        this.showBulkDeleteModal = false;
        if (res.partial) {
          UtilityService.showError(`${res.deletedCount} team(s) deleted; some could not be deleted.`);
        } else {
          UtilityService.showMessage(`${res.deletedCount} team(s) deleted.`, false, 2500);
        }
      },
      (err: any) => {
        this.bulkDeletePending = false;
        this.showAdminRequestError(err, 'Failed to delete teams.');
      }
    );
  }

  private removeGamesById(ids: string[]) {
    const removed = new Set(ids);
    this.allGames = this.allGames.filter(game => !removed.has(String(game._id)));
    this.selectedGameIds = this.selectedGameIds.filter(id => !removed.has(id));
    this.currGames = [];
    this.prevGames = [];
    this.allGames.forEach((game, index) => {
      game._index = index + 1;
      if (game.game_status === 'active' || game.game_status === 'paused' ||
          game.game_status === 'waiting' || game.game_status === 'ready') {
        this.currGames.push(game);
      } else {
        this.prevGames.push(game);
      }
    });
    if (removed.has(String(this.selectedGameId))) {
      this.selectedGameId = this.allGames.length ? String(this.allGames[0]._id) : '';
      this.teamsList = [];
      this.selectedTeamIds = [];
      if (this.showManageTeams && this.selectedGameId) this.loadTeamsForSelectedGame();
    }
    this.applyGameFilters();
  }

  private showAdminRequestError(error: any, fallback: string) {
    if (error && error.status === 401) {
      this.portfolioService.clearExpiredSession('Your admin session has expired. Please sign in again.');
      return;
    }
    const message = error && error.error && error.error.message
      ? error.error.message
      : fallback;
    UtilityService.showError(message);
  }

  get allFilteredGamesSelected(): boolean {
    return this.filteredGames.length > 0 &&
      this.filteredGames.every(game => this.selectedGameIds.indexOf(String(game._id)) >= 0);
  }

  get selectedGamesCount(): number {
    return this.selectedGameIds.length;
  }

  get allTeamsSelected(): boolean {
    return this.teamsList.length > 0 &&
      this.teamsList.every(team => this.selectedTeamIds.indexOf(String(team._id)) >= 0);
  }

  get selectedTeamsCount(): number {
    return this.selectedTeamIds.length;
  }

  isDuplicatePending(gameId: string): boolean {
    return this.duplicatePendingGameIds.indexOf(String(gameId)) >= 0;
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
  public selectedTeamIds: string[] = [];
  public deleteTeamPending: boolean = false;

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
    this.onGetGames(true);
  }

  onGetGames(showPageLoader: boolean = false) {
    if (showPageLoader) UtilityService.showLoader();
    else this.refreshPending = true;
    this.portfolioService.getAllGames().subscribe(
      (games: any) => {
        this.allGames = games || [];
        const validGameIds = this.allGames.map(game => String(game._id));
        this.selectedGameIds = this.selectedGameIds.filter(id => validGameIds.indexOf(id) >= 0);
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
        if (showPageLoader) UtilityService.hideLoader();
        this.refreshPending = false;
      },
      (err: any) => {
        if (showPageLoader) UtilityService.hideLoader();
        this.refreshPending = false;
        this.showAdminRequestError(err, 'Failed to load games.');
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
    if (this.createGamePending) return;
    this.showCreateGameModal = false;
    this.newGameName = '';
  }

  onCreateGame() {
    if (this.createGamePending) return;
    this.createGamePending = true;
    const name = this.newGameName.trim() || undefined;
    this.portfolioService.createGame(name).subscribe(
      (res: any) => {
        this.createGamePending = false;
        const newGame = res.ops[0];
        newGame._index = this.allGames.length + 1;
        if (!newGame.name) newGame.name = `Game ${newGame._index}`;
        this.allGames.push(newGame);
        this.currGames.push(newGame);
        this.selectedGameId = newGame._id;
        this.showCreateGameModal = false;
        this.newGameName = '';
        this.applyGameFilters();
        UtilityService.showMessage(`Created ${newGame.name} successfully.`, false, 2500);
      },
      (err: any) => {
        this.createGamePending = false;
        this.showAdminRequestError(err, 'Failed to create game.');
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
      (res: any) => {
        if (!res || !res.success) {
          UtilityService.showError('The game was not renamed.');
          return;
        }
        game.name = trimmed;
        this.editingGameId = null;
        UtilityService.showMessage('Game renamed successfully.', false, 2000);
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to rename game.');
      }
    );
  }

  cancelRenameGame() {
    this.editingGameId = null;
    this.editingGameName = '';
  }

  onDuplicateGame(game: any) {
    const gameId = String(game._id);
    if (this.isDuplicatePending(gameId)) return;
    this.duplicatePendingGameIds.push(gameId);
    this.portfolioService.duplicateGame(game._id).subscribe(
      (res: any) => {
        this.duplicatePendingGameIds = this.duplicatePendingGameIds.filter(id => id !== gameId);
        if (res.game) {
          res.game._index = this.allGames.length + 1;
          this.allGames.push(res.game);
          this.currGames.push(res.game);
          this.selectedGameId = res.game._id;
          this.applyGameFilters();
          UtilityService.showMessage(`Duplicated as "${res.game.name}".`, false, 2500);
        } else {
          UtilityService.showError('The game was not duplicated.');
        }
      },
      (err: any) => {
        this.duplicatePendingGameIds = this.duplicatePendingGameIds.filter(id => id !== gameId);
        this.showAdminRequestError(err, 'Failed to duplicate game.');
      }
    );
  }

  onToggleGamePause(game: any) {
    const newStatus = game.game_status === 'active' || game.game_status === 'in_progress' ? 'paused' : 'active';
    this.portfolioService.updateGameLifecycleStatus(game._id, newStatus).subscribe(
      () => {
        game.game_status = newStatus;
        this.applyGameFilters();
        UtilityService.showMessage(`Game is now ${newStatus}.`, false, 2000);
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to update game status.');
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
        this.showAdminRequestError(err, 'Failed to archive game.');
      }
    );
  }

  promptDeleteGame(game: any) {
    this.gameToDelete = game;
    this.deleteConfirmGameName = '';
    this.showDeleteGameModal = true;
  }

  cancelDeleteGame() {
    if (this.deleteGamePending) return;
    this.gameToDelete = null;
    this.deleteConfirmGameName = '';
    this.showDeleteGameModal = false;
  }

  confirmDeleteGame() {
    if (!this.gameToDelete || this.deleteGamePending) return;
    const expected = (this.gameToDelete.name || '').trim();
    if (this.deleteConfirmGameName.trim().toLowerCase() !== expected.toLowerCase()) {
      UtilityService.showError(`Confirmation name does not match "${expected}".`);
      return;
    }
    const deletedId = String(this.gameToDelete._id);
    this.deleteGamePending = true;
    this.portfolioService.deleteGame(deletedId, this.deleteConfirmGameName.trim()).subscribe(
      (res: any) => {
        this.deleteGamePending = false;
        if (!res || !res.success || String(res.gameId) !== deletedId) {
          UtilityService.showError(res && res.message ? res.message : 'The game was not deleted.');
          return;
        }
        this.removeGamesById([deletedId]);
        this.cancelDeleteGame();
        UtilityService.showMessage('Game deleted. Registered team accounts were preserved.', false, 2500);
      },
      (err: any) => {
        this.deleteGamePending = false;
        this.showAdminRequestError(err, 'Failed to delete game.');
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
    this.selectedTeamIds = [];
    this.loadTeamsForSelectedGame();
  }

  loadTeamsForSelectedGame() {
    if (!this.selectedGameId) return;
    this.portfolioService.getTeams(this.selectedGameId).subscribe(
      (teams: any) => {
        this.teamsList = teams || [];
        const validTeamIds = this.teamsList.map(team => String(team._id));
        this.selectedTeamIds = this.selectedTeamIds.filter(id => validTeamIds.indexOf(id) >= 0);
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to load teams.');
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
        this.showAdminRequestError(err, 'Failed to auto-generate teams.');
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
        this.showAdminRequestError(err, 'Failed to create team.');
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
        this.showAdminRequestError(err, 'Failed to update team.');
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
        this.showAdminRequestError(err, 'Failed to update team status.');
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
        this.showAdminRequestError(err, 'Failed to reset password.');
      }
    );
  }

  promptDeleteTeam(team: any) {
    this.teamToDelete = team;
    this.showDeleteConfirm = true;
  }

  cancelDeleteTeam() {
    if (this.deleteTeamPending) return;
    this.teamToDelete = null;
    this.showDeleteConfirm = false;
  }

  confirmDeleteTeam() {
    if (!this.teamToDelete || this.deleteTeamPending) return;
    const deletedId = String(this.teamToDelete._id);
    this.deleteTeamPending = true;
    this.portfolioService.deleteTeam(deletedId).subscribe(
      (res: any) => {
        this.deleteTeamPending = false;
        if (!res || !res.success) {
          UtilityService.showError(res && res.message ? res.message : 'The team was not deleted.');
          return;
        }
        this.teamsList = this.teamsList.filter(t => String(t._id) !== deletedId);
        this.selectedTeamIds = this.selectedTeamIds.filter(id => id !== deletedId);
        this.cancelDeleteTeam();
        UtilityService.showMessage('Team deleted successfully.', false, 2000);
      },
      (err: any) => {
        this.deleteTeamPending = false;
        this.showAdminRequestError(err, 'Failed to delete team.');
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
