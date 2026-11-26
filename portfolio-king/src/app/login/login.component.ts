import {Component, OnInit} from '@angular/core';
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {NgForm} from '@angular/forms';
import {Router} from "@angular/router";
import {UtilityService} from "../shared/utils/utility-service";

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  public userType: string = 'Player';
  public showPassword: boolean = false;
  public isLoading: boolean = false;
  public submitted: boolean = false;
  public errorMessage: string = '';

  constructor(private portfolioService: PortfolioService,
              private router: Router) {
  }

  ngOnInit() {

  }

  onSetRole(role: string) {
    this.userType = role;
    this.errorMessage = '';
    this.submitted = false;
  }

  onResetRole() {
    this.userType = '';
    this.errorMessage = '';
    this.submitted = false;
    this.showPassword = false;
  }

  toggleShowPassword() {
    this.showPassword = !this.showPassword;
  }

  onSubmit(f: NgForm) {
    this.submitted = true;
    this.errorMessage = '';

    if (this.isLoading) return;

    if (!f.valid) {
      this.errorMessage = 'Please enter all required fields.';
      UtilityService.showError('Missing required fields.');
      return;
    }
    const val = f.form.value;
    if (!val.username || !val.password) {
      this.errorMessage = 'Please enter all required fields.';
      UtilityService.showError('Missing required fields.');
      return;
    }

    this.isLoading = true;
    let loginObj = this.portfolioService.onLogin(val, this.userType);
    loginObj.subscribe(
      async (res: any) => {
        this.isLoading = false;
        if (res.isAdmin === "true" && this.userType === 'Admin') {
          this.portfolioService.user = res;
          this.portfolioService.setLoginObj(res);
          this.portfolioService.authenticateSocket();
          await this.router.navigate(['/']);
        } else if (res.isPlayer === 'true' && this.userType === 'Player') {
          this.portfolioService.user = res;
          this.portfolioService.setLoginObj(res);
          this.portfolioService.authenticateSocket();
          await this.router.navigate(['/']);
        } else {
          this.portfolioService.user = false;
          this.errorMessage = res.message || 'Authentication failed';
          UtilityService.showError(this.errorMessage);
        }
      },
      (err: any) => {
        this.isLoading = false;
        let msg = 'Server unavailable.';
        if (err.status === 401) {
          msg = this.userType === 'Admin' ? 'Invalid Admin ID or Password.' : 'Invalid Team ID or Password.';
        } else if (err.status === 403) {
          msg = 'Team account disabled.';
        } else if (err.status === 409) {
          msg = 'Team already connected.';
        } else if (err.status === 429) {
          msg = 'Too many login attempts. Please try again later.';
        } else if (err.status === 400) {
          msg = err.error && err.error.message ? err.error.message : 'Missing required fields.';
        } else if (err.error && err.error.message) {
          msg = err.error.message;
        }
        this.errorMessage = msg;
        UtilityService.showError(msg);
      }
    );
  }

}
