import { createCommerceGuild } from "../expansion/commerceGuild";
import { createDevelopmentDeck } from "../rules/developmentCards";
import { createSetupGame } from "../setup";
import type { MatchExecutionContext, MatchState } from "./types";

export interface MatchSeat {
  nickname: string;
}

function shuffleDevelopmentDeck(context: MatchExecutionContext) {
  const deck = createDevelopmentDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = context.random.nextInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function createSetupMatch(
  seats: readonly MatchSeat[],
  context: MatchExecutionContext
): MatchState {
  if (seats.length !== 3 && seats.length !== 4) {
    throw new RangeError("A match requires three or four seats.");
  }

  return {
    game: createSetupGame(
      seats.map((seat) => seat.nickname),
      shuffleDevelopmentDeck(context)
    ),
    guild: createCommerceGuild(),
    lastDice: null
  };
}
