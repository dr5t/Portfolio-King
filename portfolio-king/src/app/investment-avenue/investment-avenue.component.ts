import {Component, OnInit} from '@angular/core';
import {NgForm} from "@angular/forms";
import {UtilityService} from "../shared/utils/utility-service";
import {PortfolioService} from "../services/portfolio/portfolio.service";
import {ActivatedRoute, Router} from "@angular/router";
import {init} from "protractor/built/launcher";
import {OwlOptions} from "ngx-owl-carousel-o";
import * as $ from 'jquery';

@Component({
  selector: 'app-investment-avenue',
  templateUrl: './investment-avenue.component.html',
  styleUrls: ['./investment-avenue.component.scss']
})
export class InvestmentAvenueComponent implements OnInit {

  public totalPortfolioValue: number;
  public currentAllocated: number = 0;
  public currentQuarter: number = 1;
  public currentYear: number = 1;
  private investmentArray: any = [];
  private gameId: any;
  public game: any;
  public user: any;
  public fof_players: any;
  private fof_status: any;
  public enableLoan: any = false;
  public loanAmt: number = 0;
  public loanDuration: number = 0;
  public loanTaken: boolean = false;
  public r1: any = 0;
  public r2: any = 0;
  public prevLoans: any;
  public loanStatus: boolean = false;
  public players: any;
  public customOptions: OwlOptions;
  public _timer: any;
  public totalTime: any = 180;
  public totalMin: any = 3;
  public diceEnabled: any = true;

  public instruments = [
    { key: 'bank_FD', name: 'Bank Fixed Deposit', category: 'Fixed Income', risk: 'Low', riskClass: 'risk-low', expectedReturn: '6.20% Fixed', desc: 'Guaranteed sovereign-backed term deposit' },
    { key: 'govt_bond', name: 'Government Bonds', category: 'Sovereign Debt', risk: 'Low-Medium', riskClass: 'risk-low-med', expectedReturn: '4.00% – 9.00%', desc: 'Long-term benchmark sovereign securities' },
    { key: 'corporate_bond', name: 'Corporate Bonds', category: 'Credit Debt', risk: 'Medium', riskClass: 'risk-med', expectedReturn: '5.00% – 12.00%', desc: 'Investment-grade corporate debentures' },
    { key: 'blue_chip', name: 'Blue Chip Equities', category: 'Large-Cap', risk: 'Moderate-High', riskClass: 'risk-mod-high', expectedReturn: '-10% – +25%', desc: 'Established market leaders with strong dividends' },
    { key: 'mid_cap', name: 'Mid Cap Equities', category: 'Growth Equities', risk: 'High', riskClass: 'risk-high', expectedReturn: '-20% – +35%', desc: 'High-growth sector challengers with volatility' },
    { key: 'speculative_stock', name: 'Speculative Equities', category: 'High Beta', risk: 'Very High', riskClass: 'risk-very-high', expectedReturn: '-40% – +60%', desc: 'High-beta aggressive equities with binary payoff' },
    { key: 'international_stock', name: 'Global Equities', category: 'Foreign Markets', risk: 'High', riskClass: 'risk-high', expectedReturn: '-15% – +30%', desc: 'Developed & emerging international index equities' },
    { key: 'US_dollar', name: 'US Dollar Reserves', category: 'Foreign Exchange', risk: 'Medium', riskClass: 'risk-med', expectedReturn: '-8% – +15%', desc: 'Hard currency hedging asset against market shocks' },
    { key: 'gold_ETF', name: 'Gold ETF', category: 'Commodities Hedge', risk: 'Moderate', riskClass: 'risk-mod', expectedReturn: '-5% – +20%', desc: 'Safe-haven hedge and inflation store of value' }
  ];

  public showResetModal: boolean = false;
  public activeSubTab: 'investments' | 'fof' | 'loans' = 'investments';

  get returnPercentage(): number {
    const base = 1000000;
    const current = this.totalPortfolioValue || base;
    return ((current - base) / base) * 100;
  }

  get formattedTimeLeft(): string {
    const m = Math.floor((this.totalTime || 0) / 60);
    const s = (this.totalTime || 0) % 60;
    return `${m < 10 ? '0' : ''}${m} : ${s < 10 ? '0' : ''}${s}`;
  }

  getGameShortId(): string {
    if (!this.gameId) return 'PKG-0000';
    return `PKG-${String(this.gameId).slice(-4).toUpperCase()}`;
  }

  get lastDiceRoll(): number {
    if (this.game && this.game.lastDiceRoll) return this.game.lastDiceRoll;
    if (this.game && this.game.diceValue) return this.game.diceValue;
    return 5;
  }

