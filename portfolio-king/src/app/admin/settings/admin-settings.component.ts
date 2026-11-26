import {ChangeDetectorRef, Component} from '@angular/core';
import {Router} from '@angular/router';
import {PortfolioService} from '../../services/portfolio/portfolio.service';
import {UtilityService} from '../../shared/utils/utility-service';

@Component({
  standalone: false,
  selector: 'app-admin-settings',
  templateUrl: './admin-settings.component.html',
  styleUrls: ['../admin-page.scss']
})
export class AdminSettingsComponent {
  signingOut = false;

  constructor(public portfolioService: PortfolioService, private router: Router,
              private changeDetector: ChangeDetectorRef) {
  }

  get account(): any {
    return this.portfolioService.user || this.portfolioService.getLoginObj() || {};
  }

  signOut() {
    if (this.signingOut) return;
    this.signingOut = true;
    this.portfolioService.onLogout().subscribe(
      () => this.router.navigate(['/login']),
      error => {
        this.signingOut = false;
        this.changeDetector.detectChanges();
        if (error && error.status === 401) {
          this.portfolioService.clearExpiredSession('Your admin session has expired. Please sign in again.');
          return;
        }
        UtilityService.showError('Unable to log out. Please try again.');
      }
    );
  }
}
