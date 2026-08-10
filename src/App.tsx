import React, { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Cylinder } from "./components/Cylinder";
import { ItemRack } from "./components/ItemRack";
import { SettingsPanel } from "./components/SettingsPanel";
import { Arena3D } from "./components/Arena3D";
import { CustomCursor } from "./components/CustomCursor";
import { useGameState } from "./hooks/useGameState";
import { playHeartbeat, setHeartbeatStatus, playTapSound } from "./audio";
import { CustomSelect, SelectOption } from "./components/CustomSelect";
import { Difficulty } from "./types";
import { Menu } from "lucide-react";

export const getDifficultyConfig = (diff: Difficulty) => {
  switch (diff) {
    case 'NORMAL':
      return {
        label: 'NORMAL',
        textColor: 'text-emerald-400 font-bold',
        borderColor: 'border-emerald-600/80 focus:border-emerald-400',
        bgColor: 'bg-emerald-950/40 hover:bg-emerald-900/50',
        glowShadow: 'shadow-[0_0_20px_rgba(16,185,129,0.35)]',
        badgeBg: 'bg-emerald-950/90 text-emerald-400 border-emerald-700/80',
        desc: '100 HP | 3 Starting Items | Dealer: 100 HP, 3 Items',
        intensity: 'NORMAL — INTENDED BASELINE',
      };
    case 'HARD':
      return {
        label: 'HARD',
        textColor: 'text-amber-400 font-bold',
        borderColor: 'border-amber-600/80 focus:border-amber-400',
        bgColor: 'bg-amber-950/40 hover:bg-amber-900/50',
        glowShadow: 'shadow-[0_0_20px_rgba(245,158,11,0.35)]',
        badgeBg: 'bg-amber-950/90 text-amber-400 border-amber-700/80',
        desc: '75 HP | 2 Starting Items | Dealer: 125 HP, 4 Items',
        intensity: 'HARD — TIGHT MARGIN FOR ERROR',
      };
    case 'VERY_HARD':
      return {
        label: 'VERY HARD',
        textColor: 'text-red-500 font-bold',
        borderColor: 'border-red-600/90 focus:border-red-400',
        bgColor: 'bg-red-950/50 hover:bg-red-900/60',
        glowShadow: 'shadow-[0_0_25px_rgba(239,68,68,0.45)]',
        badgeBg: 'bg-red-950/90 text-red-400 border-red-700/80',
        desc: '50 HP | 1 Starting Item | Dealer: 150 HP, 5 Items',
        intensity: 'VERY HARD — UNFORGIVING PUNISHMENT',
      };
    case 'NIGHTMARE':
      return {
        label: 'NIGHTMARE',
        textColor: 'text-fuchsia-400 font-extrabold animate-pulse',
        borderColor: 'border-fuchsia-500 focus:border-fuchsia-300',
        bgColor: 'bg-gradient-to-r from-purple-950/80 via-fuchsia-950/70 to-purple-950/80 hover:from-purple-900/90 hover:to-fuchsia-900/90',
        glowShadow: 'shadow-[0_0_30px_rgba(217,70,239,0.6)]',
        badgeBg: 'bg-fuchsia-950/90 text-fuchsia-300 border-fuchsia-600/80',
        desc: '30 HP | 0 Starting Items | Dealer: 200 HP, 6 Items',
        intensity: 'NIGHTMARE — PURE AGONY',
      };
  }
};

