import {Component, OnInit} from '@angular/core';
import {PortfolioService} from "./services/portfolio/portfolio.service";
import {UtilityService} from "./shared/utils/utility-service"
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent{

  constructor(private portfolioService: PortfolioService){
    this.init();
  }

  init(){
    this.portfolioService.initSocket();
  }

  onCloseError(){
    UtilityService.onCloseError();
  }

  onCloseMessage(){
    UtilityService.onCloseMessage();
  }
}
