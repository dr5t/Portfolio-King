export function getGameLeaderboard(game: any): any[] {
  if (!game || !game.players) {
    return [];
  }
  const list = game.players.map((player, index) => {
    const rounds = player.rounds || [];
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const initialVal = (rounds.length > 0 && rounds[0].round_starting_value)
      ? rounds[0].round_starting_value
      : 1000000;
    const currentVal = lastRound ? lastRound.total_portfolio_value : initialVal;
    const totalDebt = player.loans && player.loans.length > 0
      ? player.loans.reduce((sum, loan) => sum + (loan.balance || 0), 0)
      : 0;
    const netWorth = currentVal - totalDebt;
    const returnPct = initialVal > 0 ? ((netWorth - initialVal) / initialVal) * 100 : 0;
    return {
      _id: player._id,
      name: player.name,
      index: index + 1,
      startingVal: initialVal,
      currentVal,
      debt: totalDebt,
      netWorth,
      returnPct,
      gameStatus: player.game_status || 'joined'
    };
  });
  list.sort((a, b) => b.netWorth - a.netWorth || b.currentVal - a.currentVal);
  return list.map((item, index) => ({ ...item, rank: index + 1 }));
}
