import {Injectable} from '@angular/core';
import { environment} from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class EndPoints {
    constructor() {
    }

    public login = 'login';
    public createGame = 'create-game';
    public getAllGames = 'get-all-games';
    public getGame = 'get-game';
    public logout = 'logout';

}