export default function App() {
  const {
    gameState,
    chambers,
    currentChamberIndex,
    player,
    dealer,
    message,
    subMessage,
    bloodLevel,
    retaliationActive,
    playerDamageReductionEnd,
    dealerDamageReductionEnd,
    bloodCurrency,
    doubleDamageActive,
    roundsSurvived,
    buyItem,
    startGame,
    fireGun,
    useItem,
    loadingPhase,
    bulletsInserted,
    bulletTargetCount,
    bluffCharges,
    bluffActiveTurns,
    bluff,
    registerBulletInserted,
    completeLoading,
    autoLoad,
  } = useGameState();

  const [showDeathScreen, setShowDeathScreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isHigh, setIsHigh] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("NORMAL");
  const [inputType, setInputType] = useState<"kbm" | "gamepad">("kbm");
  const [bloodEffectsEnabled, setBloodEffectsEnabled] = useState(true);

  const diffConfig = getDifficultyConfig(difficulty);

  useEffect(() => {
    import("./controller").then(
      ({ getControllerSettings, subscribeControllerSettings }) => {
        setInputType(getControllerSettings().inputType || "kbm");
        setBloodEffectsEnabled(getControllerSettings().bloodEffectsEnabled !== false);
        subscribeControllerSettings((s) => {
          setInputType(s.inputType);
          setBloodEffectsEnabled(s.bloodEffectsEnabled !== false);
        });
      },
    );
  }, []);

  const isPlayerTurn = gameState === "PLAYER_TURN";
  const showControls = isPlayerTurn;
  const isActionInProgress = gameState === "SHOOTING" || gameState === "ITEM_USE" || gameState === "LOADING" || gameState === "DEALER_TURN";
  const isDealerRattled = bluffActiveTurns > 0;

  useEffect(() => {
    if (selectedItemIndex >= player.items.length) {
      setSelectedItemIndex(Math.max(0, player.items.length - 1));
    }
  }, [player.items.length, selectedItemIndex]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button")) {
        playTapSound();
      }
    };
    window.addEventListener("click", handleGlobalClick, true);
    return () => window.removeEventListener("click", handleGlobalClick, true);
  }, []);

  useEffect(() => {
    const isCritical =
      player.health > 0 && player.health <= 40 && gameState !== "GAME_OVER";
    setHeartbeatStatus(isCritical);
  }, [player.health, gameState]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsHigh(
        !!playerDamageReductionEnd && Date.now() < playerDamageReductionEnd,
      );
    }, 200);
    return () => clearInterval(interval);
  }, [playerDamageReductionEnd]);

  useEffect(() => {
    if (gameState === "GAME_OVER" && player.health <= 0) {
      const timer = setTimeout(() => {
        setShowDeathScreen(true);
      }, 2800);
      return () => clearTimeout(timer);
    } else {
      setShowDeathScreen(false);
    }
  }, [gameState, player.health]);

  useEffect(() => {
    if (isSettingsOpen) {
      if ((player.health <= 0 && gameState !== "MENU") || isActionInProgress) {
        setIsSettingsOpen(false);
      }
    }
  }, [player.health, gameState, isSettingsOpen, isActionInProgress]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          document.activeElement.tagName === "SELECT")
      ) {
        return;
      }

      if (e.key === "Tab" || e.key === "Escape") {
        e.preventDefault();
        if (player.health <= 0 && gameState !== "MENU") return;
        if (isActionInProgress) return;
        setIsSettingsOpen((p) => !p);
        return;
      }

      // BLUFF: psych-out the Dealer during your turn.
      if (isPlayerTurn && (e.key === "f" || e.key === "F") && bluffCharges > 0) {
        e.preventDefault();
        bluff();
        return;
      }

      // During interactive loading: Space / Enter / L = QUICK LOAD.
      if (gameState === "LOADING" && (e.key === " " || e.code === "Space" || e.key === "Enter" || e.key === "l" || e.key === "L")) {
        e.preventDefault();
        autoLoad();
        return;
      }

      if (isSettingsOpen) {
        if (e.key === "Escape") {
          setIsSettingsOpen(false);
        }
        return;
      }

      if (
        gameState === "MENU" ||
        gameState === "ROUND_OVER" ||
        gameState === "GAME_OVER" ||
        gameState === "VICTORY"
      ) {
        if (e.key === " " || e.code === "Space" || e.key === "Enter") {
          e.preventDefault();
          const buttons = Array.from(
            document.querySelectorAll(".btn-rusty"),
          ) as HTMLButtonElement[];
          const actionBtn = buttons.find((b) => !b.disabled);
          if (actionBtn) actionBtn.click();
          return;
        }

        if (gameState === "MENU") {
          if (e.key === "ArrowLeft" || e.code === "KeyA") {
            e.preventDefault();
            setDifficulty((prev) => {
              const diffs: Difficulty[] = ["NORMAL", "HARD", "VERY_HARD", "NIGHTMARE"];
              const idx = diffs.indexOf(prev);
              return diffs[(idx - 1 + diffs.length) % diffs.length];
            });
          } else if (e.key === "ArrowRight" || e.code === "KeyD") {
            e.preventDefault();
            setDifficulty((prev) => {
              const diffs: Difficulty[] = ["NORMAL", "HARD", "VERY_HARD", "NIGHTMARE"];
              const idx = diffs.indexOf(prev);
              return diffs[(idx + 1) % diffs.length];
            });
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, isSettingsOpen]);

  useEffect(() => {
    // Basic DOM gamepad support for generic interface interactions
    let frameId = 0;
    let wasAPressed = false;
    let wasStartPressed = false;
    let wasLeftPressed = false;
    let wasRightPressed = false;

    const uiGamepadLoop = () => {
      frameId = requestAnimationFrame(uiGamepadLoop);
      if (typeof navigator !== "undefined" && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        for (const gp of gamepads) {
          if (gp && gp.connected) {
            const isAPressed = gp.buttons[0]?.pressed;
            const isStartPressed = gp.buttons[9]?.pressed; // START button OR Option btn
            const isLeftPressed = gp.buttons[14]?.pressed || gp.axes[0] < -0.5;
            const isRightPressed = gp.buttons[15]?.pressed || gp.axes[0] > 0.5;

            if (isAPressed && !wasAPressed) {
              if (isSettingsOpen) {
                const returnBtn = document.querySelector(
                  ".btn-rusty",
                ) as HTMLButtonElement;
                if (returnBtn) returnBtn.click();
              } else if (gameState === "LOADING") {
                autoLoad();
              } else if (
                gameState === "MENU" ||
                gameState === "ROUND_OVER" ||
                gameState === "GAME_OVER" ||
                gameState === "VICTORY"
              ) {
                // First non-disabled rusty button on screen is likely our main action
                const buttons = Array.from(
                  document.querySelectorAll(".btn-rusty"),
                ) as HTMLButtonElement[];
                const actionBtn = buttons.find((b) => !b.disabled);
                if (actionBtn) actionBtn.click();
              }
            }

            if (gameState === "MENU" && !isSettingsOpen) {
              if (isLeftPressed && !wasLeftPressed) {
                setDifficulty((prev) => {
                  const diffs: Difficulty[] = [
                    "NORMAL",
                    "HARD",
                    "VERY_HARD",
                    "NIGHTMARE",
                  ];
                  const idx = diffs.indexOf(prev);
                  return diffs[(idx - 1 + diffs.length) % diffs.length];
                });
              }
              if (isRightPressed && !wasRightPressed) {
                setDifficulty((prev) => {
                  const diffs: Difficulty[] = [
                    "NORMAL",
                    "HARD",
                    "VERY_HARD",
                    "NIGHTMARE",
                  ];
                  const idx = diffs.indexOf(prev);
                  return diffs[(idx + 1) % diffs.length];
                });
              }
            }

            if (isStartPressed && !wasStartPressed) {
              if ((player.health > 0 || gameState === "MENU") && !isActionInProgress) {
                setIsSettingsOpen((p) => !p);
              }
            }

            wasAPressed = isAPressed;
            wasStartPressed = isStartPressed;
            wasLeftPressed = isLeftPressed;
            wasRightPressed = isRightPressed;
            break;
          }
        }
      }
    };

    frameId = requestAnimationFrame(uiGamepadLoop);
    return () => cancelAnimationFrame(frameId);
  }, [gameState, isSettingsOpen]);

  return (
    <div className={`min-h-screen w-full relative flex flex-col crt ${bloodLevel > 150 ? 'shake-intense' : ''}`}>
      <CustomCursor />
      {/* Blood Overlay */}
      {bloodLevel > 0 && (
        <div
          className={`absolute inset-0 pointer-events-none z-50 ${bloodLevel > 150 ? 'duration-75 scale-105' : 'duration-300'} transition-all`}
          style={{
            backgroundColor: bloodLevel > 150 ? "darkred" : "var(--color-blood)",
            opacity: bloodLevel > 150 ? 0.9 : bloodLevel / 200, // almost completely red out screen on brutal damage
            mixBlendMode: "multiply",
          }}
        />
      )}
      {/* Cigarette Smoke Haze Overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-40 transition-opacity duration-[1500ms]"
        style={{
          backgroundColor: "#3a3632",
          opacity: isHigh ? 0.35 : 0,
          mixBlendMode: "screen",
          filter: "blur(24px)",
        }}
      />
      {player.health > 0 &&
        player.health <= 40 &&
        gameState !== "GAME_OVER" && (
          <div className="absolute inset-0 z-40 heartbeat-overlay mix-blend-multiply pointer-events-none" />
        )}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsPanel difficulty={difficulty} onClose={() => setIsSettingsOpen(false)} />
        )}
      </AnimatePresence>

      {gameState === "MENU" ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 z-10 text-center">
          <h1
            className="text-6xl font-sans font-bold text-red-700 tracking-tighter mb-4 glitch-text"
            data-text="RUSSIAN ROULETTE"
          >
            RUSSIAN <br /> ROULETTE
          </h1>
          <p className="text-gray-500 font-mono tracking-widest uppercase mb-12 text-sm">
            PULL THE TRIGGER. FACE THE DEALER.
          </p>
          <div className="flex flex-col items-center gap-5 mb-12 max-w-md sm:max-w-lg w-full mx-auto px-2">
            <div className="flex items-center gap-4">
              <span className="text-neutral-400 font-mono text-xs uppercase tracking-widest font-bold">
                Difficulty:
              </span>
              <div className="flex items-center gap-3">
                {inputType === "gamepad" && (
                  <span className="gamepad-indicator-cap px-2 text-[9px] uppercase leading-none font-bold">
                    DPAD L
                  </span>
                )}
                <div className="w-[220px]">
                  <CustomSelect<Difficulty>
                    options={[
                      { value: "NORMAL", label: "Normal", colorClass: "text-emerald-400 font-bold", description: "100 HP | Balanced" },
                      { value: "HARD", label: "Hard", colorClass: "text-amber-400 font-bold", description: "Tactical Dealer" },
                      { value: "VERY_HARD", label: "Very Hard", colorClass: "text-red-500 font-bold", description: "Aggressive Dealer" },
                      { value: "NIGHTMARE", label: "NIGHTMARE", colorClass: "text-fuchsia-400 font-bold", description: "Lethal Cosmic Master" }
                    ]}
                    value={difficulty}
                    onChange={(val) => setDifficulty(val)}
                    buttonClassName={`min-w-[200px] uppercase font-mono tracking-widest ${diffConfig.borderColor} ${diffConfig.bgColor} ${diffConfig.glowShadow}`}
                  />
                </div>
                {inputType === "gamepad" && (
                  <span className="gamepad-indicator-cap px-2 text-[9px] uppercase leading-none font-bold">
                    DPAD R
                  </span>
                )}
              </div>
            </div>

            {/* Dynamic difficulty description box */}
            <div className={`max-w-xs sm:max-w-sm w-full px-4 py-2.5 border font-mono text-xs text-center transition-all ${diffConfig.borderColor} ${diffConfig.bgColor} ${diffConfig.glowShadow}`}>
              <div className={`font-extrabold tracking-widest text-[11px] mb-0.5 ${diffConfig.textColor}`}>
                {diffConfig.intensity}
              </div>
              <div className="text-[10px] sm:text-[11px] text-neutral-300 font-sans tracking-wide leading-tight">
                {diffConfig.desc}
              </div>
            </div>
            
            <button
               onClick={() => setIsSettingsOpen(true)}
               className="text-gray-500 font-mono text-xs uppercase tracking-widest hover:text-red-400 transition-colors py-1 flex items-center gap-2 mx-auto justify-center"
            >
               {inputType === "gamepad" && (
                 <span className="gamepad-indicator-cap relative flex items-center justify-center w-5 h-5 rounded-full border border-neutral-700 bg-neutral-800 text-white shadow shadow-black">
                   <Menu size={10} className="stroke-[2.5]" />
                 </span>
               )}
               <span>SETTINGS</span>
            </button>
          </div>
          <button
            onClick={() => startGame(difficulty)}
            className="btn-rusty px-12 py-4 text-xl font-bold tracking-[0.3em] flex items-center justify-center gap-4"
          >
            {inputType === "gamepad" && (
              <span className="gamepad-indicator-btn-a gp-size-large shadow-[0_0_12px_rgba(34,197,94,0.6)]">
                A
              </span>
            )}
            ENTER THE CHAMBER
          </button>
        </div>
      ) : (
        // --- 3D MODE IMMERSIVE FULL-SCREEN VISUAL LAYOUT ---
        <>
          {/* Full Screen 3D Arena World background */}
          <div className="fixed inset-0 w-full h-full z-0 overflow-hidden pointer-events-auto">
            <Arena3D
              gameState={gameState}
              chambers={chambers}
              currentChamberIndex={currentChamberIndex}
              player={player}
              dealer={dealer}
              message={message}
              subMessage={subMessage}
              bloodLevel={bloodLevel}
              doubleDamageActive={doubleDamageActive}
              retaliationActive={retaliationActive}
              selectedItemIndex={selectedItemIndex}
              bloodCurrency={bloodCurrency}
              showControls={showControls}
              useItem={useItem}
              fireGun={fireGun}
              buyItem={buyItem}
              playerDamageReductionEnd={playerDamageReductionEnd}
              dealerDamageReductionEnd={dealerDamageReductionEnd}
              loadingPhase={loadingPhase}
              bulletsInserted={bulletsInserted}
              bulletTargetCount={bulletTargetCount}
              bluffActiveTurns={bluffActiveTurns}
              onBulletInserted={registerBulletInserted}
              onSpinComplete={completeLoading}
              onAutoLoad={autoLoad}
            />
          </div>

          {/* Immersive high-contrast floating overlay HUD */}
          <div className="fixed inset-0 flex flex-col justify-between p-8 z-10 pointer-events-none select-none">
            
            {(player.health > 0 || gameState === "MENU") && !isActionInProgress && (
              <button
                 onClick={() => {
                   if ((player.health > 0 || gameState === "MENU") && !isActionInProgress) {
                     setIsSettingsOpen(true);
                   }
                 }}
                 className="pointer-events-auto absolute top-4 left-4 z-50 text-gray-400 font-mono text-xs uppercase tracking-widest hover:text-red-400 transition-colors py-2 px-3.5 frosted-glass-ui backdrop-blur-md inline-flex items-center gap-2 w-auto"
              >

                 {inputType === "gamepad" && (
                   <span className="gamepad-indicator-cap relative flex items-center justify-center w-5 h-5 rounded-full border border-neutral-700 bg-neutral-800 text-white shadow shadow-black">
                     <Menu size={10} className="stroke-[2.5]" />
                   </span>
                 )}
                 <span>SETTINGS</span>
              </button>
            )}

            {isPlayerTurn && inputType === "gamepad" && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center justify-center gap-3.5 text-[10px] uppercase font-mono text-gray-300 frosted-glass-ui px-5 py-2.5 drop-shadow-2xl animate-fade-in shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                <span className="flex items-center gap-1.5">
                  <span className="gamepad-indicator-btn-b gp-size-medium">
                    B
                  </span>{" "}
                  <span className="opacity-80">TOGGLE</span>
                </span>
                <span className="opacity-20 text-neutral-600">|</span>
                <span className="flex items-center gap-1.5">
                  <span className="gamepad-indicator-cap uppercase text-[8px] px-1 py-0.5">D-PAD</span>{" "}
                  <span className="opacity-80">CYCLE</span>
                </span>
                <span className="opacity-20 text-neutral-600">|</span>
                <span className="flex items-center gap-1.5">
                  <span className="gamepad-indicator-btn-a gp-size-medium">
                    A
                  </span>{" "}
                  <span className="opacity-80">USE/BUY</span>
                </span>
                <span className="opacity-20 text-neutral-600">|</span>
                <span className="flex items-center gap-1.5">
                  <span className="gamepad-indicator-cap uppercase text-[8px] px-1 py-0.5">
                    LT
                  </span>{" "}
                  <span className="opacity-80 text-red-400">SHOOT SELF</span>
                </span>
                <span className="opacity-20 text-neutral-600">|</span>
                <span className="flex items-center gap-1.5">
                  <span className="gamepad-indicator-cap uppercase text-[8px] px-1 py-0.5">
                    RT
                  </span>{" "}
                  <span className="opacity-90 text-red-500 font-bold">
                    DEALER
                  </span>
                </span>
              </div>
            )}

            {/* Top Row: Dealer Hand info */}
            <div className="flex justify-between items-start w-full mt-4 sm:mt-0">
              <div className="flex items-center gap-3 pointer-events-auto">
                {isPlayerTurn && (
                  <>
                    <button
                      onClick={() => bluff()}
                      disabled={bluffCharges <= 0}
                      className={`pointer-events-auto min-h-[38px] px-4 py-2 rounded-none border font-mono text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 ${
                        bluffCharges > 0
                          ? isDealerRattled
                            ? "bg-fuchsia-950/80 border-fuchsia-600 text-fuchsia-200 shadow-[0_0_18px_rgba(217,70,239,0.35)]"
                            : "bg-red-950/80 border-red-700 text-red-200 hover:bg-red-900/90 hover:border-red-500"
                          : "bg-neutral-900/70 border-neutral-800 text-neutral-600 cursor-not-allowed"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      <span>BLUFF ({bluffCharges})</span>
                      <span className="text-[9px] text-neutral-500 font-normal hidden sm:inline">[F]</span>
                    </button>
                    {isDealerRattled && (
                      <span className="px-3 py-1.5 rounded-none border border-fuchsia-800/70 bg-fuchsia-950/60 text-fuchsia-300 font-mono text-[10px] font-bold uppercase tracking-widest animate-pulse">
                        DEALER RATTLED ({bluffActiveTurns})
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="text-[10px] font-mono text-neutral-300 frosted-glass-ui backdrop-blur-md px-3 py-1.5 select-none font-bold">
                DEALER HAND: {dealer.items.length}/8
              </div>
            </div>

            {/* Bottom Section: Dialogue text and Health/Inventory displays packaged together at the bottom */}
            <div className="flex flex-col gap-3 w-full mt-auto">
              {/* Bottom Row: Player Health & Help guides */}
              <div className="flex justify-between items-end w-full">
                <div className="pointer-events-auto">
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[9px] font-mono text-gray-300 uppercase frosted-glass-ui backdrop-blur-md px-3 py-1 font-bold tracking-wider">
                    ACTIVE INVENTORY: {player.items.length}/8 ITEMS
                  </span>
                </div>
              </div>

              {/* Interactive Loading Instructions + Quick Load */}
      {gameState === "LOADING" && (
        <div className="fixed inset-x-0 bottom-24 sm:bottom-28 z-20 flex flex-col items-center gap-2.5 pointer-events-none">
          <div className="frosted-glass-ui px-5 py-3 border border-red-950/70 text-center max-w-xl animate-fade-in">
            {loadingPhase === "pickup" ? (
              <>
                <div className="font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-red-300">
                  LOAD THE CYLINDER — ROUND BY ROUND
                </div>
                <div className="mt-1 font-mono text-[10px] sm:text-[11px] text-neutral-300 tracking-wide">
                  CLICK A ROUND ON THE WOODEN BLOCK AND DRAG IT INTO AN OPEN CHAMBER
                  <span className="mx-2 text-red-500/80">•</span>
                  <span className="text-amber-300 font-bold">{bulletsInserted}/{bulletTargetCount} SEATED</span>
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-red-300">
                  SPIN THE CYLINDER
                </div>
                <div className="mt-1 font-mono text-[10px] sm:text-[11px] text-neutral-300 tracking-wide">
                  CLICK ON THE CYLINDER AND DRAG ACROSS IT. LET IT RATCHET TO A STOP.
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => autoLoad()}
            className="pointer-events-auto min-h-[36px] px-4 py-1.5 rounded-none border border-neutral-700 bg-neutral-900/80 hover:border-red-600 hover:text-red-300 text-neutral-400 font-mono text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer"
            title="Skip manual loading"
          >
            QUICK LOAD [SPACE]
          </button>
        </div>
      )}

      {/* Dialogue Box: Pure floating text centered at the absolute bottom, no container box, borderless and unobstructed */}
              {((gameState !== "SHOOTING" &&
                !(gameState === "GAME_OVER" && player.health <= 0)) ||
                message === "BANG!" ||
                message === "Click.") && (
                <div className="text-center max-w-2xl mx-auto flex flex-col gap-0.5 items-center pointer-events-auto select-text z-20">
                  <h2 className="text-base sm:text-lg font-mono text-white tracking-[0.2em] font-bold uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,1.0)]">
                    {message}
                  </h2>
                  {subMessage && (
                    <p className="text-red-500 font-serif italic text-xs sm:text-sm drop-shadow-[0_1.5px_4px_rgba(0,0,0,1.0)]">
                      {subMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Cinematic overlay for 3D Mode during falling animation */}
      {gameState === "GAME_OVER" && player.health <= 0 && !showDeathScreen && (
        <motion.div
          className="fixed inset-0 bg-black pointer-events-none z-[150]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.2, delay: 0.3, ease: "easeIn" }}
        />
      )}

      {/* GLOBAL GAME OVER OVERLAY (Both 2D and 3D modes) */}
      {gameState === "GAME_OVER" && (showDeathScreen || dealer.health <= 0) && (
        <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-[200]">
          {player.health <= 0 ? (
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                x: [0, -25, 18, -12, 8, -4, 0],
                y: [0, 15, -15, 10, -6, 3, 0],
              }}
              transition={{
                type: "spring",
                stiffness: 90,
                damping: 10,
                delay: 0.05,
                x: { duration: 0.6, ease: "easeOut" },
                y: { duration: 0.6, ease: "easeOut" },
              }}
              className="flex flex-col items-center gap-6 z-10"
            >
              <motion.div
                key="dead-text"
                className="relative group select-none"
                initial={{ filter: "blur(25px)", y: 60 }}
                animate={{ filter: "blur(0px)", y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <h2
                  className="text-8xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-red-600 via-red-800 to-black drop-shadow-[0_0_55px_#ff0000] font-serif tracking-[0.15em] uppercase relative z-10 text-center glitch-text animate-pulse"
                  data-text="DEAD"
                >
                  DEAD
                </h2>
                <div className="absolute inset-0 bg-red-950/55 blur-3xl rounded-full scale-150 z-0 animate-pulse duration-[2000ms]"></div>
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-red-600/10 blur-2xl rounded-full w-80 h-80 mx-auto z-0 animate-ping duration-[3500ms]"></div>
              </motion.div>

              {/* Animated EKG Monitor Line */}
              <div className="w-72 h-10 relative flex items-center justify-center opacity-50 my-1">
                <svg
                  viewBox="0 0 300 40"
                  className="w-full h-full stroke-red-600 stroke-[2] fill-none"
                >
                  <motion.path
                    d="M0,20 L80,20 L90,5 L100,35 L110,20 L160,20 L168,5 L175,35 L182,20 L230,20 L235,10 L240,30 L245,20 L300,20"
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: [0, 1], opacity: [1, 0.4, 0] }}
                    transition={{ duration: 1.8, ease: "easeInOut" }}
                  />
                  <motion.line
                    x1="0"
                    y1="20"
                    x2="300"
                    y2="20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0, 0, 0.9] }}
                    transition={{
                      duration: 2.0,
                      times: [0, 0.4, 0.8, 1],
                      repeat: Infinity,
                      repeatType: "reverse",
                    }}
                    className="stroke-red-700 stroke-[1.5]"
                  />
                </svg>
                <span className="absolute right-2 top-0 text-[8px] font-mono text-red-500 tracking-[0.3em] uppercase animate-pulse">
                  NO SIGNAL
                </span>
                <span className="absolute left-2 top-0 text-[8px] font-mono text-red-700 tracking-[0.3em] uppercase">
                  HR: 0
                </span>
              </div>



              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="font-mono text-xs text-neutral-300 tracking-widest uppercase flex flex-col items-center gap-2 frosted-glass-ui px-6 py-4 border border-red-950/60 rounded-none shadow-[0_0_25px_rgba(0,0,0,0.8)] min-w-[300px]"
              >
                <div className="flex justify-between w-full gap-8 border-b border-red-950/20 pb-2">
                  <span className="text-gray-600">Rounds Survived:</span>
                  <span className="text-amber-500 font-bold">{roundsSurvived}</span>
                </div>
                <div className="flex justify-between w-full gap-8 border-b border-red-950/20 pb-2">
                  <span className="text-gray-600">Blood Splattered:</span>
                  <span className="text-red-500 font-bold">{bloodLevel}%</span>
                </div>
                <div className="flex justify-between w-full gap-8">
                  <span className="text-gray-600">Lost Inheritance:</span>
                  <span className="text-red-650 font-bold">
                    {bloodCurrency} Blood
                  </span>
                </div>
              </motion.div>

              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.5, type: "spring", stiffness: 200 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => startGame(difficulty)}
                className="btn-rusty px-10 py-4 bg-gradient-to-r from-red-950/40 to-black border-2 border-red-700/60 hover:border-red-500 rounded text-red-500 hover:text-red-400 font-mono text-xl tracking-widest uppercase shadow-[0_0_25px_rgba(153,27,27,0.3)] hover:shadow-[0_0_40px_rgba(153,27,27,0.6)] transition-all cursor-pointer animate-pulse flex items-center justify-center gap-3"
              >
                {inputType === "gamepad" && (
                  <span className="gamepad-indicator-btn-a gp-size-medium shadow-[0_0_8px_rgba(34,197,94,0.5)] mr-1">
                    A
                  </span>
                )}
                TRY AGAIN
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 10,
                delay: 0.2,
              }}
              className="flex flex-col items-center gap-6"
            >
              <motion.div
                key="survived-text"
                className="relative"
                initial={{ filter: "blur(10px)", y: 50 }}
                animate={{ filter: "blur(0px)", y: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
              >
                <h2 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-amber-500 to-red-600 drop-shadow-[0_0_30px_rgba(251,191,36,0.6)] font-serif tracking-widest uppercase relative z-10 text-center animate-pulse">
                  SURVIVED
                </h2>
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full scale-150 z-0 animate-pulse"></div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="text-gray-400 font-mono tracking-widest uppercase text-center max-w-lg"
              >
                "You beat the odds. But the house is always waiting."
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.5, duration: 0.5 }}
                className="font-mono text-xs text-neutral-300 tracking-widest uppercase flex flex-col items-center gap-1 frosted-glass-ui px-6 py-3.5 border border-red-900/50 rounded-none mb-2"
              >
                <span>Accumulated Blood Currency:</span>
                <span className="text-2xl font-bold text-red-500 tracking-wider font-mono">
                  {bloodCurrency} BLOOD
                </span>
              </motion.div>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 2.0, type: "spring", stiffness: 200 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => startGame(difficulty, true)}
                  className="btn-rusty px-10 py-4 bg-gradient-to-r from-red-900 to-red-800 border-2 border-red-500 rounded text-red-100 font-mono text-xl tracking-widest uppercase shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:shadow-[0_0_40px_rgba(220,38,38,0.8)] transition-all flex items-center justify-center gap-3"
                >
                  {inputType === "gamepad" && (
                    <span className="gamepad-indicator-btn-a gp-size-medium shadow-[0_0_8px_rgba(34,197,94,0.5)] mr-1">
                      A
                    </span>
                  )}
                  ENTER NEXT ROUND
                </motion.button>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.2, duration: 0.5 }}
                className="font-mono text-xs text-neutral-300 tracking-widest uppercase flex items-center gap-2 frosted-glass-ui px-5 py-2.5 border border-red-900/40 rounded-none shadow-[0_0_15px_rgba(0,0,0,0.8)]"
              >
                <span className="text-gray-400 font-semibold">ROUNDS SURVIVED:</span>
                <span className="text-lg font-bold text-amber-400 tracking-wider font-mono">
                  {roundsSurvived}
                </span>
              </motion.div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
