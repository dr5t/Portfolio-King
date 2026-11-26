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