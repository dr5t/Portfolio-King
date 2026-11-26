import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { TeamDetailsComponent } from './components/team-details/team-details.component';
import { TeamAreaComponent } from './components/team-area/team-area.component';
import { FormsModule }   from '@angular/forms';
import {HttpClientModule} from "@angular/common/http";
import { GameComponent } from './game/game.component';
import { InvestmentAvenueComponent } from './investment-avenue/investment-avenue.component';
import { RulesComponent } from './rules/rules.component';
import { GameStatusComponent } from './game-status/game-status.component';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {CarouselComponent, CarouselModule} from "ngx-owl-carousel-o";
import {InvestmentNamePipe} from "./pipes/investmentName/investment-name.pipe";
import {InrCurrencyPipe} from "./pipes/inrCurrency/inr-currency.pipe";
import {AdminOverviewComponent} from './admin/overview/admin-overview.component';
import {TeamsPageComponent} from './admin/teams/teams-page.component';
import {AdminSessionsComponent} from './admin/sessions/admin-sessions.component';
import {AdminHistoryComponent} from './admin/history/admin-history.component';
import {AdminResultsComponent} from './admin/results/admin-results.component';
import {AdminSettingsComponent} from './admin/settings/admin-settings.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    HomeComponent,
    TeamDetailsComponent,
    TeamAreaComponent,
    GameComponent,
    InvestmentAvenueComponent,
    RulesComponent,
    GameStatusComponent,
    InvestmentNamePipe,
    InrCurrencyPipe,
    AdminOverviewComponent,
    TeamsPageComponent,
    AdminSessionsComponent,
    AdminHistoryComponent,
    AdminResultsComponent,
    AdminSettingsComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CarouselModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
