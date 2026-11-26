import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment} from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(public http: HttpClient) { }
  url: any = environment.endpoint;

  get(endpoint: string, params?: any, reqOpts?: any) {
    if (!reqOpts) {
      reqOpts = {
        params: new HttpParams()
      };
    }

    if (params) {
      reqOpts.params = new HttpParams();
      for (let k in params) {
        reqOpts.params = reqOpts.params.append(k, params[k]);
      }
    }
    return this.http.get<any>(this.url + '/' + endpoint, reqOpts);
  }

  getBlob(endpoint: string, headers?: HttpHeaders) {
    return this.http.get(this.url + '/' + endpoint, {
      headers: headers || new HttpHeaders(),
      responseType: 'blob' as 'blob'
    });
  }

  post(endpoint: string, body: any, reqOpts?: any) {

    return this.http.post<any>(this.url + '/' + endpoint, body, reqOpts);
  }

  put(endpoint: string, body: any, reqOpts?: any) {
    return this.http.put<any>(this.url + '/' + endpoint, body, reqOpts);
  }

  delete(endpoint: string, reqOpts?: any) {
    return this.http.delete<any>(this.url + '/' + endpoint, reqOpts);
  }

  patch(endpoint: string, body: any, reqOpts?: any) {
    return this.http.patch<any>(this.url + '/' + endpoint, body, reqOpts);
  }
}
