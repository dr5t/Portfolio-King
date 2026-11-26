import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import {LoginComponent} from "./login/login.component";
import {HomeComponent} from "./home/home.component";
import {AuthGuard} from "./services/guard/auth.guard";
import {InvestmentAvenueComponent} from "./investment-avenue/investment-avenue.component";
import {RulesComponent} from "./rules/rules.component";
import {GameComponent} from "./game/game.component";
import {GameStatusComponent} from "./game-status/game-status.component";


const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'game/:id',
    component: GameComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'game-status/:id',
    component: GameStatusComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'investment/:id',
    component: InvestmentAvenueComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'rules',
    component: RulesComponent
  },
  {
    path: '',
    component: HomeComponent,
    canActivate: [AuthGuard]
  },
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
