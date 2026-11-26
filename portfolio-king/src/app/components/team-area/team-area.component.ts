import {Component, Input, OnInit} from '@angular/core';
import {PortfolioService} from "../../services/portfolio/portfolio.service";

@Component({
  selector: 'app-team-area',
  templateUrl: './team-area.component.html',
  styleUrls: ['./team-area.component.scss']
})
export class TeamAreaComponent implements OnInit {

  team: any;

  constructor(private portfolioService: PortfolioService) {
  }

  @Input()
  teamId: number;

  ngOnInit() {
    this.team = this.portfolioService.getTeam(this.teamId)[0];
    if(!this.team){
      let timer = setTimeout(()=>{
        this.team = this.portfolioService.getTeam(this.teamId);
        if(this.team){
          clearInterval(timer);
        }
      },2000);
    }
  }

}
