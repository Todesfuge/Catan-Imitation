import { useMemo, useReducer, useState } from "react";
import {
  ArrowRightLeft,
  BookOpen,
  Castle,
  Coins,
  Dices,
  Gift,
  Hammer,
  Home,
  Info,
  Landmark,
  Maximize,
  ScrollText,
  Settings,
  Timer,
  Trophy,
  Warehouse
} from "lucide-react";
import { createInitialAppState, gameReducer, type GameCommand } from "./app/gameReducer";
import { getDiceIncome, getExpectedIncomeMatrix, getPlayerIncome } from "./domain/stats/income";
import { calculatePlayerScore } from "./domain/rules/scoring";
import { resources, type BoardHex, type Building, type ResourceMap } from "./domain/types";
import type { ResourceCost } from "./domain/expansion/commerceGuild";

type StatsMode = "player" | "dice" | "matrix";

const resourceLabels = {
  wood: "Wood",
  brick: "Brick",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore"
} as const;

function formatResourceMap(map: Partial<ResourceMap>) {
  return resources
    .filter((resource) => (map[resource] ?? 0) > 0)
    .map((resource) => `${resourceLabels[resource]} ${map[resource]}`)
    .join(", ");
}

function terrainLabel(hex: BoardHex) {
  if (hex.terrain === "desert") {
    return "Desert";
  }
  return resourceLabels[hex.resource ?? "wood"];
}

function hexPosition(hex: BoardHex) {
  return {
    x: 50 + hex.q * 11 + hex.r * 5.5,
    y: 50 + hex.r * 9.5
  };
}

function buildingPosition(hexes: BoardHex[], building: Building) {
  const hex = hexes.find((candidate) => candidate.vertexIds.includes(building.vertexId));
  if (!hex) {
    return { x: 50, y: 50 };
  }
  const vertexIndex = Math.max(0, hex.vertexIds.indexOf(building.vertexId));
  const center = hexPosition(hex);
  const angle = ((vertexIndex * 60 - 90) * Math.PI) / 180;
  return {
    x: center.x + Math.cos(angle) * 5,
    y: center.y + Math.sin(angle) * 5.5
  };
}

function BoardView({
  state,
  dispatch
}: {
  state: ReturnType<typeof createInitialAppState>;
  dispatch: (command: GameCommand) => void;
}) {
  return (
    <section className="board-zone" aria-label="Catan board">
      <div className="utility-rail" aria-label="Utility controls">
        <button title="Settings" type="button">
          <Settings size={26} />
        </button>
        <button title="Rulebook" type="button">
          <BookOpen size={26} />
        </button>
        <button title="Fullscreen" type="button">
          <Maximize size={26} />
        </button>
        <button title="Info" type="button">
          <Info size={26} />
        </button>
      </div>
      <div className="island">
        {state.game.board.map((hex) => {
          const position = hexPosition(hex);
          return (
            <button
              className={`hex terrain-${hex.terrain}`}
              key={hex.id}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              title={terrainLabel(hex)}
              onClick={() => dispatch({ type: "PLACE_ROBBER", hexId: hex.id })}
              type="button"
            >
              <span className="hex-resource">{terrainLabel(hex)}</span>
              {hex.diceNumber ? (
                <span className={`dice-chip ${hex.diceNumber === 6 || hex.diceNumber === 8 ? "hot" : ""}`}>
                  {hex.diceNumber}
                </span>
              ) : (
                <span className="robber-label">Robber</span>
              )}
              {state.game.robberHexId === hex.id ? <span className="robber-piece" /> : null}
            </button>
          );
        })}
        {state.game.buildings.map((building) => {
          const position = buildingPosition(state.game.board, building);
          const owner = state.game.players.find((player) => player.id === building.ownerId);
          return (
            <span
              className={`building-marker ${building.kind}`}
              key={building.id}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                borderColor: owner?.color
              }}
              title={`${owner?.name ?? building.ownerId} ${building.kind}`}
            />
          );
        })}
      </div>
    </section>
  );
}

