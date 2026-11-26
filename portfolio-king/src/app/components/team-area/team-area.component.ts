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
    console.log('hi');
    this.team = this.portfolioService.getTeam(this.teamId)[0];
    console.log(this.team);
    if(!this.team){
      console.log('no team');
      let timer = setTimeout(()=>{
        console.log('timer');
        this.team = this.portfolioService.getTeam(this.teamId);
        if(this.team){
          console.log(this.team);
          clearInterval(timer);
        }
      },2000);
    }

  }

}
