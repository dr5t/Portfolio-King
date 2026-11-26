import {Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, CanActivateChild, Router, RouterStateSnapshot} from '@angular/router';
import {PortfolioService} from '../portfolio/portfolio.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivateChild {
  constructor(private portfolioService: PortfolioService, private router: Router) {
  }

  canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const user = this.portfolioService.user || this.portfolioService.getLoginObj();
    if (user && (user.isAdmin === true || user.isAdmin === 'true')) {
      return true;
    }

    this.router.navigate(user ? ['/'] : ['/login'], { replaceUrl: true });
    return false;
  }
}
