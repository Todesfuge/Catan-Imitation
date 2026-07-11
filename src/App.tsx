import React, { useReducer, useRef } from "react";
import { gameReducer } from "./app/gameReducer";
import {
  createInitialAppState,
  createLocalGameTableController,
  createLocalGameTableView
} from "./app/localGameState";
import { GameTable } from "./ui/GameTable";

export function LocalGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialAppState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const controllerRef = useRef<ReturnType<typeof createLocalGameTableController>>();
  controllerRef.current ??= createLocalGameTableController(() => stateRef.current, dispatch);

  return <GameTable view={createLocalGameTableView(state)} dispatch={controllerRef.current.dispatch} />;
}

export default LocalGame;
