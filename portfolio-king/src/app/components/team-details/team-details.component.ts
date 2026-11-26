import {Component, Input, OnInit, SimpleChanges} from '@angular/core';
import {PortfolioService} from "../../services/portfolio/portfolio.service";

@Component({
  selector: 'app-team-details',
  templateUrl: './team-details.component.html',
  styleUrls: ['./team-details.component.scss']
})
export class TeamDetailsComponent implements OnInit {

  public team: any;
  public round: any = {};

  constructor(private portfolioService: PortfolioService) {
  }

  @Input()
  teamId: number;
  @Input()
  teamIndex: number;
  @Input()
  leadStatus: any;
  @Input()
  viewStatus: any;
  @Input()
  currRound: any;
  @Input()
  currState: any;
  @Input()
  roundNumber: any;

  ngOnInit() {
    this.init(-1);
  }

  init(n) {
    this.team = this.portfolioService.getTeam(this.teamId)[0];
    let i;
    for (i = this.team.rounds.length - 1; i > -1; i--) {
      if (this.team.rounds[i].status === 'complete' && this.viewStatus === 'status' && n === -1) {
        this.round = this.team.rounds[i];
        break;
      } else if (this.viewStatus === 'game') {
        this.round = this.team.rounds[i];
        break;
      }
    }
    console.log(n);
    if (this.viewStatus === 'status' && n > 0 && n <= 12) {
      this.round = this.team.rounds[n - 1];
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.viewStatus === 'game') {
      console.log('view changed');
      if (changes.teamId && changes.teamId.currentValue) {
        this.teamId = changes.teamId.currentValue;
      }
      this.init(-1);
    } else if (this.viewStatus === 'status' && changes.roundNumber.currentValue && changes.roundNumber.currentValue >0 && changes.roundNumber.currentValue <= 12) {
      this.init(changes.roundNumber.currentValue);
    }
  }

}