  get marketImpactRate(): string {
    const rate = this.returnPercentage;
    const sign = rate >= 0 ? '+' : '';
    return `${sign}${rate.toFixed(1)}%`;
  }

  get marketImpactDescription(): string {
    return this.returnPercentage >= 0 ? 'Favorable market this quarter' : 'Challenging market conditions';
  }

  get isMarketPositive(): boolean {
    return this.returnPercentage >= 0;
  }

  get netProfitLoss(): number {
    return (this.totalPortfolioValue || 1000000) - 1000000;
  }

  get outstandingLoansTotal(): number {
    let sum = 0;
    if (this.prevLoans && Array.isArray(this.prevLoans)) {
      this.prevLoans.forEach(l => {
        if (l.status === 'active') {
          sum += (l.balance !== undefined ? l.balance : (l.amount || 0));
        }
      });
    }
    return sum;
  }

  get remainingBalance(): number {
    return (this.totalPortfolioValue || 0) - (this.currentAllocated || 0);
  }

  promptResetAllocations() {
    this.showResetModal = true;
  }

  cancelResetAllocations() {
    this.showResetModal = false;
  }

  confirmResetAllocations(form: NgForm) {
    if (form && form.resetForm) {
      form.resetForm();
    }
    this.currentAllocated = 0;
    this.showResetModal = false;
    UtilityService.showMessage('Allocations reset to 0.', false, 1500);
  }

  calculateLiveTotal(form: NgForm) {
    if (!form || !form.value) {
      this.currentAllocated = 0;
      return;
    }
    const v = form.value;
    let sum = 0;
    const keys = ['bank_FD', 'govt_bond', 'corporate_bond', 'blue_chip', 'mid_cap', 'speculative_stock', 'international_stock', 'US_dollar', 'gold_ETF', 'fof_value'];
    for (let i = 0; i < keys.length; i++) {
      const val = Number(v[keys[i]]);
      if (!isNaN(val) && val > 0) {
        sum += val;
      }
    }
    this.currentAllocated = sum;
  }

  constructor(private portfolioService: PortfolioService,
              private router: Router,
              private activatedRoute: ActivatedRoute) {
    this.init();
  }

  init() {
    const nav = this.router.getCurrentNavigation();
    const state = (nav && nav.extras && nav.extras.state) || (history && history.state) || {};
    this.totalPortfolioValue = state.ptValue !== undefined ? state.ptValue : 1000000;
    this.prevLoans = state.loans || [];
    this.players = state.players || [];
    console.log(this.players);
  }

  ngOnInit() {
    this.customOptions = {
      loop: true,
      dots: true,
      navSpeed: 2000,
      navText: ['', ''],
      items: 1
    };
    this.activatedRoute.params.subscribe(({id}) => {
      this.gameId = id;
      this.game = this.portfolioService._getAllGames();
      this.user = this.portfolioService.user;
      if (this.game && this.game.players && this.game.players[0] && this.game.players[0].rounds) {
        const completed = this.game.players[0].rounds.filter(r => r && r.status === 'complete').length;
        this.currentQuarter = (completed % 4) + 1;
        this.currentYear = Math.floor(completed / 4) + 1;
      }
      let temp = true;
      let i;
      this.fof_status = false;
      let x;
      for (i = this.game.players[0].rounds.length - 1; i > 0; i--) {
        if (this.game.players[0].rounds[i].status === 'complete') {
          this.loanStatus = true;
          // if (i > 1) {
          //   this.fof_status = true;
          // }
        }
      }
      if (this.fof_status) {
        this.fof_players = [];
        this.game.players.forEach((player) => {
          if (player._id !== this.user.id) {
            this.fof_players.push({
              id: player._id,
              name: player.name,
            })
          }
        });
      }
      this._timer = setInterval(() => {
        if (this.totalTime <= 0) {
          let loan;
          if (this.loanTaken) {
            loan = {
              amount: 100000,
              duration: this.loanDuration,
              totalRepayments: 0,
              status: 'active',
              rate: 17 - this.r1 - this.r2
            }
          }

          this.investmentArray = [
            {
              name: "bank_FD",
              value: this.totalPortfolioValue,
              return_rate: 6.2,
              return_value: this.totalPortfolioValue * 1.062
            },
            {
              name: "govt_bond",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "corporate_bond",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "blue_chip",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "mid_cap",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "speculative_stock",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "international_stock",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "US_dollar",
              value: 0,
              return_rate: 0,
              return_value: 0
            },
            {
              name: "gold_ETF",
              value: 0,
              return_rate: 0,
              return_value: 0
            }
          ];

          this.portfolioService.onPlayerReady(this.investmentArray, this.totalPortfolioValue, loan, this.prevLoans);
          clearInterval(this._timer);
          this.router.navigate([`game/${this.gameId}`]);

        } else {
          this.totalTime -= 1;
          this.totalMin = Math.floor(this.totalTime / 60);
        }
      }, 1000);
    });
  }

