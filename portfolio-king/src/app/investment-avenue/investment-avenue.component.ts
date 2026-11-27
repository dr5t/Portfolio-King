import {Component, OnInit, OnDestroy} from '@angular/core';
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
export class InvestmentAvenueComponent implements OnInit, OnDestroy {

  public totalPortfolioValue: number;
  private investmentArray: any = [];
  private gameId: any;
  private game: any;
  private user: any;
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
      this.totalTime = 180;
      this.totalMin = 3;
      if (this._timer) {
        clearInterval(this._timer);
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

  ngOnDestroy() {
    if (this._timer) {
      clearInterval(this._timer);
    }
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
