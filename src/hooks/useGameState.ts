import { useState, useRef, useEffect, useCallback } from 'react';
import { GameState, Chamber, PlayerState, ItemType, Difficulty } from '../types';
import { DEADLY_QUOTES, getRandomItemsByDifficulty, getItemPrice } from '../gameData';
import { playStartAudio, startAmbientDrone, playGunshot, playEmptyClick, playItemSound, playBloodSplatter } from '../audio';
import { vibrateGamepad, getControllerSettings } from '../controller';

const INITIAL_HEALTH = 100;
const DAMAGE_PER_SHOT = 35;
const CYLINDER_SIZE = 6;

const generateChambers = (numLive: number): Chamber[] => {
  const chambers = Array(CYLINDER_SIZE).fill({ isLive: false, isSpent: false });
  let placed = 0;
  while (placed < numLive) {
    const idx = Math.floor(Math.random() * CYLINDER_SIZE);
    if (!chambers[idx].isLive) {
      chambers[idx] = { isLive: true, isSpent: false };
      placed++;
    }
  }
  return chambers;
};


interface CoreState {
  gameState: GameState;
  difficulty: Difficulty;
  chambers: Chamber[];
  currentChamberIndex: number;
  player: PlayerState;
  dealer: PlayerState;
  message: string;
  subMessage: string;
  bloodLevel: number;
  turnSequence: number;
  retaliationActive: boolean;
  playerDamageReductionEnd: number | null;
  dealerDamageReductionEnd: number | null;
  bloodCurrency: number;
  doubleDamageActive: 'player' | 'dealer' | null;
  roundsSurvived: number;
  shooter: 'player' | 'dealer' | null;
  target: 'player' | 'dealer' | null;
}