  onSubmitForm(e, f) {
    e.preventDefault();
    let investments = f.form.value;
    let totalInvestment = 0;
    this.investmentArray = [];
    let numCheck = true;
    let loan;
    for (let investment in investments) {
      if (investments.hasOwnProperty(investment)) {
        console.log(investment + " -> " + investments[investment]);
        if (Number(investments[investment]) < 0) {
          numCheck = false;
        }
        if (investment === 'fof_player' || investment === 'fof_value' || investment === 'loan_amt' || investment === 'loan_duration') {
        } else {
          totalInvestment += Number(investments[investment]);
          this.investmentArray.push({
            name: investment,
            value: investments[investment] ? investments[investment] : 0,
            return_rate: investment === 'bank_FD' ? 6.2 : 0,
            return_value: investment === 'bank_FD' ? parseFloat(((investments[investment] ? investments[investment] : 0) * 1.062).toFixed(2)) : 0
          });
        }
      }
    }

    if (investments['fof_player'] && investments['fof_value']) {
      totalInvestment += Number(investments['fof_value']);
      this.investmentArray.push({
        name: 'fof',
        value: investments['fof_value'],
        return_rate: 0,
        return_value: 0,
        target_player: investments['fof_player']
      });
    }

    // if (investments['loan_amt'] && investments['loan_duration']) {
    if (this.loanTaken && investments['loan_duration']) {
      loan = {
        // amount: this.loanAmt,
        amount: 100000,
        duration: this.loanDuration,
        totalRepayments: 0,
        status: 'active',
        rate: 17 - this.r1 - this.r2
      }
    }
    console.log(this.totalPortfolioValue, totalInvestment);
    if (totalInvestment !== this.totalPortfolioValue || !numCheck) {
      if (totalInvestment < this.totalPortfolioValue) {
        UtilityService.showError("Invested value is less than total portfolio value");
        this.investmentArray = [];
      } else {
        UtilityService.showError("Invested value exceeds total portfolio value");
        this.investmentArray = [];
      }
    } else {
      this.portfolioService.onPlayerReady(this.investmentArray, totalInvestment, loan, this.prevLoans);
      clearInterval(this._timer);
      this.router.navigate([`game/${this.gameId}`]);
    }
  }

  onEnableLoan() {
    this.enableLoan = !this.enableLoan;
  }

  onTakeLoan() {
    // if (this.loanAmt < 50000 || this.loanAmt > 100000) {
    //   UtilityService.showError("Take loan amount in the range of 0 - 100000");
    //   return;
    // }
    if (this.loanDuration < 2 || this.loanDuration > 7) {
      UtilityService.showError("Loan duration must be in the range of 2 - 7");
      return;
    }
    this.totalPortfolioValue += 100000;
    this.loanTaken = true;
  }

  onDiceRoll(e?: any) {
    this.r1 = Math.floor(Math.random() * 6 + 1);
    this.r2 = Math.floor(Math.random() * 6 + 1);
    let dice1 = $('#dice1');
    let dice2 = $('#dice2');
    this.diceEnabled = false;
    this.addAnimationToDice(dice1, this.r1);
    this.addAnimationToDice(dice2, this.r2);
  }

  onPayLoan(e, i) {
    if (this.prevLoans[i].balance * 0.01 > this.totalPortfolioValue) {
      UtilityService.showError("Not enough portfolio value");
      return;
    }
    e.target.disabled = true;
    this.totalPortfolioValue -= this.prevLoans[i].balance * 0.01;
    this.totalPortfolioValue -= this.prevLoans[i].balance;
    this.totalPortfolioValue = Math.ceil(this.totalPortfolioValue);
    this.prevLoans[i].balance = 0;
    this.prevLoans[i].repayment = true;
    this.prevLoans[i].status = "paid";
  }

  addAnimationToDice(dice, num) {
    dice.attr("class", "dice");
    dice.animate({left: '+2px'}, 200, function () {
      dice.addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '+2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_t");
    }).delay(130).animate({top: '-2px'}, 200, function () {
      dice.removeClass("dice_t").addClass("dice_s");
    }).delay(130).animate({opacity: 'show'}, 700, function () {
      dice.removeClass("dice_s").addClass("dice_e");
    }).delay(130).animate({left: '-2px', top: '2px'}, 200, function () {
      dice.removeClass("dice_e").addClass("dice_" + num);
    });
  }

}
