/*
FORMULA DEFINITIONS:
rate:   annual rate / ( no of yearly payments * 100)
nPeriod: total no of payments
pv: present value
fv: future value
type: 0(default) - payment due at the end of the month | 1 - paymeny due at the start of the month
Per – This is the period for which we want to find the interest and must be in the range from 1 to nper.
Nper – The total number of payment periods.
*/

const formulas = (function () {
    const PMT = function (rate, nPeriod, pv, fv, type) {
        if (!fv) fv = 0;
        if (!type) type = 0;

        if (rate === 0) {
            return -(pv + fv) / nPeriod;
        }
        let pvif = Math.pow(1 + rate, nPeriod);
        let pmt = rate / (pvif - 1) * -(pv * pvif + fv);

        if (type === 1) {
            pmt /= (1 + rate);
        }
        return pmt;
    };

    const IPMT = function (pv, pmt, rate, per) {
        if (per < 1) return null;
        let tmp = Math.pow(1 + rate, per - 1);
        return 0 - (pv * tmp * rate + pmt * (tmp - 1));
    };

    const PPMT = function (rate, per, nper, pv, fv, type) {
        if (per < 1 || (per >= nper + 1)) return null;
        let pmt = PMT(rate, nper, pv, fv, type);
        let ipmt = IPMT(pv, pmt, rate, per);
        return pmt - ipmt;
    }
    const test = function () {
        let rate = 5;
        let totalYears = 4;
        let installmentPerYear = 4;
        let amount = 100;
        let month = 2;
        // let pmt = formulas.PMT(rate/(installmentPerYear*100),totalYears*installmentPerYear,amount,0,0).toFixed(2);
        // let ipmt  = formulas.IPMT(amount,pmt,rate/(installmentPerYear*100),month).toFixed(2);
        // let ppmt = formulas.PPMT(rate/(installmentPerYear*100),month,totalYears*installmentPerYear,amount,0,0).toFixed(2);
        // console.log(pmt,ipmt,ppmt);
    }
    return {
        PMT: PMT,
        IPMT: IPMT,
        PPMT: PPMT,
        test: test
    }
})();

formulas.test();

module.exports.formulas = formulas;