function PlayerPanel({ state }: { state: ReturnType<typeof createInitialAppState> }) {
  return (
    <section className="players-panel" aria-label="Players">
      {state.game.players.map((player) => {
        const score = calculatePlayerScore(state.game, player.id);
        const active = player.id === state.game.activePlayerId;
        return (
          <article className={`player-card ${active ? "active" : ""}`} key={player.id}>
            <div className="player-main">
              <span className="avatar" style={{ borderColor: player.color }}>
                {player.name.slice(0, 1)}
              </span>
              <div>
                <strong>{player.name}</strong>
                <span>{active ? "Taking turn" : "Waiting"}</span>
              </div>
            </div>
            <div className="player-metrics">
              <span>
                <Trophy size={15} /> {score}
              </span>
              <span>
                <Coins size={15} /> {player.guildTokens}
              </span>
              <span>
                <Gift size={15} /> {player.vouchers}
              </span>
              <span>
                <Landmark size={15} /> {player.prizeCards}
              </span>
            </div>
            <div className="resource-strip compact">
              {resources.map((resource) => (
                <span className={`resource-token ${resource}`} key={resource}>
                  {resourceLabels[resource].slice(0, 2)} {player.resources[resource]}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function RightRail({ state }: { state: ReturnType<typeof createInitialAppState> }) {
  return (
    <aside className="right-rail">
      <section className="log-panel">
        <h2>
          <ScrollText size={18} /> Game Log
        </h2>
        <div className="log-list">
          {state.game.log.slice(0, 8).map((entry) => (
            <p key={entry.id}>{entry.message}</p>
          ))}
        </div>
      </section>
      <section className="chat-shell">
        <strong>Chat</strong>
        <span>Local hot-seat demo</span>
      </section>
      <section className="bank-panel">
        <Warehouse size={28} />
        <div className="resource-strip">
          {resources.map((resource) => (
            <span className={`resource-token ${resource}`} key={resource}>
              {resourceLabels[resource]} {state.game.bank.resources[resource]}
            </span>
          ))}
        </div>
      </section>
      <PlayerPanel state={state} />
    </aside>
  );
}

function StatsPanel({
  state,
  dispatch
}: {
  state: ReturnType<typeof createInitialAppState>;
  dispatch: (command: GameCommand) => void;
}) {
  const [mode, setMode] = useState<StatsMode>("player");
  const playerRows = useMemo(
    () => getPlayerIncome(state.game, state.selectedPlayerId),
    [state.game, state.selectedPlayerId]
  );
  const diceIncome = useMemo(
    () => getDiceIncome(state.game, state.selectedDiceTotal),
    [state.game, state.selectedDiceTotal]
  );
  const matrix = useMemo(() => getExpectedIncomeMatrix(state.game), [state.game]);

  return (
    <section className="tool-panel stats-panel">
      <div className="panel-header">
        <h2>Yield Statistics</h2>
        <div className="segmented">
          {(["player", "dice", "matrix"] as const).map((nextMode) => (
            <button
              className={mode === nextMode ? "selected" : ""}
              key={nextMode}
              onClick={() => setMode(nextMode)}
              type="button"
            >
              {nextMode}
            </button>
          ))}
        </div>
      </div>
      {mode === "player" ? (
        <>
          <select
            value={state.selectedPlayerId}
            onChange={(event) =>
              dispatch({ type: "SELECT_PLAYER", playerId: event.currentTarget.value })
            }
          >
            {state.game.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dice</th>
                  <th>Chance</th>
                  <th>Gain now</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => (
                  <tr key={row.diceTotal}>
                    <td>{row.diceTotal}</td>
                    <td>{Math.round(row.probability * 1000) / 10}%</td>
                    <td>{formatResourceMap(row.resources) || "-"}</td>
                    <td>{formatResourceMap(row.expected) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {mode === "dice" ? (
        <>
          <select
            value={state.selectedDiceTotal}
            onChange={(event) =>
              dispatch({ type: "SELECT_DICE_TOTAL", diceTotal: Number(event.currentTarget.value) })
            }
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((diceTotal) => (
              <option key={diceTotal} value={diceTotal}>
                {diceTotal}
              </option>
            ))}
          </select>
          <div className="dice-income-list">
            {state.game.players.map((player) => (
              <p key={player.id}>
                <strong>{player.name}</strong>
                <span>{formatResourceMap(diceIncome.players[player.id]) || "no gain"}</span>
              </p>
            ))}
          </div>
        </>
      ) : null}
      {mode === "matrix" ? (
        <div className="table-scroll matrix">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                {resources.map((resource) => (
                  <th key={resource}>{resourceLabels[resource]}</th>
                ))}
                <th>Total EV</th>
              </tr>
            </thead>
            <tbody>
              {state.game.players.map((player) => {
                const totals = matrix.totals[player.id];
                const totalExpected = resources.reduce((sum, resource) => sum + totals[resource], 0);
                return (
                  <tr key={player.id}>
                    <td>{player.name}</td>
                    {resources.map((resource) => (
                      <td key={resource}>{totals[resource].toFixed(2)}</td>
                    ))}
                    <td>{totalExpected.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function CommercePanel({
  state,
  dispatch
}: {
  state: ReturnType<typeof createInitialAppState>;
  dispatch: (command: GameCommand) => void;
}) {
  const activePlayer = state.game.players.find((player) => player.id === state.game.activePlayerId);
  const [recipientId, setRecipientId] = useState("p2");
  const [tokenAmount, setTokenAmount] = useState(1);
  const [bids, setBids] = useState<Record<string, number>>({});

  return (
    <section className="tool-panel commerce-panel">
      <div className="panel-header">
        <h2>Commerce Guild</h2>
        <span>Round {state.game.round}</span>
      </div>
      <div className="trade-slots">
        {state.guild.tradeSlots.map((slot) => (
          <article className="trade-slot" key={slot.id}>
            <strong>{formatResourceMap(slot.requires as Partial<ResourceMap>)}</strong>
            <span>
              <ArrowRightLeft size={14} /> {slot.tokenReward} tokens
            </span>
            <button
              onClick={() =>
                activePlayer &&
                dispatch({ type: "COMPLETE_TRADE_SLOT", playerId: activePlayer.id, slotId: slot.id })
              }
              type="button"
            >
              Trade
            </button>
          </article>
        ))}
      </div>
      <div className="token-transfer">
        <select value={recipientId} onChange={(event) => setRecipientId(event.currentTarget.value)}>
          {state.game.players
            .filter((player) => player.id !== state.game.activePlayerId)
            .map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
        </select>
        <input
          min={1}
          type="number"
          value={tokenAmount}
          onChange={(event) => setTokenAmount(Number(event.currentTarget.value))}
        />
        <button
          onClick={() =>
            activePlayer &&
            dispatch({
              type: "TRANSFER_TOKENS",
              fromPlayerId: activePlayer.id,
              toPlayerId: recipientId,
              amount: tokenAmount
            })
          }
          type="button"
        >
          Send
        </button>
      </div>
      <div className="gathering">
        <div className="phase-line">
          <Landmark size={16} />
          <strong>{state.guild.gathering.phase}</strong>
        </div>
        {state.guild.gathering.phase === "idle" ? (
          <button onClick={() => dispatch({ type: "START_GATHERING" })} type="button">
            Start Gathering
          </button>
        ) : null}
        {state.guild.gathering.phase === "redemption" ? (
          <>
            <div className="resource-buttons">
              {resources.map((resource) => (
                <button
                  key={resource}
                  onClick={() =>
                    activePlayer &&
                    dispatch({
                      type: "REDEEM_GATHERING",
                      playerId: activePlayer.id,
                      resources: { [resource]: 1 }
                    })
                  }
                  type="button"
                >
                  +{resourceLabels[resource]}
                </button>
              ))}
            </div>
            <button onClick={() => dispatch({ type: "OPEN_AUCTION" })} type="button">
              Open Auctions
            </button>
          </>
        ) : null}
        {state.guild.gathering.phase === "auction" ? (
          <div className="auction-grid">
            <strong>Round {state.guild.gathering.auctionRound} / 3</strong>
            {state.game.players.map((player) => (
              <label key={player.id}>
                {player.name}
                <input
                  min={0}
                  type="number"
                  value={bids[player.id] ?? 0}
                  onChange={(event) =>
                    setBids({ ...bids, [player.id]: Number(event.currentTarget.value) })
                  }
                />
              </label>
            ))}
            <button onClick={() => dispatch({ type: "RESOLVE_AUCTION", bids })} type="button">
              Resolve Blind Box
            </button>
          </div>
        ) : null}
        <button
          onClick={() => activePlayer && dispatch({ type: "REDEEM_PRIZE", playerId: activePlayer.id })}
          type="button"
        >
          Redeem Prize
        </button>
      </div>
    </section>
  );
}

function ActionBar({
  state,
  dispatch
}: {
  state: ReturnType<typeof createInitialAppState>;
  dispatch: (command: GameCommand) => void;
}) {
  const activePlayer = state.game.players.find((player) => player.id === state.game.activePlayerId);
  const ownedBuildingVertices = new Set(
    state.game.buildings
      .filter((building) => building.ownerId === activePlayer?.id)
      .map((building) => building.vertexId)
  );
  const ownedRoadVertices = new Set(
    state.game.roads
      .filter((road) => road.ownerId === activePlayer?.id)
      .flatMap((road) => state.game.edges.find((edge) => edge.id === road.edgeId)?.vertexIds ?? [])
  );
  const occupiedRoadEdgeIds = new Set(state.game.roads.map((road) => road.edgeId));
  const nextRoadEdge = state.game.edges.find(
    (edge) =>
      !occupiedRoadEdgeIds.has(edge.id) &&
      edge.vertexIds.some(
        (vertexId) => ownedBuildingVertices.has(vertexId) || ownedRoadVertices.has(vertexId)
      )
  )?.id;
  const nextVertex = state.game.board
    .flatMap((hex) => hex.vertexIds)
    .find((vertexId) => !state.game.buildings.some((building) => building.vertexId === vertexId));
  const upgradable = state.game.buildings.find(
    (building) => building.ownerId === activePlayer?.id && building.kind === "settlement"
  );

  return (
    <footer className="action-bar">
      <div className="turn-status">
        <Timer size={26} />
        <div>
          <strong>{activePlayer?.name ?? "Player"}</strong>
          <span>Turn {state.game.turn} · Round {state.game.round}</span>
        </div>
      </div>
      <button onClick={() => dispatch({ type: "ROLL_DICE" })} type="button">
        <Dices size={20} /> Roll Dice
      </button>
      <button
        onClick={() =>
          activePlayer &&
          nextRoadEdge &&
          dispatch({ type: "BUILD_ROAD", playerId: activePlayer.id, edgeId: nextRoadEdge })
        }
        disabled={!nextRoadEdge}
        type="button"
      >
        <Hammer size={20} /> Road
      </button>
      <button
        onClick={() =>
          activePlayer &&
          nextVertex &&
          dispatch({ type: "BUILD_SETTLEMENT", playerId: activePlayer.id, vertexId: nextVertex })
        }
        type="button"
      >
        <Home size={20} /> Settlement
      </button>
      <button
        onClick={() =>
          activePlayer &&
          upgradable &&
          dispatch({ type: "BUILD_CITY", playerId: activePlayer.id, buildingId: upgradable.id })
        }
        type="button"
      >
        <Castle size={20} /> City
      </button>
      <button className="primary" onClick={() => dispatch({ type: "END_TURN" })} type="button">
        End Turn
      </button>
      <div className="dice-readout">
        {state.lastDice ? `${state.lastDice.first} + ${state.lastDice.second} = ${state.lastDice.total}` : "No roll"}
      </div>
    </footer>
  );
}

export default function App() {
  const [state, dispatchBase] = useReducer(gameReducer, undefined, createInitialAppState);
  const [notice, setNotice] = useState<string | null>(null);

  function dispatch(command: GameCommand) {
    try {
      dispatchBase(command);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    }
  }

  return (
    <main className="game-shell">
      <BoardView state={state} dispatch={dispatch} />
      <RightRail state={state} />
      <div className="bottom-dock">
        <StatsPanel state={state} dispatch={dispatch} />
        <CommercePanel state={state} dispatch={dispatch} />
      </div>
      <ActionBar state={state} dispatch={dispatch} />
      {notice ? <div className="toast">{notice}</div> : null}
    </main>
  );
}
