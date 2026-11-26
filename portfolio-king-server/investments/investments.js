const returnSheet = {
    govt_bond: [
        {
            dice_total: [2, 4, 6],
            return_rate: 5
        },
        {
            dice_total: [3, 5, 7, 9],
            return_rate: 6
        },
        {
            dice_total: [8, 10, 12],
            return_rate: 7
        },
        {
            dice_total: [11],
            return_rate: 8
        }
    ],
    corporate_bond: [
        {
            dice_total: [9, 11],
            return_rate: 8
        },
        {
            dice_total: [12, 10],
            return_rate: 7.5
        },
        {
            dice_total: [8, 7],
            return_rate: 6.5
        },
        {
            dice_total: [3, 5],
            return_rate: 7
        },
        {
            dice_total: [2, 4, 6],
            return_rate: 6
        }
    ],
    blue_chip: [
        {
            dice_total: [2, 4, 6],
            return_rate: -2
        },
        {
            dice_total: [3, 5, 7],
            return_rate: 10
        },
        {
            dice_total: [8],
            return_rate: -1
        },
        {
            dice_total: [12, 11],
            return_rate: 9
        },
        {
            dice_total: [9],
            return_rate: 6
        },
        {
            dice_total: [10],
            return_rate: 3
        }
    ],
    mid_cap: [
        {
            dice_total: [12, 11, 10],
            return_rate: -5
        },
        {
            dice_total: [5, 6, 7],
            return_rate: -3
        },
        {
            dice_total: [8, 9],
            return_rate: 15
        },
        {
            dice_total: [2],
            return_rate: 11
        },
        {
            dice_total: [3],
            return_rate: 1
        },
        {
            dice_total: [4],
            return_rate: 3
        }

    ],
    speculative_stock: [
        {
            dice_total: [12, 10, 8],
            return_rate: -50
        },
        {
            dice_total: [6, 4],
            return_rate: -20
        },
        {
            dice_total: [2],
            return_rate: 15
        },
        {
            dice_total: [3, 5, 7],
            return_rate: 45
        },
        {
            dice_total: [9],
            return_rate: 25
        },
        {
            dice_total: [11],
            return_rate: 35
        }
    ],
    international_stock: [
        {
            dice_total: [2, 4, 6],
            return_rate: -3
        },
        {
            dice_total: [8],
            return_rate: -1
        },
        {
            dice_total: [10, 12],
            return_rate: 13
        },
        {
            dice_total: [11, 9],
            return_rate: 10
        },
        {
            dice_total: [7, 5],
            return_rate: 8
        },
        {
            dice_total: [3],
            return_rate: 11
        }
    ],
    US_dollar: [
        {
            dice_total: [12, 11],
            return_rate: -2
        },
        {
            dice_total: [10, 9],
            return_rate: -1
        },
        {
            dice_total: [8, 7],
            return_rate: 8
        },
        {
            dice_total: [6, 5],
            return_rate: 7
        },
        {
            dice_total: [4, 3],
            return_rate: 6
        },
        {
            dice_total: [2],
            return_rate: 5
        }
    ],
    gold_ETF: [
        {
            dice_total: [3, 5],
            return_rate: -5
        },
        {
            dice_total: [7],
            return_rate: -3
        },
        {
            dice_total: [9],
            return_rate: -2
        },
        {
            dice_total: [11],
            return_rate: 18
        },
        {
            dice_total: [2, 4],
            return_rate: 16
        },
        {
            dice_total: [6, 8],
            return_rate: 15
        },
        {
            dice_total: [10, 12],
            return_rate: 13
        }
    ]
};

const investmentReturnSheet = (investment_option, dice_total) => {
    let investment_return = 0;
    if (!returnSheet[investment_option])
        return 0;
    returnSheet[investment_option].forEach(returns => {
        if (returns.dice_total.indexOf(dice_total) > -1) {
            investment_return = returns.return_rate;
        }
    });
    return investment_return;
}

module.exports.investmentReturnSheet = investmentReturnSheet;