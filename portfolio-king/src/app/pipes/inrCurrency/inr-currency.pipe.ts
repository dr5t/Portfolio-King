import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'inrCurrency'
})
export class InrCurrencyPipe implements PipeTransform {
  transform(val: any, decimals: number = 0): string {
    if (val === null || val === undefined || isNaN(Number(val))) {
      return '₹0';
    }
    const num = Number(val);
    const sign = num < 0 ? '-' : '';
    const absNum = Math.abs(num);
    const fixed = absNum.toFixed(decimals);
    const parts = fixed.split('.');
    let intPart = parts[0];
    const decPart = parts.length > 1 && decimals > 0 ? '.' + parts[1] : '';

    let lastThree = intPart.substring(intPart.length - 3);
    const otherNumbers = intPart.substring(0, intPart.length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return `${sign}₹${res}${decPart}`;
  }
}
