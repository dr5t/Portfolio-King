import {ChangeDetectorRef, Component, Input, OnDestroy, OnInit} from '@angular/core';
import $ from 'jquery';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {Router, ActivatedRoute} from "@angular/router";
import {UtilityService} from "../shared/utils/utility-service";

@Component({
  standalone: false,
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  @Input() teamManagementOnly: boolean = false;
  private destroyed = false;
  private socketHandler: (game: any) => void;
  private socketDeleteHandler: (event: any) => void;
  private notificationHandler: (notification: any) => void;

  public allGames: any[] = [];
  public filteredGames: any[] = [];
  public currGames: any[] = [];
  public prevGames: any[] = [];
  public _user: any;

  public gameSearchQuery: string = '';
  public gameStatusFilter: string = 'all';

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
  public createTeamPending: boolean = false;
  public allRegisteredTeamsCount: number = 0;
  public assignedTeamsCount: number = 0;
  public unassignedTeamsCount: number = 0;
  public allTeamsMap: Map<string, number> = new Map();
  public refreshPending: boolean = false;
  public duplicatePendingGameIds: string[] = [];

  toggleActionMenu(gameId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.activeActionMenuGameId = this.activeActionMenuGameId === gameId ? null : gameId;
  }

  navigateToTeams(game: any) {
    this.router.navigate(['/admin/teams'], { queryParams: { gameId: String(game._id) } });
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
          this.updateView();
        },
        (err: any) => {
          this.bulkDeletePending = false;
          this.showAdminRequestError(err, 'Failed to delete games.');
          this.updateView();
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
        this.refreshTeamCounts();
        if (res.partial) {
          UtilityService.showError(`${res.deletedCount} team(s) deleted; some could not be deleted.`);
        } else {
          UtilityService.showMessage(`${res.deletedCount} team(s) deleted.`, false, 2500);
        }
        this.updateView();
      },
      (err: any) => {
        this.bulkDeletePending = false;
        this.showAdminRequestError(err, 'Failed to delete teams.');
        this.updateView();
      }
    );
  }

  private partitionGames() {
    this.currGames = [];
    this.prevGames = [];
    this.allGames.forEach((game, index) => {
      game._index = index + 1;
      if (!game.name) game.name = `Game ${game._index}`;
      if (game.game_status === 'active' || game.game_status === 'paused' ||
          game.game_status === 'waiting' || game.game_status === 'ready') {
        this.currGames.push(game);
      } else {
        this.prevGames.push(game);
      }
    });
  }

  private removeGamesById(ids: string[]) {
    const removed = new Set(ids);
    this.allGames = this.allGames.filter(game => !removed.has(String(game._id)));
    this.selectedGameIds = this.selectedGameIds.filter(id => !removed.has(id));
    this.partitionGames();
    if (removed.has(String(this.selectedGameId))) {
      this.selectedGameId = this.allGames.length ? String(this.allGames[0]._id) : '';
      this.teamsList = [];
      this.selectedTeamIds = [];
      if (this.showManageTeams && this.selectedGameId) this.loadTeamsForSelectedGame();
    }
    if (this.teamManagementOnly && this.selectedGameId) {
      this.loadTeamsForSelectedGame();
    }
    this.applyGameFilters();
    if (this.activatedRoute.snapshot.queryParams['action'] === 'create' && !this.teamManagementOnly) {
      this.openCreateGameModal();
      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: { action: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  private showAdminRequestError(error: any, fallback: string) {
    if (error && error.status === 401) {
      const sessionType = this._user && this._user.isPlayer ? 'team' : 'admin';
      this.portfolioService.clearExpiredSession(`Your ${sessionType} session has expired. Please sign in again.`);
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

  public activeTab: string = 'overview';

  constructor(private portfolioService: PortfolioService,
              private router: Router,
              private activatedRoute: ActivatedRoute,
              private changeDetector: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.init();
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

  private updateView() {
    if (!this.destroyed) this.changeDetector.detectChanges();
  }

  init() {
    this._user = this.portfolioService.user;
    const currentPath = this.router.url.split('?')[0];
    if (this._user && this._user.isAdmin === 'true') {
      const socket = this.portfolioService.socket;
      if (socket && !this.socketHandler) {
        this.socketHandler = (game: any) => {
          if (!game || !game._id) return;
          const id = String(game._id);
          const idx = this.allGames.findIndex(g => String(g._id) === id);
          if (idx >= 0) {
            this.allGames[idx] = { ...this.allGames[idx], ...game };
          } else {
            game._index = this.allGames.length + 1;
            if (!game.name) game.name = `Game ${game._index}`;
            this.allGames.push(game);
          }
          this.partitionGames();
          this.applyGameFilters();
          this.updateView();
        };
        this.socketDeleteHandler = (event: any) => {
          const id = event && event.gameId ? String(event.gameId) : '';
          if (id) {
            this.removeGamesById([id]);
            this.updateView();
          }
        };
        this.notificationHandler = () => {
          this.onGetGames(false);
          if ((this.teamManagementOnly || this.showManageTeams) && this.selectedGameId) {
            this.loadTeamsForSelectedGame();
          } else {
            this.refreshTeamCounts();
          }
        };
        socket.on('game-updated', this.socketHandler);
        socket.on('game-deleted', this.socketDeleteHandler);
        socket.on('admin-notification', this.notificationHandler);
        socket.on('teams-updated', this.notificationHandler);
      }

      if (currentPath === '/' || currentPath === '') {
        const legacyTab = this.activatedRoute.snapshot.queryParams['tab'];
        const validTabs = ['overview', 'games', 'teams', 'sessions', 'history', 'results', 'settings'];
        const target = validTabs.indexOf(legacyTab) >= 0 ? legacyTab : 'overview';
        this.router.navigate(['/admin', target], { replaceUrl: true });
        return;
      }
      this.activatedRoute.queryParams.subscribe(params => {
        if (params.gameId) {
          this.selectedGameId = String(params.gameId);
        }
        if (params.filter) {
          const f = String(params.filter).toLowerCase();
          if (f === 'unassigned' || f === 'assigned' || f === 'all') {
            this.selectedGameId = f;
          }
        }
        if (params.status && !this.teamManagementOnly) {
          const s = String(params.status).toLowerCase();
          const validStatuses = ['all', 'waiting', 'in_progress', 'active', 'paused', 'completed', 'archived'];
          if (validStatuses.indexOf(s) >= 0) {
            this.gameStatusFilter = s === 'active' ? 'in_progress' : s;
            this.applyGameFilters();
          }
        }
      });
      this.showManageTeams = this.teamManagementOnly;
      this.onGetGames(true);
      return;
    }

    if (this._user && this._user.isPlayer && this._user.gameId) {
      UtilityService.showLoader();
      this.portfolioService.getGame(String(this._user.gameId)).subscribe(
        (game: any) => {
          this.allGames = game ? [game] : [];
          UtilityService.hideLoader();
          this.updateView();
        },
        (error: any) => {
          UtilityService.hideLoader();
          this.showAdminRequestError(error, 'Failed to load your assigned game.');
          this.updateView();
        }
      );
    }
  }

  onGetGames(showPageLoader: boolean = false) {
    if (showPageLoader) UtilityService.showLoader();
    else this.refreshPending = true;
    this.portfolioService.getAllGames().subscribe(
      (games: any) => {
        this.allGames = games || [];
        const validGameIds = this.allGames.map(game => String(game._id));
        this.selectedGameIds = this.selectedGameIds.filter(id => validGameIds.indexOf(id) >= 0);
        this.partitionGames();
        if (!this.allGames.some(game => String(game._id) === String(this.selectedGameId)) && this.selectedGameId !== 'unassigned' && this.selectedGameId !== 'all' && this.selectedGameId !== 'assigned') {
          this.selectedGameId = '';
        }
        if (this.currGames.length > 0 && !this.selectedGameId) {
          this.selectedGameId = this.currGames[this.currGames.length - 1]._id;
        } else if (this.allGames.length > 0 && !this.selectedGameId) {
          this.selectedGameId = this.allGames[0]._id;
        }
        this.refreshTeamCounts();
        if ((this.teamManagementOnly || this.showManageTeams) && this.selectedGameId) {
          this.loadTeamsForSelectedGame();
        }
        this.applyGameFilters();
        if (showPageLoader) UtilityService.hideLoader();
        this.refreshPending = false;
        this.updateView();
      },
      (err: any) => {
        if (showPageLoader) UtilityService.hideLoader();
        this.refreshPending = false;
        this.showAdminRequestError(err, 'Failed to load games.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.createGamePending = false;
        this.showAdminRequestError(err, 'Failed to create game.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to rename game.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.duplicatePendingGameIds = this.duplicatePendingGameIds.filter(id => id !== gameId);
        this.showAdminRequestError(err, 'Failed to duplicate game.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to update game status.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to archive game.');
        this.updateView();
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
          this.updateView();
          return;
        }
        this.removeGamesById([deletedId]);
        this.cancelDeleteGame();
        UtilityService.showMessage('Game deleted. Registered team accounts were preserved.', false, 2500);
        this.updateView();
      },
      (err: any) => {
        this.deleteGamePending = false;
        this.showAdminRequestError(err, 'Failed to delete game.');
        this.updateView();
      }
    );
  }

  onExportGameCsv(game: any) {
    this.portfolioService.downloadGameCsv(String(game._id)).subscribe(
      (file: Blob) => {
        const url = window.URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `portfolio-king-${String(game._id).slice(-4).toUpperCase()}.csv`;
        link.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 0);
      },
      error => this.showAdminRequestError(error, 'Failed to export game results.')
    );
  }


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
        this.refreshTeamCounts();
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to load teams.');
        this.updateView();
      }
    );
  }

  get isSelectedGameFull(): boolean {
    if (!this.selectedGameId || this.selectedGameId === 'unassigned' || this.selectedGameId === 'all' || this.selectedGameId === 'assigned') {
      return false;
    }
    const game = this.allGames.find(g => String(g._id) === String(this.selectedGameId));
    const playersCount = (game && game.players) ? game.players.length : 0;
    const teamsCount = this.teamsList ? this.teamsList.filter(t => String(t.gameId) === String(this.selectedGameId)).length : 0;
    return Math.max(playersCount, teamsCount) >= 4;
  }

  get selectedGameVacantSlots(): number {
    if (!this.selectedGameId || this.selectedGameId === 'all' || this.selectedGameId === 'unassigned' || this.selectedGameId === 'assigned') return 0;
    const count = this.getGameTeamsCount(this.selectedGameId);
    return Math.max(0, 4 - count);
  }

  get autoGenerateButtonLabel(): string {
    const vacant = this.selectedGameVacantSlots;
    if (vacant === 4 || vacant === 0) return 'Auto-Generate Teams';
    return `Auto-Generate Remaining (${vacant})`;
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

  getGameTeamsCount(gameId: string): number {
    return this.allTeamsMap ? (this.allTeamsMap.get(String(gameId)) || 0) : 0;
  }

  refreshTeamCounts() {
    this.portfolioService.getTeams('all').subscribe((all: any) => {
      const list = all || [];
      this.allRegisteredTeamsCount = list.length;
      this.assignedTeamsCount = list.filter((t: any) => t.isAssigned).length;
      this.unassignedTeamsCount = list.filter((t: any) => !t.isAssigned).length;
      this.allTeamsMap = new Map();
      list.forEach((t: any) => {
        if (t.gameId) {
          const gId = String(t.gameId);
          this.allTeamsMap.set(gId, (this.allTeamsMap.get(gId) || 0) + 1);
        }
      });
      this.updateView();
    });
  }

  onAutoGenerateTeams() {
    if (!this.selectedGameId && this.allGames && this.allGames.length > 0) {
      this.selectedGameId = this.allGames[this.allGames.length - 1]._id;
    }
    if (!this.selectedGameId || this.selectedGameId === 'unassigned' || this.selectedGameId === 'all' || this.selectedGameId === 'assigned') {
      UtilityService.showError('Select a specific trading session to generate teams.');
      return;
    }
    if (this.isSelectedGameFull) {
      UtilityService.showError('Game already has maximum 4 teams.');
      return;
    }
    UtilityService.showLoader();
    this.portfolioService.generateAllTeams(this.selectedGameId).subscribe(
      (res: any) => {
        UtilityService.hideLoader();
        this.latestCredentials = res.teams || [];
        this.loadTeamsForSelectedGame();
        UtilityService.showMessage(`Generated ${res.teams.length} teams successfully.`, false, 3000);
        this.updateView();
      },
      (err: any) => {
        UtilityService.hideLoader();
        this.showAdminRequestError(err, 'Failed to auto-generate teams.');
        this.updateView();
      }
    );
  }

  onCreateSingleTeam() {
    if (!this.selectedGameId || this.selectedGameId === 'unassigned' || this.selectedGameId === 'all' || this.selectedGameId === 'assigned') {
      UtilityService.showError('Select a specific trading session to create a team.');
      return;
    }
    if (this.isSelectedGameFull) {
      UtilityService.showError('Game already has maximum 4 teams.');
      return;
    }
    if (!this.newTeamName || !this.newTeamName.trim()) {
      UtilityService.showError('Missing required fields.');
      return;
    }
    this.createTeamPending = true;
    UtilityService.showLoader();
    this.portfolioService.createTeam({
      gameId: this.selectedGameId,
      name: this.newTeamName.trim(),
      teamId: this.newTeamId.trim() || undefined,
      password: this.newTeamPassword.trim() || undefined
    }).subscribe(
      (res: any) => {
        this.createTeamPending = false;
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
        this.updateView();
      },
      (err: any) => {
        this.createTeamPending = false;
        UtilityService.hideLoader();
        this.showAdminRequestError(err, 'Failed to create team.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to update team.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to update team status.');
        this.updateView();
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
        this.updateView();
      },
      (err: any) => {
        this.showAdminRequestError(err, 'Failed to reset password.');
        this.updateView();
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
          this.updateView();
          return;
        }
        this.teamsList = this.teamsList.filter(t => String(t._id) !== deletedId);
        this.selectedTeamIds = this.selectedTeamIds.filter(id => id !== deletedId);
        this.cancelDeleteTeam();
        this.refreshTeamCounts();
        UtilityService.showMessage('Team deleted successfully.', false, 2000);
        this.updateView();
      },
      (err: any) => {
        this.deleteTeamPending = false;
        this.showAdminRequestError(err, 'Failed to delete team.');
        this.updateView();
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
