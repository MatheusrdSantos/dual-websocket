const createGameState = () => {
  return {
    team1: {
      score: 0,
      triangle: {

      },
      circle: {

      },
      square: {

      }
    },
    team2: {
      score: 0,
      triangle: {

      },
      circle: {

      },
      square: {
        
      }
    },
    // TODO: this should be random
    matches: [['triangle', 'circle'], ['square', 'triangle'], ['circle', 'square']]
  }
}