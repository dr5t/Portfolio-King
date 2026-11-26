import {Component} from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-teams-page',
  template: '<app-home [teamManagementOnly]="true"></app-home>'
})
export class TeamsPageComponent {
}