export const useGameState = () => {
  const [state, setState] = useState<CoreState>({
    gameState: 'MENU',
    difficulty: 'NORMAL',
    chambers: [],
    currentChamberIndex: 0,
    player: { health: INITIAL_HEALTH, maxHealth: INITIAL_HEALTH, items: [] },
    dealer: { health: INITIAL_HEALTH, maxHealth: INITIAL_HEALTH, items: [] },
    message: 'Load the cylinder.',
    subMessage: '',
    bloodLevel: 0,
    turnSequence: 0,
    retaliationActive: false,
    playerDamageReductionEnd: null,
    dealerDamageReductionEnd: null,
    bloodCurrency: 0,
    doubleDamageActive: null,
    roundsSurvived: 0,
    shooter: null,
    target: null
  });

  const stateRef = useRef<CoreState>(state);
  stateRef.current = state;
  const dealerItemsUsedThisTurnRef = useRef(0);
  
  const updateState = useCallback((patch: Partial<CoreState>) => {
    stateRef.current = { ...stateRef.current, ...patch, turnSequence: stateRef.current.turnSequence + 1 };
    setState(stateRef.current);
  }, []);

  const liveCount = state.chambers.filter(c => c.isLive && !c.isSpent).length;
  const blankCount = state.chambers.filter(c => !c.isLive && !c.isSpent).length;

  const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

  const startRound = async (initialLoading = false) => {
    dealerItemsUsedThisTurnRef.current = 0;
    updateState({ gameState: 'LOADING' });
    const live = Math.floor(Math.random() * 5) + 1; // 1 to 5 live rounds
    const newChambers = generateChambers(live);
    
    updateState({
      chambers: newChambers,
      currentChamberIndex: 0,
      retaliationActive: false,
      message: "Loading the cylinder...",
      subMessage: `${live} live rounds, ${CYLINDER_SIZE - live} blanks.`,
      shooter: null,
      target: null
    });
    
    if (!initialLoading) {
       // give items
       const diff = stateRef.current.difficulty;
       const p = stateRef.current.player;
       const d = stateRef.current.dealer;
       updateState({
         player: { ...p, items: [...p.items, ...getRandomItemsByDifficulty(2, diff, 'player')].slice(0, 8) },
         dealer: { ...d, items: [...d.items, ...getRandomItemsByDifficulty(2, diff, 'dealer')].slice(0, 8) }
       });
    }

    await wait(1500);
    updateState({
      message: DEADLY_QUOTES[Math.floor(Math.random() * DEADLY_QUOTES.length)],
      subMessage: "Your turn.",
      gameState: 'PLAYER_TURN'
    });
  };

  const startGame = async (difficulty: Difficulty = 'NORMAL', nextRound = false) => {
    playStartAudio();
    startAmbientDrone();
    
    let pHealth = 100, pItems = 3, dHealth = 100, dItems = 3;
    switch(difficulty) {
      case 'NORMAL': pHealth = 100; pItems = 3; dHealth = 100; dItems = 3; break;
      case 'HARD': pHealth = 75; pItems = 2; dHealth = 125; dItems = 4; break;
      case 'VERY_HARD': pHealth = 50; pItems = 1; dHealth = 150; dItems = 5; break;
      case 'NIGHTMARE': pHealth = 30; pItems = 0; dHealth = 200; dItems = 6; break;
    }

    // Auto-detect if we are advancing to next round from a win (where dealer was defeated but player survived)
    // to safeguard gamepad inputs or simple clicks from losing their shop items or previous inventory.
    const isNextRound = nextRound || (stateRef.current.gameState === 'GAME_OVER' && stateRef.current.player.health > 0);
    const currentItems = isNextRound 
      ? stateRef.current.player.items 
      : getRandomItemsByDifficulty(pItems, difficulty, 'player');

    updateState({
      difficulty,
      player: { health: pHealth, maxHealth: pHealth, items: currentItems },
      dealer: { health: dHealth, maxHealth: dHealth, items: getRandomItemsByDifficulty(dItems, difficulty, 'dealer') },
      bloodLevel: 0,
      roundsSurvived: isNextRound ? stateRef.current.roundsSurvived : 0,
      bloodCurrency: isNextRound ? stateRef.current.bloodCurrency : 0,
      turnSequence: 0,
      doubleDamageActive: null,
      retaliationActive: false,
      playerDamageReductionEnd: null,
      dealerDamageReductionEnd: null,
      shooter: null,
      target: null
    });
    await startRound(true);
  };

  const checkRoundOver = async () => {
    const s = stateRef.current;
    if (s.player.health <= 0 || s.dealer.health <= 0) {
      const isPlayerWin = s.player.health > 0 && s.dealer.health <= 0;
      updateState({
        gameState: 'GAME_OVER',
        roundsSurvived: isPlayerWin ? s.roundsSurvived + 1 : s.roundsSurvived,
        message: s.player.health <= 0 ? "" : "The Dealer has been banished.",
        subMessage: ""
      });
      return true;
    }
    
    if (s.chambers.every(c => c.isSpent)) {
      updateState({
        gameState: 'ROUND_OVER',
        message: "Empty.",
        subMessage: "All chambers spent. Loading next round."
      });
      await wait(1200);
      await startRound();
      return true;
    }
    return false;
  };

  const advanceChamber = () => {
    updateState({
      currentChamberIndex: (stateRef.current.currentChamberIndex + 1) % CYLINDER_SIZE
    });
  };

  const passTurn = (currentTurn: 'player' | 'dealer') => {
    dealerItemsUsedThisTurnRef.current = 0;
    if (currentTurn === 'player') {
      updateState({ gameState: 'DEALER_TURN', message: "The Dealer's turn." });
    } else {
      updateState({ gameState: 'PLAYER_TURN', message: "Your turn." });
    }
  };

  const fireGun = async (target: 'player' | 'dealer', shooter: 'player' | 'dealer') => {
    updateState({ 
      gameState: 'SHOOTING',
      shooter,
      target
    });
    const s = stateRef.current;
    const chamber = s.chambers[s.currentChamberIndex];

    if (shooter === 'dealer') {
      updateState({ retaliationActive: false });
    }

    updateState({
      message: "",
      subMessage: ""
    });
    
    await wait(1500);

    // Mark spent after the trigger pull delay when the round is actually fired
    const updatedState = stateRef.current;
    const newChambers = [...updatedState.chambers];
    newChambers[updatedState.currentChamberIndex] = { ...chamber, isSpent: true };
    updateState({ chambers: newChambers });

    if (chamber.isLive) {
      playGunshot();
      vibrateGamepad(target === 'player' ? 'strong' : 'burst');
      setTimeout(playBloodSplatter, 150);
      updateState({ message: "", bloodLevel: 100 });
      
      let damage = target === shooter ? (DAMAGE_PER_SHOT * 2) : DAMAGE_PER_SHOT; // Severe consequence for shooting self
      
      if (updatedState.doubleDamageActive === shooter) {
          damage *= 2;
          updateState({ doubleDamageActive: null }); // clear buff
      }
      
      let damageReduction = 0;
      if (target === 'player' && updatedState.playerDamageReductionEnd && Date.now() < updatedState.playerDamageReductionEnd) {
          damageReduction = 30;
      } else if (target === 'dealer' && updatedState.dealerDamageReductionEnd && Date.now() < updatedState.dealerDamageReductionEnd) {
          damageReduction = 30;
      }
      
      damage = Math.max(0, damage - damageReduction);

      if (target === 'player') {
        const p = updatedState.player;
        updateState({ player: { ...p, health: Math.max(0, p.health - damage) } });
      } else {
        const d = updatedState.dealer;
        updateState({ 
            dealer: { ...d, health: Math.max(0, d.health - damage) },
            bloodCurrency: shooter === 'player' ? updatedState.bloodCurrency + 25 : updatedState.bloodCurrency 
        });
      }
      
      setTimeout(() => updateState({ bloodLevel: 0 }), 500);
      
      const isDeadlyToPlayer = target === 'player' && updatedState.player.health <= 0;
      await wait(isDeadlyToPlayer ? 300 : 1200);
      
      advanceChamber();
      if (await checkRoundOver()) return;
      
      passTurn(shooter);
    } else {
      playEmptyClick();
      vibrateGamepad('weak');

      if (shooter === 'player' && target === 'dealer') {
        updateState({
          retaliationActive: true,
          message: "",
          subMessage: ""
        });
      } else {
        updateState({ message: "", subMessage: "" });
      }

      await wait(1000);
      
      advanceChamber();
      if (await checkRoundOver()) return;
      
      if (target === shooter) {
        updateState({
          gameState: shooter === 'player' ? 'PLAYER_TURN' : 'DEALER_TURN',
          message: `${shooter === 'player' ? 'You' : 'The Dealer'} go again.`,
          subMessage: "Shoot."
        });
      } else {
        passTurn(shooter);
      }
    }
  };

  const useItem = async (itemIndex: number, user: 'player' | 'dealer') => {
    updateState({ gameState: 'ITEM_USE' });
    playItemSound();
    
    const s = stateRef.current;
    const currentState = user === 'player' ? s.player : s.dealer;
    const item = currentState.items[itemIndex];
    
    // remove item
    const newItems = [...currentState.items];
    newItems.splice(itemIndex, 1);
    
    if (user === 'player') {
      updateState({ player: { ...s.player, items: newItems } });
    } else {
       dealerItemsUsedThisTurnRef.current += 1;
       updateState({ dealer: { ...s.dealer, items: newItems } });
    }

    updateState({
        message: `${user === 'player' ? 'You' : 'The Dealer'} used ${item}.`,
        subMessage: ""
    });
    
    await wait(1000);
    
    const s2 = stateRef.current;
    const chamber = s2.chambers[s2.currentChamberIndex];
    
    let waitTime = 2200;
    
    switch (item) {
      case 'MIRROR':
        if (user === 'player') {
            updateState({ subMessage: chamber.isLive ? "You see a live round inside." : "You see an empty chamber." });
        } else {
            updateState({ subMessage: "The Dealer inspects the chamber." });
        }
        break;
      case 'PLIERS':
        const newChambers = [...s2.chambers];
        newChambers[s2.currentChamberIndex] = { ...chamber, isSpent: true };
        updateState({ chambers: newChambers });
        advanceChamber();
        updateState({ subMessage: `Shell ejected. It was a ${chamber.isLive ? 'live round' : 'blank'}.` });
        
        // Bleed a bit
        if (user === 'player') {
             updateState({ player: { ...s2.player, health: Math.max(1, s2.player.health - 5) } });
        } else {
             updateState({ dealer: { ...s2.dealer, health: Math.max(1, s2.dealer.health - 5) } });
        }
        break;
      case 'WHISKEY':
        if (user === 'player') {
             updateState({ player: { ...s2.player, health: Math.min(s2.player.maxHealth, s2.player.health + 20) } });
        } else {
             updateState({ dealer: { ...s2.dealer, health: Math.min(s2.dealer.maxHealth, s2.dealer.health + 20) } });
        }
        updateState({ subMessage: "Pain numbed. Vitality restored." });
        break;
      case 'TOURNIQUET':
         if (user === 'player') {
             updateState({ player: { ...s2.player, maxHealth: s2.player.maxHealth + 1 } });
         } else {
             updateState({ dealer: { ...s2.dealer, maxHealth: s2.dealer.maxHealth + 1 } });
         }
         updateState({ subMessage: "Braced for impact. Adrenaline surges." });
         break;
      case 'PENTAGRAM':
         updateState({ 
             player: { ...s2.player, health: s2.dealer.health },
             dealer: { ...s2.dealer, health: s2.player.health },
             subMessage: "Dark bargain struck. Life essence swapped."
         });
         break;
      case 'CIGARETTE':
         const reductionEnd = Date.now() + 20000;
         if (user === 'player') {
             updateState({ playerDamageReductionEnd: reductionEnd, subMessage: "You light a cigarette. Nerves steady as smoke fills your lungs." });
         } else {
             updateState({ dealerDamageReductionEnd: reductionEnd, subMessage: "The Dealer lights a cigarette and inhales a deep drag." });
         }
         waitTime = 3200;
         break;
      case 'SCALPEL':
         updateState({ doubleDamageActive: user, subMessage: "The barrel is sawn off. Double damage next shot." });
         waitTime = 3800;
         break;
      case 'DEFIBRILLATOR':
         if (user === 'player') {
             updateState({ player: { ...s2.player, health: Math.min(s2.player.maxHealth - 10, s2.player.health + 40), maxHealth: Math.max(10, s2.player.maxHealth - 10) } });
         } else {
             updateState({ dealer: { ...s2.dealer, health: Math.min(s2.dealer.maxHealth - 10, s2.dealer.health + 40), maxHealth: Math.max(10, s2.dealer.maxHealth - 10) } });
         }
         updateState({ subMessage: "A violent jolt. Vitality restored, but max health is permanently reduced." });
         break;
      case 'MEDKIT':
         if (user === 'player') {
             updateState({ player: { ...s2.player, health: s2.player.maxHealth } });
         } else {
             updateState({ dealer: { ...s2.dealer, health: s2.dealer.maxHealth } });
         }
         updateState({ subMessage: "Critical wounds patched. Fully restored." });
         break;
      case 'SYRINGE':
         if (user === 'player') {
             updateState({ player: { ...s2.player, health: Math.min(s2.player.maxHealth, s2.player.health + 50) } });
         } else {
             updateState({ dealer: { ...s2.dealer, health: Math.min(s2.dealer.maxHealth, s2.dealer.health + 50) } });
         }
         updateState({ subMessage: "Instant surge. 50 HP restored." });
         break;
      case 'RAZORBLADE':
         let newHealth = user === 'player' ? s2.player.health - 10 : s2.dealer.health - 10;
         newHealth = Math.max(1, newHealth); // Prevent absolute death strictly during item use
         
         if (user === 'player') {
             // 180 bloodLevel to trigger both max opacity flash and the shake.
             updateState({ player: { ...s2.player, health: newHealth }, bloodLevel: 180, subMessage: "Slashing flesh with the razorblade..." });
             vibrateGamepad('jolt', { duration: 400 });
         } else {
             updateState({ dealer: { ...s2.dealer, health: newHealth }, subMessage: "Slashing flesh with the razorblade..." });
         }
         
         const bladeChambers = [...s2.chambers];
         const rChamber = bladeChambers[s2.currentChamberIndex];
         
         // Triple visceral sound playback for maximum effect
         setTimeout(() => { playBloodSplatter(); if (user === 'player') vibrateGamepad('burst'); }, 50);
         setTimeout(() => { playEmptyClick(); if (user === 'player') vibrateGamepad('click'); }, 150);
         setTimeout(() => { playBloodSplatter(); if (user === 'player') vibrateGamepad('strong'); }, 250);
         
         await wait(1000);
         
         if (rChamber.isLive) {
             updateState({ doubleDamageActive: user, subMessage: "The chamber was already live. Double damage active." });
         } else {
             bladeChambers[s2.currentChamberIndex] = { ...rChamber, isLive: true };
             updateState({ chambers: bladeChambers, subMessage: "Blood seals the blank. It's now a live round." });
         }
         setTimeout(() => updateState({ bloodLevel: 0 }), 1500);
         break;
    }
    
    await wait(waitTime);
    updateState({ 
        gameState: user === 'player' ? 'PLAYER_TURN' : 'DEALER_TURN',
        message: `${user === 'player' ? 'Your' : "The Dealer's"} turn continues.`,
        subMessage: ""
    });
  };

  // Dealer AI effect trigger
  const aiRef = useRef(false);
  
  useEffect(() => {
    if (state.gameState === 'DEALER_TURN' && !aiRef.current) {
      aiRef.current = true;
      const playDealerTurn = async () => {
        // Double check state isn't changing to stop runaway execution
        const s = stateRef.current;
        if (s.gameState !== 'DEALER_TURN') {
           aiRef.current = false;
           return;
        }

        await wait(1000);
        
        // Re-read authoritative state in case they died etc
        const currentRef = stateRef.current;
        if (currentRef.gameState !== 'DEALER_TURN') {
           aiRef.current = false;
           return;
        }
        
        const myItems = currentRef.dealer.items;
        
        const lCount = currentRef.chambers.filter(c => c.isLive && !c.isSpent).length;
        const bCount = currentRef.chambers.filter(c => !c.isLive && !c.isSpent).length;

        // Display thinking subtitle in HUD
        updateState({ message: "The Dealer is thinking..." });

        // --- MULTI-PROVIDER AI DEALER INTEGRATION ---
        try {
          const activeDifficulty = currentRef.difficulty || 'NORMAL';
          const timeoutMs = activeDifficulty === 'NIGHTMARE' ? 20000 : activeDifficulty === 'VERY_HARD' ? 15000 : activeDifficulty === 'HARD' ? 10000 : 5000;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          const aiSettings = getControllerSettings();

          const apiRes = await fetch('/api/ai-dealer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: aiSettings.aiProvider || 'gemini',
              apiKey: aiSettings.aiApiKey || '',
              customModel: aiSettings.aiCustomModel || '',
              difficulty: activeDifficulty,
              dealer: currentRef.dealer,
              player: currentRef.player,
              liveCount: lCount,
              blankCount: bCount,
              retaliationActive: currentRef.retaliationActive,
              doubleDamageActive: currentRef.doubleDamageActive,
              dealerDamageReductionEnd: currentRef.dealerDamageReductionEnd,
              playerDamageReductionEnd: currentRef.playerDamageReductionEnd,
              itemsUsedThisTurn: dealerItemsUsedThisTurnRef.current
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (apiRes.ok) {
            const decision = await apiRes.json();
            if (stateRef.current.gameState === 'DEALER_TURN') {
              if (decision.action === 'USE_ITEM' && typeof decision.itemIndex === 'number' && decision.itemIndex >= 0 && decision.itemIndex < myItems.length) {
                console.log(`[AI Dealer (${aiSettings.aiProvider || 'gemini'})]`, decision.reasoning);
                aiRef.current = false;
                useItem(decision.itemIndex, 'dealer');
                return;
              } else if (decision.action === 'SHOOT' && (decision.target === 'player' || decision.target === 'dealer')) {
                console.log(`[AI Dealer (${aiSettings.aiProvider || 'gemini'})]`, decision.reasoning);
                aiRef.current = false;
                fireGun(decision.target, 'dealer');
                return;
              }
            }
          }
        } catch (err) {
          console.log("[AI Dealer Fallback to Local Engine]", err);
        }

        // --- FALLBACK HEURISTIC DEALER LOGIC ---
        const totalCount = lCount + bCount;
        let liveChance = totalCount > 0 ? lCount / totalCount : 0.5;

        // On NORMAL difficulty, tone down aggressive shooting odds to make fallback fair
        if ((currentRef.difficulty || 'NORMAL') === 'NORMAL') {
          if (liveChance <= 0.5) {
            liveChance *= 0.7; // Lower likelihood of attacking player on a 50/50 or low live chance
          }
        }

        // --- DETERMINE DEALER PERSONALITY ---
        const dealerHPPct = currentRef.dealer.health / currentRef.dealer.maxHealth;
        const playerHPPct = currentRef.player.health / currentRef.player.maxHealth;

        let personality: 'NORMAL' | 'DESPERATE' | 'ARROGANT' = 'NORMAL';
        if (dealerHPPct <= 0.35) {
           personality = 'DESPERATE';
        } else if (dealerHPPct >= 0.6 && playerHPPct <= 0.4) {
           personality = 'ARROGANT';
        }

        // Dynamic, intelligent AI item use logic - CONSERVE ITEMS STRATEGICALLY
        let selectedItemIndex = -1;
        const itemsUsedCount = dealerItemsUsedThisTurnRef.current;
        const difficultyLevel = currentRef.difficulty || 'NORMAL';

        // Enforce strict parsimony: if 1+ items used this turn or on NORMAL difficulty, avoid spamming items
        const skipItemChance = itemsUsedCount >= 1 ? 0.95 : (difficultyLevel === 'NORMAL' ? 0.70 : 0.35);
        const shouldAttemptItem = Math.random() >= skipItemChance;

        if (shouldAttemptItem) {
          // Randomize the order we check items to prevent always using items in the exact same priority order
          const itemIndices = myItems.map((_, i) => i).sort(() => Math.random() - 0.5);

          for (const i of itemIndices) {
             const item = myItems[i];
             let wantToUse = false;
             
             if (item === 'MEDKIT' && currentRef.dealer.health <= currentRef.dealer.maxHealth - 40) {
                 wantToUse = true;
             } else if (item === 'SYRINGE' && currentRef.dealer.health <= currentRef.dealer.maxHealth - 50) {
                 wantToUse = true;
             } else if (item === 'WHISKEY' && currentRef.dealer.health <= currentRef.dealer.maxHealth - 25) {
                 wantToUse = true;
             } else if (item === 'DEFIBRILLATOR' && currentRef.dealer.health <= 40) {
                 wantToUse = true;
             } else if (item === 'PENTAGRAM') {
                 const diff = currentRef.player.health - currentRef.dealer.health;
                 if (diff >= 40 && currentRef.dealer.health <= 40) {
                     wantToUse = true;
                 }
             } else if (item === 'CIGARETTE' && !currentRef.dealerDamageReductionEnd) {
                 if (currentRef.dealer.health < 60) wantToUse = true;
             } else if (item === 'SCALPEL' && !currentRef.doubleDamageActive) {
                 if (liveChance >= 0.65) wantToUse = true;
             } else if (item === 'MIRROR') {
                 if (lCount > 0 && bCount > 0 && Math.random() > 0.4) wantToUse = true; 
             } else if (item === 'PLIERS') {
                 if (liveChance < 0.35 && bCount > 0) wantToUse = true;
             } else if (item === 'TOURNIQUET') {
                 if (currentRef.dealer.health < 50) wantToUse = true;
             } else if (item === 'RAZORBLADE') {
                 if (currentRef.dealer.health >= 50 && liveChance >= 0.5) wantToUse = true;
             }
             
             if (wantToUse) {
                 selectedItemIndex = i;
                 break; 
             }
          }
        }

        if (selectedItemIndex !== -1) {
             aiRef.current = false;
             useItem(selectedItemIndex, 'dealer'); // sets state to ITEM_USE, breaking this cycle
             return;
        }

        let shootPlayerChance = liveChance;
        
        // Apply retaliation modifier: override optimal math with visceral retaliation
        if (currentRef.retaliationActive && lCount > 0) {
          shootPlayerChance = Math.min(1.0, shootPlayerChance + (personality === 'ARROGANT' ? 0.6 : 0.4)); // Arrogant extra salty
        }

        // To prevent feeling mechanical/omniscient, we deliberately blur the AI's "perfect counting"
        if (lCount === 0 && bCount > 0) {
            // Even if mathematically all blanks remain, occasionally shoot the player to "mess with them", sacrificing a free turn for psychological intimidation.
            shootPlayerChance = personality === 'ARROGANT' ? 0.4 : 0.25; 
        } else if (bCount === 0 && lCount > 0) {
            // A sliver of arrogance or madness
            shootPlayerChance = personality === 'DESPERATE' ? 1.0 : 0.95; 
        }

        if (personality === 'ARROGANT') {
            shootPlayerChance -= 0.15; // Arrogant shoots himself a bit more often to show off
        } else if (personality === 'DESPERATE') {
            shootPlayerChance += 0.25; // Desperate shoots player almost always to avoid self damage
        }

        let shootTarget: 'player' | 'dealer' = Math.random() < Math.max(0.0, Math.min(1.0, shootPlayerChance)) ? 'player' : 'dealer';
        
        // Never shoot self if health is critical and it's a guess (Unless they are arrogant, maybe they risk it? No, keep the core logic)
        if (shootTarget === 'dealer' && currentRef.dealer.health <= DAMAGE_PER_SHOT * 2 && lCount > 0) {
            shootTarget = 'player'; // Too risky to shoot self
        }

        aiRef.current = false;
        // Use fireGun internally, which handles the next state changes
        fireGun(shootTarget, 'dealer');
      };
      
      playDealerTurn();
    }
  }, [state.gameState, state.turnSequence]); // Trigger on every state update while dealer turn matches

  const buyItem = (itemType: ItemType, cost: number) => {
      if (stateRef.current.bloodCurrency >= cost && stateRef.current.player.items.length < 8) {
          const p = stateRef.current.player;
          updateState({
              bloodCurrency: stateRef.current.bloodCurrency - cost,
              player: { ...p, items: [...p.items, itemType] }
          });
      }
  };

  return {
    ...state,
    liveCount,
    blankCount,
    startGame,
    fireGun,
    useItem,
    buyItem
  };
};
