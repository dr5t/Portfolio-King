import {Component, OnInit} from '@angular/core';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {NgForm} from '@angular/forms';
import {Router} from "@angular/router";

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  public userType: string;

  constructor(private portfolioService: PortfolioService,
              private router: Router) {
  }

  ngOnInit() {

  }

  onSetRole(role) {
    this.userType = role;
  }

  onResetRole() {
    this.userType = '';
  }

  onSubmit(f) {
    let loginObj = this.portfolioService.onLogin(f.form.value, this.userType);
    loginObj.subscribe(async (res: any) => {
      console.log(res);
      if (res.isAdmin === "true" && this.userType === 'Admin') {
        this.portfolioService.user = res;
        await this.router.navigate(['/']);
      } else if (res.isPlayer === 'true' && this.userType === 'Player') {
        this.portfolioService.user = res;
        await this.router.navigate(['/']);
      } else {
        this.portfolioService.user = false;
      }
    })
  }

}
