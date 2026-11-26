import {Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {Observable} from 'rxjs';
import {PortfolioService} from "../portfolio/portfolio.service";

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private portfolioService: PortfolioService,
              private router: Router) {
  }

  canActivate(route: ActivatedRouteSnapshot): boolean {
    switch (route.routeConfig.path) {
      case 'login':
        if (this.portfolioService.isAuthenticated()) {
          this.router.navigate(['']);
          return false;
        }
        break;
      default:
        if (!this.portfolioService.isAuthenticated()) {
          this.router.navigate(['login']);
          return false;
        }
    }
    return true;
  }
}
