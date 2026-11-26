import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import {LoginComponent} from "./login/login.component";
import {HomeComponent} from "./home/home.component";
import {AuthGuard} from "./services/guard/auth.guard";
import {InvestmentAvenueComponent} from "./investment-avenue/investment-avenue.component";
import {RulesComponent} from "./rules/rules.component";
import {GameComponent} from "./game/game.component";
import {GameStatusComponent} from "./game-status/game-status.component";
import {AdminGuard} from "./services/guard/admin.guard";
import {AdminOverviewComponent} from "./admin/overview/admin-overview.component";
import {TeamsPageComponent} from "./admin/teams/teams-page.component";
import {AdminSessionsComponent} from "./admin/sessions/admin-sessions.component";
import {AdminHistoryComponent} from "./admin/history/admin-history.component";
import {AdminResultsComponent} from "./admin/results/admin-results.component";
import {AdminSettingsComponent} from "./admin/settings/admin-settings.component";


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
    path: 'admin',
    canActivate: [AuthGuard],
    canActivateChild: [AdminGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: AdminOverviewComponent },
      { path: 'games', component: HomeComponent },
      { path: 'teams', component: TeamsPageComponent },
      { path: 'sessions', component: AdminSessionsComponent },
      { path: 'history', component: AdminHistoryComponent },
      { path: 'results', component: AdminResultsComponent },
      { path: 'settings', component: AdminSettingsComponent }
    ]
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
