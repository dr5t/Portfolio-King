import {Component, OnInit} from '@angular/core';
import * as $ from 'jquery';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {Router} from "@angular/router";
import {UtilityService} from "../shared/utils/utility-service";

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public currGames: any = [];
  public prevGames: any = [];
  public _user: any;

  constructor(private portfolioService: PortfolioService,
              private router: Router) {
  }

  ngOnInit() {
    this.init();
  }

  init() {
    this._user = this.portfolioService.user;
    $('.loader').css('display', 'flex');
    this.onGetGames();
  }

  onGetGames() {
    this.portfolioService.getAllGames().subscribe((games: any) => {
      this.currGames = [];
      this.prevGames = [];
      games.forEach((game, i) => {
        game._index = i + 1;
        if (game.game_status === 'active' || game.game_status === 'paused') {
          this.currGames.push(game);
        } else {
          this.prevGames.push(game);
        }
      });
      console.log(this.currGames, this.prevGames);
      setTimeout(() => {
        $('.loader').css('display', 'none');
      }, 500);
    });
  }

  onCreateGame() {
    $('.loader').css('display', 'flex');
    this.portfolioService.createGame().subscribe((res: any) => {
      res.ops[0]._index = this.currGames.length + this.prevGames.length + 1;
      this.currGames.push(res.ops[0]);
      $('.loader').css('display', 'none');
    });
  }

  onGameSelect(game, game_id, status) {
    if (game.players.length > 4 && this._user.isPlayer) {
      UtilityService.showError('4 players already added');
      return;
    }
    switch (status) {
      case 'active':
        this.router.navigate([`game/${game_id}`]);
        break;
      case 'paused':
        this.router.navigate([`game-status/${game_id}`]);
        break;
      default:
        UtilityService.showError('Unknown Error');
    }
  }

  onLogout() {
    $('.loader').css('display', 'flex');
    this.portfolioService.onLogout().subscribe(() => {
      $('.loader').css('display', 'none');
      this.router.navigate(['/login']);
    });
  }

}
