import React, { useReducer } from "react";
import { gameReducer } from "./app/gameReducer";
import { createInitialAppState, createLocalGameTableView } from "./app/localGameState";
import { GameTable } from "./ui/GameTable";

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialAppState);

  return <GameTable view={createLocalGameTableView(state)} dispatch={dispatch} />;
}
