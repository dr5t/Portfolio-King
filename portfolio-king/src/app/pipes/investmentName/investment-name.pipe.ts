import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'investmentName'
})
export class InvestmentNamePipe implements PipeTransform {

  transform(value: string, ...args: any[]): any {
    return value.replace('_', ' ').toUpperCase();
  }

}
