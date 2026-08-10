import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WebGPURenderer, RenderPipeline } from 'three/webgpu';
import { pass } from 'three/tsl';
import { fsr1 } from 'three/examples/jsm/tsl/display/FSR1Node.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { motion } from 'motion/react';
import { GameState, Chamber, PlayerState, ItemType } from '../types';
import { playBulletLoad, playPurchaseSound, playSyringeCap, playSyringeSlam, playThumpSound, playTapSound } from '../audio';
import { getControllerSettings } from '../controller';
import { createWebGPURenderer, isWebGPUSupported } from '../renderers/RendererManager';
import { updateGamepads, vibrateGamepad } from '../controller';
import { AlertCircle, Terminal, Cpu, RefreshCw } from 'lucide-react';

interface Arena3DProps {
  gameState: GameState;
  chambers: Chamber[];
  currentChamberIndex: number;
  player: PlayerState;
  dealer: PlayerState;
  message: string;
  subMessage: string;
  bloodLevel: number;
  doubleDamageActive: 'player' | 'dealer' | null;
  retaliationActive: boolean;
  selectedItemIndex: number;
  bloodCurrency: number;
  showControls: boolean;
  useItem: (index: number, target: 'player' | 'dealer') => void;
  fireGun: (target: 'player' | 'dealer', sender: 'player' | 'dealer') => void;
  buyItem: (type: ItemType, cost: number) => void;
  playerDamageReductionEnd: number | null;
  dealerDamageReductionEnd: number | null;
}

const ITEM_DESCS: Record<string, string> = {
  MIRROR: 'PEEK AT THE CURRENT CYLINDER CHAMBER IN THE REVOLVER.',
  PLIERS: 'DISCHARGE THE NEXT ROUND SAFELY OUTSIDE THE CYLINDER.',
  WHISKEY: 'RESTORES A PORTION OF YOUR HEALTH AT THE EXPENSE OF TEMPORARY BLURRY SENSES.',
  TOURNIQUET: 'BLOOD TRANSFUSION INSULATION. BUFFER HARMFUL BLOWS AND NEXT INCOMING PROJECTILES.',
  PENTAGRAM: 'BLOOD SACRIFICE. RELOADS REVOLVER CYLINDER DIRECTLY WITH A STRENGTHENED BARREL.',
  CIGARETTE: 'NICOTINE DRAG. STEADIES TREMBLING NERVES, BLOCKING 30 HP DAMAGE FOR 20 SECONDS.',
  SCALPEL: 'CUTS THE BARREL TOP. THE NEXT DISCHARGED LIVE SHELL DEALS DOUBLE THE AGONY.',
  DEFIBRILLATOR: 'ELECTRIC RESTART CHARGE. AUTOMATIC RESUSCITATION GUARANTEE IN CASE OF TERMINAL IMPACTS.',
  SYRINGE: 'INSTANT SURGE. DIRECT INJECTION THAT RESTORES 50 HP TO VITALITY.',
  RAZORBLADE: 'SLASH FLESH TO MAGICALLY CONVERT THE CURRENT BLANK INTO A LIVE ROUND AT THE COST OF 10 HP.'
};

export function Arena3D({
  gameState,
  chambers,
  currentChamberIndex,
  player,
  dealer,
  message,
  subMessage,
  bloodLevel,
  doubleDamageActive,
  retaliationActive,
  selectedItemIndex,
  bloodCurrency,
  showControls,
  useItem,
  fireGun,
  buyItem,
  playerDamageReductionEnd,
  dealerDamageReductionEnd,
}: Arena3DProps) {
  const [inputType, setInputType] = useState<'kbm' | 'gamepad'>('kbm');
  const [graphics, setGraphics] = useState({
      antiAliasing: 'smaa',
      postProcessing: 'cinematic',
      shadowQuality: 'high',
      textureFiltering: 8,
      materialEnhancements: true,
      bloomIntensity: 0.4,
      dofEnabled: true,
      lensFlaresEnabled: true,
      polygonCount: 'high'
  });

  useEffect(() => {
    // Initial fetch and subscription
    import('../controller').then(({ getControllerSettings, subscribeControllerSettings }) => {
       const initialSettings = getControllerSettings();
       setInputType(initialSettings.inputType || 'kbm');
       setGraphics({
           antiAliasing: initialSettings.antiAliasing || 'smaa',
           postProcessing: initialSettings.postProcessing || 'cinematic',
           shadowQuality: initialSettings.shadowQuality || 'high',
           textureFiltering: initialSettings.textureFiltering || 8,
           materialEnhancements: initialSettings.materialEnhancements !== false,
           bloomIntensity: initialSettings.bloomIntensity ?? 0.4,
           dofEnabled: initialSettings.dofEnabled !== false,
           lensFlaresEnabled: initialSettings.lensFlaresEnabled !== false,
           polygonCount: initialSettings.polygonCount || 'high'
       });
       subscribeControllerSettings(s => {
          setInputType(s.inputType);
          setGraphics({
             antiAliasing: s.antiAliasing || 'smaa',
             postProcessing: s.postProcessing || 'cinematic',
             shadowQuality: s.shadowQuality || 'high',
             textureFiltering: s.textureFiltering || 8,
             materialEnhancements: s.materialEnhancements !== false,
             bloomIntensity: s.bloomIntensity ?? 0.4,
             dofEnabled: s.dofEnabled !== false,
             lensFlaresEnabled: s.lensFlaresEnabled !== false,
             polygonCount: s.polygonCount || 'high'
          });
       });
    });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Screnspace overlays refs for performance
  const popupRef = useRef<HTMLDivElement>(null);
  const popupNameRef = useRef<HTMLDivElement>(null);
  const popupDescRef = useRef<HTMLDivElement>(null);

  const [hoveredInfo, setHoveredInfo] = useState<{
    type: string;
    name: string;
    description: string;
    index?: number;
  } | null>(null);

  interface ScreenSplat {
    id: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }

  const [screenSplats, setScreenSplats] = useState<ScreenSplat[]>([]);
  const splatIdCounter = useRef(0);

  const spawnScreenSplat = () => {
    if (getControllerSettings().bloodEffectsEnabled === false) return;

    const id = splatIdCounter.current++;
    const newSplat: ScreenSplat = {
      id,
      x: Math.random() * 80 + 10,
      y: Math.random() * 80 + 10,
      scale: 0.8 + Math.random() * 1.8,
      rotation: Math.random() * 360,
    };
    setScreenSplats(prev => [...prev, newSplat]);
    setTimeout(() => {
      setScreenSplats(prev => prev.filter(s => s.id !== id));
    }, 3800);
  };

  const lastProcessedHealth = useRef({ player: 0, dealer: 0 });

  useEffect(() => {
    if (gameState === 'SHOOTING') {
      const isDamaged = player.health < lastProcessedHealth.current.player || dealer.health < lastProcessedHealth.current.dealer;
      if (isDamaged) {
          // Intense screen splatter
          spawnScreenSplat();
          setTimeout(spawnScreenSplat, 150);
          setTimeout(spawnScreenSplat, 350);
          
          if (dealer.health < lastProcessedHealth.current.dealer) {
            stateRef.current.dealerFlinchTime = Date.now();
          }
      }
    }
    lastProcessedHealth.current = { player: player.health, dealer: dealer.health };
  }, [player.health, dealer.health, gameState]);

  const isLookingAtShopRef = useRef(false);
  const [debugToggle, setDebugToggle] = useState(0); // Force re-render simple UI
  const [showKeyboardHud, setShowKeyboardHud] = useState(true);
  const [webGpuError, setWebGpuError] = useState<string | null>(null);
  const [isRecheckingWebGpu, setIsRecheckingWebGpu] = useState(false);
  const webGpuErrorRef = useRef<string | null>(null);

  useEffect(() => {
    webGpuErrorRef.current = webGpuError;
  }, [webGpuError]);

  const handleRetryWebGpu = async () => {
    setIsRecheckingWebGpu(true);
    try {
      const check = await isWebGPUSupported();
      if (!check.supported) {
        setWebGpuError(check.reason || 'WebGPU remains disabled or unsupported in this browser environment.');
      } else {
        setWebGpuError(null);
        window.location.reload();
      }
    } catch (e: any) {
      setWebGpuError(e?.message || 'WebGPU re-check failed.');
    } finally {
      setIsRecheckingWebGpu(false);
    }
  };
  const mouseInactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lookYawRef = useRef(0);
  const lookPitchRef = useRef(0);

  // Update refs to track latest props
  const stateRef = useRef({
    gameState,
    chambers,
    currentChamberIndex,
    player,
    dealer,
    message,
    subMessage,
    bloodLevel,
    doubleDamageActive,
    retaliationActive,
    selectedItemIndex,
    bloodCurrency,
    showControls,
    playerDamageReductionEnd,
    dealerDamageReductionEnd,
    lookTargetVec: null as THREE.Vector3 | null,
    camPosVec: null as THREE.Vector3 | null,
    dealerFlinchTime: 0,
    isTouchActive: false,
    graphics,
  });

  useEffect(() => {
    stateRef.current = {
      gameState,
      chambers,
      currentChamberIndex,
      player,
      dealer,
      message,
      subMessage,
      bloodLevel,
      doubleDamageActive,
      retaliationActive,
      selectedItemIndex,
      bloodCurrency,
      showControls,
      playerDamageReductionEnd,
      dealerDamageReductionEnd,
      lookTargetVec: stateRef.current.lookTargetVec,
      camPosVec: stateRef.current.camPosVec,
      dealerFlinchTime: stateRef.current.dealerFlinchTime,
      isTouchActive: stateRef.current.isTouchActive,
      graphics,
    };
  }, [
    gameState,
    chambers,
    currentChamberIndex,
    player,
    dealer,
    message,
    subMessage,
    bloodLevel,
    doubleDamageActive,
    retaliationActive,
    selectedItemIndex,
    bloodCurrency,
    showControls,
    playerDamageReductionEnd,
    dealerDamageReductionEnd,
    graphics,
  ]);

  // Persist animation state across prop updates to prevent double-animations
  const animRef = useRef({
    tickCount: 0,
    time: 0,
    cameraShakeIntensity: 0,
    cameraKickZ: 0,
    cameraKickPitch: 0,
    cameraKickRoll: 0,
    lookTargetY: 0.6,
    deathAnimStartTime: 0,
    loadingAnimStartTime: 0,
    loadedBulletsCount: 0,
    bulletLoadedFlags: [false, false, false, false, false, false],
    localCylinderAngle: 0,
    previousChamberIndex: currentChamberIndex,
    previousGameState: gameState,
    previousChambers: chambers,
    dealerSmileFactor: 0.0,
    dealerMouthOpenFactor: 0.0,
    dealerHeadTiltFactor: 0.0,
    nextBlinkTime: 0,
    blinkStartTime: 0,
    blinkDuration: 0.15,
    isDoubleBlinkPending: false,
    activeItemAnimType: null as ItemType | null,
    hasEjectedPliers: false,
    hasSlammedSyringe: false,
    hasCappedSyringe: false,
    hasSlicedRazor: false,
    hasLitCigarette: false,
    hasExhaledSmoke: false,
    activeItemAnimUser: 'player' as 'player' | 'dealer',
    activeItemAnimStartTime: 0,
    activeItemAnimGroup: null as THREE.Group | null,
    activeShootAnimationState: 'IDLE' as 'IDLE' | 'RAISING' | 'AIM_ALERT' | 'FIRE_RECOIL' | 'CLEAN_UP',
    activeShootStartTime: 0,
    lastAimVibrateTime: 0,
    hasDischarged: false,
    hasCockingSoundPlayed: false,
    isTargetDealer: false,
    animShooter: 'player' as 'player' | 'dealer',
    animTarget: 'player' as 'player' | 'dealer',
    animIsLive: false,
    lastFireTime: 0,
    lastFireIsLive: false,
    hasThumpedPlayerFall: false,
    hasThumpedPlayerTable: false,
    hasThumpedDealerFall: false,
    dealerDeathStartTime: 0,
    smoothMouseX: 0,
    smoothMouseY: 0,
    instantiatedPlayerCount: 0,
    instantiatedDealerCount: 0,
    rebuildRequired: false,
    prevMuzzleWorldPos: null as THREE.Vector3 | null
  });

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // --- MATERIALS (CONSOLIDATED AT TOP) ---
    const rustySteelMat = new THREE.MeshStandardMaterial({
      color: 0x3d302d,
      roughness: 0.92,
      metalness: 0.7,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xb58900,
      metalness: 0.9,
      roughness: 0.2,
    });
    const darkMetalStyle = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
    });
    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0x070707,
      roughness: 0.95,
      flatShading: true,
    });
    const maskLineMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const gunMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1f2426,
      roughness: 0.42,
      metalness: 0.85,
    });
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x472216,
      roughness: 0.75,
    });
    const darkLinerMat = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.9 });
    const liveShellMat = new THREE.MeshStandardMaterial({ color: 0xd91e18, roughness: 0.3 });
    const blankShellMat = new THREE.MeshStandardMaterial({ color: 0x1e8bc3, roughness: 0.3 });
    const hollowShellMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x1a1514,
      roughness: 0.88,
      metalness: 0.12,
    });
    const selfPadMat = new THREE.MeshStandardMaterial({
      color: 0x1f1414,
      roughness: 0.8,
      metalness: 0.7,
    });
    const etchMat = new THREE.MeshBasicMaterial({ color: 0x771111 });
    const scalMat = new THREE.MeshStandardMaterial({
      color: 0xd9e1e2,
      metalness: 0.95,
      roughness: 0.15,
    });
    const defibYMat = new THREE.MeshStandardMaterial({ color: 0xf39c12, roughness: 0.4 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    
    // --- LAYOUT CONSTANTS ---
    const tableLegsGeo = new THREE.BoxGeometry(0.15, 1.2, 0.15);
    const legPositions = [
      [-3.0, -0.3, 1.4],
      [3.0, -0.3, 1.4],
      [-3.0, -0.3, -2.4],
      [3.0, -0.3, -2.4],
    ];

    // --- HELPERS ---
    const createTextTexture = (text: string, bgColor: string, textColor: string, fontSize = 24) => {
      const canvasTextEl = document.createElement('canvas');
      canvasTextEl.width = 256;
      canvasTextEl.height = 128;
      const ctx = canvasTextEl.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 256, 128);
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 246, 118);
        ctx.fillStyle = '#130606';
        ctx.fillRect(10, 10, 236, 108);
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const words = text.split(' ');
        if (words.length > 1) {
          ctx.fillText(words[0], 128, 48);
          ctx.fillText(words[1], 128, 80);
        } else {
          ctx.fillText(text, 128, 64);
        }
      }
      const tex = new THREE.CanvasTexture(canvasTextEl);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      return tex;
    };

    const createZippoMesh = (): THREE.Group => {
      const zippoGroup = new THREE.Group();
      zippoGroup.name = 'zippoGroup';

      // Brushed Chrome & Metal Materials
      const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdcdce5, metalness: 0.95, roughness: 0.18 });
      const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x555560, metalness: 0.88, roughness: 0.35 });
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });

      // Lower Case (Lighter Body)
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.11, 0.042);
      const lighterBody = new THREE.Mesh(bodyGeo, chromeMat);
      lighterBody.position.y = 0.055;
      lighterBody.castShadow = true;
      zippoGroup.add(lighterBody);

      // Bottom stamp plate / brass base accent line
      const baseAccent = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.008, 0.04), brassMat);
      baseAccent.position.y = 0.004;
      zippoGroup.add(baseAccent);

      // Steel Inner Insert
      const insertGeo = new THREE.BoxGeometry(0.074, 0.035, 0.038);
      const insertMesh = new THREE.Mesh(insertGeo, darkSteelMat);
      insertMesh.position.y = 0.12;
      zippoGroup.add(insertMesh);

      // Windproof Chimney (Perforated Guard)
      const chimneyGeo = new THREE.BoxGeometry(0.05, 0.045, 0.032);
      const chimney = new THREE.Mesh(chimneyGeo, darkSteelMat);
      chimney.position.y = 0.145;
      zippoGroup.add(chimney);

      // Air Vents on Chimney sides
      const ventGeo = new THREE.BoxGeometry(0.005, 0.032, 0.024);
      const ventMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.9 });
      const ventLeft = new THREE.Mesh(ventGeo, ventMat);
      ventLeft.position.set(-0.023, 0.145, 0);
      const ventRight = new THREE.Mesh(ventGeo, ventMat);
      ventRight.position.set(0.023, 0.145, 0);
      zippoGroup.add(ventLeft);
      zippoGroup.add(ventRight);

      // Wick inside chimney
      const wickGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.025, 8);
      const wickMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1.0 });
      const wick = new THREE.Mesh(wickGeo, wickMat);
      wick.position.set(-0.008, 0.155, 0);
      zippoGroup.add(wick);

      // Flint Wheel
      const wheelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.016, 16);
      const flintWheel = new THREE.Mesh(wheelGeo, darkSteelMat);
      flintWheel.rotation.z = Math.PI / 2;
      flintWheel.position.set(0.02, 0.152, 0);
      zippoGroup.add(flintWheel);

      // Hinge Knuckle
      const hingeGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.038, 8);
      const hinge = new THREE.Mesh(hingeGeo, chromeMat);
      hinge.rotation.x = Math.PI / 2;
      hinge.position.set(-0.04, 0.11, 0);
      zippoGroup.add(hinge);

      // Real 3D Flame Group
      const flameGroup = new THREE.Group();
      flameGroup.name = 'zippoFlame';
      flameGroup.position.set(-0.008, 0.165, 0);
      flameGroup.visible = false;

      const flameGeo = new THREE.ConeGeometry(0.02, 0.08, 10);
      const flameMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff6600,
        emissiveIntensity: 6.0,
        transparent: true,
        opacity: 0.95
      });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.y = 0.04;
      flameGroup.add(flameMesh);

      const innerFlameGeo = new THREE.ConeGeometry(0.009, 0.04, 10);
      const innerFlameMat = new THREE.MeshStandardMaterial({
        color: 0x66aaff,
        emissive: 0x0088ff,
        emissiveIntensity: 8.0,
        transparent: true,
        opacity: 0.95
      });
      const innerFlameMesh = new THREE.Mesh(innerFlameGeo, innerFlameMat);
      innerFlameMesh.position.y = 0.02;
      flameGroup.add(innerFlameMesh);

      const flameLight = new THREE.PointLight(0xffa500, 2.0, 1.8);
      flameLight.position.y = 0.04;
      flameGroup.add(flameLight);

      zippoGroup.add(flameGroup);

      // Hinged Cap Group
      const capGroup = new THREE.Group();
      capGroup.name = 'zippoCap';
      capGroup.position.set(-0.04, 0.11, 0);
      const capMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 0.042), chromeMat);
      capMesh.position.set(0.04, 0.0275, 0);
      capGroup.add(capMesh);
      zippoGroup.add(capGroup);

      return zippoGroup;
    };

    const createItemMesh = (type: ItemType): THREE.Group => {
      const parent = new THREE.Group();
      switch (type) {
        case 'MIRROR': {
          const fGeo = new THREE.TorusGeometry(0.15, 0.03, 8, 16);
          const fMesh = new THREE.Mesh(fGeo, rustySteelMat);
          fMesh.position.y = 0.25;
          parent.add(fMesh);

          const hGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8);
          const hMesh = new THREE.Mesh(hGeo, rustySteelMat);
          hMesh.position.y = 0.06;
          parent.add(hMesh);

          // Highly reflective silver mirror backing plate
          const silverGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16);
          const silverMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            metalness: 0.98,
            roughness: 0.05,
            envMapIntensity: 2.0,
          });
          const silverMesh = new THREE.Mesh(silverGeo, silverMat);
          silverMesh.rotation.x = Math.PI / 2;
          silverMesh.position.set(0, 0.25, -0.002);
          parent.add(silverMesh);

          // Realistic transparent glass front lens layer
          const glassGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.012, 16);
          const glassMat = new THREE.MeshStandardMaterial({
            color: 0xf0f9ff,
            metalness: 0.1,
            roughness: 0.02,
            transparent: true,
            opacity: 0.35,
          });
          const glassMesh = new THREE.Mesh(glassGeo, glassMat);
          glassMesh.rotation.x = Math.PI / 2;
          glassMesh.position.set(0, 0.25, 0.002);
          parent.add(glassMesh);

          // Glass bevel highlight ring
          const bevelGeo = new THREE.TorusGeometry(0.12, 0.005, 6, 16);
          const bevelMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.2,
            roughness: 0.0,
            transparent: true,
            opacity: 0.6,
          });
          const bevelMesh = new THREE.Mesh(bevelGeo, bevelMat);
          bevelMesh.position.set(0, 0.25, 0.008);
          parent.add(bevelMesh);
          break;
        }
        case 'PLIERS': {
          const plGeo1 = new THREE.BoxGeometry(0.04, 0.44, 0.03);
          const plMesh1 = new THREE.Mesh(plGeo1, rustySteelMat);
          plMesh1.rotation.z = 0.35;
          plMesh1.position.set(-0.06, 0.2, 0);
          const plMesh2 = plMesh1.clone();
          plMesh2.rotation.z = -0.35;
          plMesh2.position.set(0.06, 0.2, 0);
          parent.add(plMesh1);
          parent.add(plMesh2);
          break;
        }
        case 'WHISKEY': {
          const botGeo = new THREE.BoxGeometry(0.16, 0.35, 0.16);
          const glassMat = new THREE.MeshStandardMaterial({
            color: 0x4a2a10,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.55,
          });
          const botMesh = new THREE.Mesh(botGeo, glassMat);
          botMesh.position.y = 0.18;
          botMesh.name = 'whiskeyBottleMesh';
          parent.add(botMesh);

          const liquidGeo = new THREE.BoxGeometry(0.145, 0.31, 0.145);
          const liquidMat = new THREE.MeshStandardMaterial({
            color: 0xd97706,
            roughness: 0.05,
            metalness: 0.1,
            transparent: true,
            opacity: 0.88,
            emissive: 0x331800,
          });
          const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
          liquidMesh.position.y = 0.16;
          liquidMesh.name = 'whiskeyLiquidMesh';
          parent.add(liquidMesh);

          const meniscusGeo = new THREE.PlaneGeometry(0.14, 0.14);
          const meniscusMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            roughness: 0.0,
            metalness: 0.2,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
          });
          const meniscus = new THREE.Mesh(meniscusGeo, meniscusMat);
          meniscus.rotation.x = -Math.PI / 2;
          meniscus.position.y = 0.315;
          meniscus.name = 'whiskeyMeniscus';
          parent.add(meniscus);

          const labelGeo = new THREE.BoxGeometry(0.162, 0.18, 0.005);
          const labelMat = new THREE.MeshStandardMaterial({
            color: 0x241408,
            roughness: 0.6,
          });
          const label = new THREE.Mesh(labelGeo, labelMat);
          label.position.set(0, 0.18, 0.081);
          parent.add(label);

          const neckGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8);
          const neckMesh = new THREE.Mesh(neckGeo, glassMat);
          neckMesh.position.y = 0.4;
          parent.add(neckMesh);

          const corkGeo = new THREE.CylinderGeometry(0.042, 0.038, 0.04, 8);
          const corkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
          const cork = new THREE.Mesh(corkGeo, corkMat);
          cork.position.y = 0.46;
          cork.name = 'whiskeyCork';
          parent.add(cork);
          break;
        }
        case 'TOURNIQUET': {
          const strapGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.15, 6);
          const strapMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
          const strap = new THREE.Mesh(strapGeo, strapMat);
          strap.position.y = 0.08;
          parent.add(strap);
          const buckGeo = new THREE.BoxGeometry(0.25, 0.04, 0.06);
          const buck = new THREE.Mesh(buckGeo, brassMat);
          buck.position.y = 0.18;
          parent.add(buck);
          break;
        }
        case 'PENTAGRAM': {
          const ringGeo = new THREE.TorusGeometry(0.18, 0.018, 4, 12);
          const pRingMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
          const ring = new THREE.Mesh(ringGeo, pRingMat);
          ring.position.y = 0.25;
          parent.add(ring);
          const starPointsGeo = new THREE.ConeGeometry(0.06, 0.22, 3);
          for (let i = 0; i < 5; i++) {
            const starPoint = new THREE.Mesh(starPointsGeo, pRingMat);
            const a = (i / 5) * Math.PI * 2;
            starPoint.position.set(Math.sin(a) * 0.14, 0.25 + Math.cos(a) * 0.14, 0);
            starPoint.rotation.z = -a;
            parent.add(starPoint);
          }
          break;
        }
        case 'CIGARETTE': {
          const cigGroup = new THREE.Group();
          cigGroup.name = 'cigGroupInner';

          // 1. Filterless White Tobacco Paper Tube (Longer to replace filter)
          const paperGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 16);
          const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.7 });
          const paperMesh = new THREE.Mesh(paperGeo, paperMat);
          paperMesh.position.y = 0.125;
          cigGroup.add(paperMesh);

          // 2. Cherry / Ember Tip (Glowing hot orange-red core with dark ash ring)
          const ashGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.02, 16);
          const ashMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1.0 });
          const ashMesh = new THREE.Mesh(ashGeo, ashMat);
          ashMesh.position.y = 0.26;
          cigGroup.add(ashMesh);

          const emberGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16);
          const emberMat = new THREE.MeshStandardMaterial({
            color: 0xff3300,
            emissive: 0xff4400,
            emissiveIntensity: 2.0,
            roughness: 0.3
          });
          const emberMesh = new THREE.Mesh(emberGeo, emberMat);
          emberMesh.name = 'emberTip';
          emberMesh.position.y = 0.27;
          cigGroup.add(emberMesh);

          // 3. Classic Branded Cigarette Pack on shelf
          const packGroup = new THREE.Group();
          packGroup.name = 'cigPack';
          packGroup.position.set(-0.08, 0, 0);
          const packBoxGeo = new THREE.BoxGeometry(0.08, 0.14, 0.04);
          const packMat = new THREE.MeshStandardMaterial({ color: 0xaa0505, roughness: 0.6 });
          const packMesh = new THREE.Mesh(packBoxGeo, packMat);
          packMesh.position.y = 0.07;
          packGroup.add(packMesh);

          // Gold foil top insert
          const foilGeo = new THREE.BoxGeometry(0.075, 0.02, 0.035);
          const foilMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
          const foilMesh = new THREE.Mesh(foilGeo, foilMat);
          foilMesh.position.y = 0.145;
          packGroup.add(foilMesh);

          cigGroup.add(packGroup);

          cigGroup.rotation.z = Math.PI / 2; // lie flat on shelf
          cigGroup.position.y = 0.02;
          parent.add(cigGroup);
          break;
        }
        case 'SCALPEL': {
          const scalGeo = new THREE.BoxGeometry(0.03, 0.32, 0.02);
          const hMesh = new THREE.Mesh(scalGeo, scalMat);
          hMesh.position.y = 0.16;
          parent.add(hMesh);
          const tipGeo = new THREE.BoxGeometry(0.015, 0.18, 0.01);
          const tipMesh = new THREE.Mesh(tipGeo, scalMat);
          tipMesh.position.set(0.01, 0.4, 0);
          tipMesh.rotation.z = -0.22;
          parent.add(tipMesh);
          break;
        }
        case 'DEFIBRILLATOR': {
          const boxG = new THREE.BoxGeometry(0.12, 0.18, 0.12);
          const box1 = new THREE.Mesh(boxG, defibYMat);
          box1.position.set(-0.08, 0.1, 0);
          box1.castShadow = true;
          const box2 = new THREE.Mesh(boxG, defibYMat);
          box2.position.set(0.08, 0.1, 0);
          box2.castShadow = true;
          parent.add(box1);
          parent.add(box2);
          const wireTGeo = new THREE.BoxGeometry(0.12, 0.03, 0.02);
          const wWire = new THREE.Mesh(wireTGeo, darkSteelMat);
          wWire.position.y = 0.2;
          parent.add(wWire);
          break;
        }
        case 'SYRINGE': {
          const barrelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.35, 12);
          const glassMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeee,
            roughness: 0.05,
            metalness: 0.1,
            transparent: true,
            opacity: 0.5,
          });
          const barrel = new THREE.Mesh(barrelGeo, glassMat);
          barrel.position.y = 0.245;
          barrel.name = 'syringeBarrel';
          parent.add(barrel);

          const fluidGeo = new THREE.CylinderGeometry(0.041, 0.041, 0.22, 12);
          const fluidMat = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x006633,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85,
          });
          const fluid = new THREE.Mesh(fluidGeo, fluidMat);
          fluid.position.y = 0.2;
          fluid.name = 'syringeFluid';
          parent.add(fluid);

          const meniscusGeo = new THREE.CircleGeometry(0.04, 12);
          const meniscusMat = new THREE.MeshStandardMaterial({
            color: 0x33ffbb,
            emissive: 0x11aa66,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
          });
          const meniscus = new THREE.Mesh(meniscusGeo, meniscusMat);
          meniscus.rotation.x = -Math.PI / 2;
          meniscus.position.y = 0.31;
          meniscus.name = 'syringeMeniscus';
          parent.add(meniscus);

          const bubbleGeo = new THREE.SphereGeometry(0.012, 8, 8);
          const bubbleMat = new THREE.MeshStandardMaterial({
            color: 0xaaffdd,
            roughness: 0.1,
            transparent: true,
            opacity: 0.5,
          });
          const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
          bubble.position.set(0.015, 0.28, 0);
          bubble.name = 'syringeBubble';
          parent.add(bubble);

          const plungerGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6);
          const plungerMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
          const plunger = new THREE.Mesh(plungerGeo, plungerMat);
          plunger.position.y = 0.48;
          plunger.name = 'syringePlunger';
          parent.add(plunger);

          const stopperGeo = new THREE.CylinderGeometry(0.041, 0.041, 0.02, 10);
          const stopperMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
          const stopper = new THREE.Mesh(stopperGeo, stopperMat);
          stopper.position.y = 0.32;
          stopper.name = 'syringeStopper';
          parent.add(stopper);

          const flangeGeo = new THREE.BoxGeometry(0.12, 0.015, 0.045);
          const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
          const flange = new THREE.Mesh(flangeGeo, metalMat);
          flange.position.y = 0.42;
          parent.add(flange);

          const hubGeo = new THREE.CylinderGeometry(0.02, 0.01, 0.05, 8);
          const hub = new THREE.Mesh(hubGeo, metalMat);
          hub.position.y = 0.045;
          parent.add(hub);

          const needleGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4);
          const needle = new THREE.Mesh(needleGeo, metalMat);
          needle.position.y = -0.04;
          parent.add(needle);
          break;
        }
        case 'RAZORBLADE': {
          const bladeGroup = new THREE.Group();
          
          // Main Body (Aged weathered steel with rust patches)
          const bodyGeo = new THREE.BoxGeometry(0.14, 0.003, 0.28);
          const matBody = new THREE.MeshStandardMaterial({ 
            color: 0x3d3838, 
            metalness: 0.92, 
            roughness: 0.4,
          });
          const body = new THREE.Mesh(bodyGeo, matBody);
          bladeGroup.add(body);
          
          // Ultra-sharp silver honed razor bevel edges (Left & Right)
          const bevelGeoLeft = new THREE.BoxGeometry(0.012, 0.002, 0.28);
          const bevelGeoRight = new THREE.BoxGeometry(0.012, 0.002, 0.28);
          const matEdge = new THREE.MeshStandardMaterial({ 
            color: 0xf0f0f5, 
            metalness: 0.98, 
            roughness: 0.1,
          });
          const edgeLeft = new THREE.Mesh(bevelGeoLeft, matEdge);
          edgeLeft.position.x = -0.076;
          bladeGroup.add(edgeLeft);

          const edgeRight = new THREE.Mesh(bevelGeoRight, matEdge);
          edgeRight.position.x = 0.076;
          bladeGroup.add(edgeRight);

          // Dark inner slot cutout (classic safety razor center slot & 3 keyholes)
          const slotGeo = new THREE.BoxGeometry(0.024, 0.006, 0.16);
          const matSlot = new THREE.MeshBasicMaterial({ color: 0x050101 });
          const slot = new THREE.Mesh(slotGeo, matSlot);
          bladeGroup.add(slot);

          // Center round hole keyhole
          const centerHoleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.008, 12);
          const centerHole = new THREE.Mesh(centerHoleGeo, matSlot);
          bladeGroup.add(centerHole);

          // End round holes
          const endHoleTop = new THREE.Mesh(centerHoleGeo, matSlot);
          endHoleTop.position.z = 0.07;
          bladeGroup.add(endHoleTop);

          const endHoleBottom = new THREE.Mesh(centerHoleGeo, matSlot);
          endHoleBottom.position.z = -0.07;
          bladeGroup.add(endHoleBottom);

          // Corner notch cutouts (4 corners of classic razor blade)
          const cornerGeo = new THREE.BoxGeometry(0.025, 0.008, 0.025);
          const corners = [
            [-0.07, 0.13], [0.07, 0.13],
            [-0.07, -0.13], [0.07, -0.13]
          ];
          corners.forEach(([cx, cz]) => {
            const corner = new THREE.Mesh(cornerGeo, matSlot);
            corner.position.set(cx, 0, cz);
            bladeGroup.add(corner);
          });

          // Dried blood encrustations & rust stains along primary cut edge
          const bloodStainGeo = new THREE.BoxGeometry(0.03, 0.004, 0.18);
          const matBloodStain = new THREE.MeshStandardMaterial({
            color: 0x660000,
            roughness: 0.9,
            metalness: 0.1
          });
          const bloodStain = new THREE.Mesh(bloodStainGeo, matBloodStain);
          bloodStain.position.set(-0.06, 0.001, 0.02);
          bladeGroup.add(bloodStain);

          bladeGroup.position.y = 0.05;
          bladeGroup.rotation.y = Math.PI / 4;
          
          parent.add(bladeGroup);
          break;
        }
      }
      parent.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return parent;
    };

    // --- SETUP THREE.JS ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x110808, 0.035);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 3.4, 5.5);
    camera.lookAt(0, 0.5, -1);

    let renderer: any = null;
    let renderPipeline: any = null;
    let scenePass: any = null;

    const initRenderer = async () => {
      setWebGpuError(null);
      webGpuErrorRef.current = null;
      try {
        const check = await isWebGPUSupported();
        if (!check.supported) {
          const errMessage = check.reason || 'WebGPU API (navigator.gpu) is disabled or not supported by your browser.';
          setWebGpuError(errMessage);
          webGpuErrorRef.current = errMessage;
          return;
        }

        const r = await createWebGPURenderer(canvas);

        r.setPixelRatio(window.devicePixelRatio);
        r.setClearColor(0x0c0404);
        if (r.shadowMap) {
          r.shadowMap.enabled = true;
          r.shadowMap.type = THREE.PCFShadowMap;
        }
        renderer = r;

        try {
          scenePass = pass(scene, camera);
          renderPipeline = new RenderPipeline(r);
        } catch (e) {
          console.warn('WebGPU RenderPipeline setup error:', e);
        }

        if (!(r as any).getCurrentViewport) {
          const vp = new THREE.Vector4();
          (r as any).getCurrentViewport = (target?: THREE.Vector4) => {
            const size = new THREE.Vector2();
            if (r.getSize) r.getSize(size);
            const res = target || vp;
            res.set(0, 0, size.x || window.innerWidth, size.y || window.innerHeight);
            return res;
          };
        }
        if (!(r as any).getClearColor) {
          (r as any).getClearColor = (target?: any) => {
            if (target && typeof target.set === 'function') {
              target.set(0x0c0404);
              return target;
            }
            return new THREE.Color(0x0c0404);
          };
        }
        if (!(r as any).getClearAlpha) {
          (r as any).getClearAlpha = () => 1.0;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width && height) {
          r.setSize(width, height);
        }

        if (typeof handleResize === 'function') {
          handleResize();
        }
      } catch (err: any) {
        console.error('WebGPU Renderer initialization failed:', err);
        const errMessage = err?.message || 'WebGPU hardware renderer failed to start.';
        setWebGpuError(errMessage);
        webGpuErrorRef.current = errMessage;
      }
    };
    initRenderer();
    // Track active passes
    let isDesktopHQ = false;

    // --- LIGHTS ---
    const ambientLight = new THREE.AmbientLight(0xffedd8, 0.65); // Warm soft ambient fill
    scene.add(ambientLight);
    
    // Fill light to prevent pitch black areas
    const fillLight = new THREE.HemisphereLight(0x55556a, 0x1a1515, 0.75);
    fillLight.position.set(0, 10, 0);
    scene.add(fillLight);

    // Flashing hanging focus spotlight
    const spotLight = new THREE.SpotLight(0xfff5e6, 25.0, 30, Math.PI / 3, 0.7, 1);
    
    // Anamorphic Lens Flare
    const createAnamorphicFlareTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      
      const gradient = ctx.createLinearGradient(0, 32, 1024, 32);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.3, 'rgba(60, 120, 255, 0.0)');
      gradient.addColorStop(0.45, 'rgba(100, 150, 255, 0.6)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.55, 'rgba(100, 150, 255, 0.6)');
      gradient.addColorStop(0.7, 'rgba(60, 120, 255, 0.05)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 64);
      return new THREE.CanvasTexture(canvas);
    };
    
    const createCircularFlare = () => {
       const canvas = document.createElement('canvas');
       canvas.width = 256; canvas.height = 256;
       const ctx = canvas.getContext('2d')!;
       const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
       gradient.addColorStop(0, 'rgba(255,255,255,1)');
       gradient.addColorStop(0.1, 'rgba(200,220,255,0.8)');
       gradient.addColorStop(1, 'rgba(0,0,0,0)');
       ctx.fillStyle = gradient;
       ctx.fillRect(0, 0, 256, 256);
       return new THREE.CanvasTexture(canvas);
    };

    const anamorphicTexture = createAnamorphicFlareTexture();
    const circularTexture = createCircularFlare();
    const lensflareGroup = new THREE.Group();
    
    // Main anamorphic streak
    const streakMat = new THREE.SpriteMaterial({
      map: anamorphicTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const streakSprite = new THREE.Sprite(streakMat);
    streakSprite.scale.set(16, 0.8, 1);
    lensflareGroup.add(streakSprite);

    // Additional circular artifacts
    const cMat1 = new THREE.SpriteMaterial({
      map: circularTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const cSprite1 = new THREE.Sprite(cMat1);
    cSprite1.scale.set(1.2, 1.2, 1);
    cSprite1.position.set(0, 0, -0.2);
    lensflareGroup.add(cSprite1);

    const cMat2 = new THREE.SpriteMaterial({
      map: circularTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const cSprite2 = new THREE.Sprite(cMat2);
    cSprite2.scale.set(0.8, 0.8, 1);
    cSprite2.position.set(0, 0, -0.5);
    lensflareGroup.add(cSprite2);
    
    spotLight.add(lensflareGroup);

    spotLight.position.set(0, 5, 0);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 512;
    spotLight.shadow.mapSize.height = 512;
    spotLight.shadow.bias = -0.005;
    scene.add(spotLight);

    const spotLightTarget = new THREE.Object3D();
    spotLightTarget.position.set(0, 0, 0);
    scene.add(spotLightTarget);
    spotLight.target = spotLightTarget;

    // Glowing dim red/orange bulb hanging visible in scene
    const wireGeo = new THREE.CylinderGeometry(0.012, 0.012, 2, 4);
    const wireMesh = new THREE.Mesh(wireGeo, darkMetalStyle);
    wireMesh.position.set(0, 6, 0);
    scene.add(wireMesh);

    const bulbGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.4, 6);
    const bulbMesh = new THREE.Mesh(bulbGeo, darkMetalStyle);
    bulbMesh.position.set(0, 4.8, 0);
    scene.add(bulbMesh);

    const bulbGlowGeo = new THREE.SphereGeometry(0.16, 5, 5);
    const bulbGlowMat = new THREE.MeshBasicMaterial({ color: 0xffeaad });
    const bulbGlow = new THREE.Mesh(bulbGlowGeo, bulbGlowMat);
    bulbGlow.position.set(0, 4.4, 0);
    scene.add(bulbGlow);

    // --- ROOM ELEMENTS (THE INDUSTRIAL TABLE) ---
    // Table Top
    const tableTopGeo = new THREE.BoxGeometry(6.5, 0.3, 4.4);
    const tableTop = new THREE.Mesh(tableTopGeo, tableMat);
    tableTop.position.set(0, 0.4, -0.6);
    tableTop.receiveShadow = true;
    tableTop.castShadow = true;
    scene.add(tableTop);

    // Rusty steel industrial frame pillars under table
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(tableLegsGeo, rustySteelMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      scene.add(leg);
    });

    // Dark rustic gritty floor
    const floorGeo = new THREE.PlaneGeometry(35, 35);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x050404,
      roughness: 0.98,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.9;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- THE INTEGRATED 3D SHOP ---
    const shopGroup = new THREE.Group();
    shopGroup.position.set(-15, 0.4, 0); 
    shopGroup.rotation.y = 0; // Front faces toward positive X (toward camera)
    scene.add(shopGroup);

    // Dark Booth Framework
    const boothWallGeo = new THREE.BoxGeometry(0.15, 3.2, 5.5);
    const boothWallMat = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1.0 });
    const backWall = new THREE.Mesh(boothWallGeo, boothWallMat);
    backWall.position.set(-0.9, 1.0, 0); 
    shopGroup.add(backWall);

    const shelfMatToUse = shelfMat; 
    // Industrial Shelves
    const shelfGeo = new THREE.BoxGeometry(1.6, 0.12, 5.0);
    const shelf1 = new THREE.Mesh(shelfGeo, shelfMatToUse);
    shelf1.position.set(0, 0.5, 0);
    shelf1.castShadow = true;
    shelf1.receiveShadow = true;
    shopGroup.add(shelf1);

    const shelf2 = new THREE.Mesh(shelfGeo, shelfMatToUse);
    shelf2.position.set(0, 1.45, 0);
    shelf2.castShadow = true;
    shelf2.receiveShadow = true;
    shopGroup.add(shelf2);

    // Shop Light (dedicated flicker light)
    const shopSpotLight = new THREE.SpotLight(0xfff0dd, 45.0, 25, 0.75, 0.45, 2);
    shopSpotLight.position.set(1.5, 4.0, 0);
    shopSpotLight.target.position.set(0, 1, 0);
    shopGroup.add(shopSpotLight);
    shopGroup.add(shopSpotLight.target);

    // Warm ambient point lights for the shop interior
    const shopAmbient = new THREE.PointLight(0xff9944, 25.0, 12);
    shopAmbient.position.set(1.2, 2.0, 0);
    shopGroup.add(shopAmbient);

    const shelfBottomLight = new THREE.PointLight(0xffcc88, 10.0, 8);
    shelfBottomLight.position.set(0.8, 0.4, 0);
    shopGroup.add(shelfBottomLight);

    const shelfTopLight = new THREE.PointLight(0xffcc88, 10.0, 8);
    shelfTopLight.position.set(0.8, 1.3, 0);
    shopGroup.add(shelfTopLight);

    // Fill shop with buyable item meshes
    const shopItemMeshes: THREE.Group[] = [];
    const SHOP_ITEMS: { type: ItemType; cost: number; shelf: number; pos: number }[] = [
      { type: 'MIRROR', cost: 15, shelf: 0, pos: -1.8 },
      { type: 'PLIERS', cost: 20, shelf: 0, pos: -0.9 },
      { type: 'RAZORBLADE', cost: 35, shelf: 0, pos: 0 },
      { type: 'WHISKEY', cost: 25, shelf: 0, pos: 0.9 },
      { type: 'TOURNIQUET', cost: 30, shelf: 0, pos: 1.8 },
      { type: 'PENTAGRAM', cost: 50, shelf: 1, pos: -1.8 },
      { type: 'CIGARETTE', cost: 25, shelf: 1, pos: -0.9 },
      { type: 'SYRINGE', cost: 80, shelf: 1, pos: 0 },
      { type: 'SCALPEL', cost: 35, shelf: 1, pos: 0.9 },
      { type: 'DEFIBRILLATOR', cost: 60, shelf: 1, pos: 1.8 },
    ];

    const tagGeo = new THREE.PlaneGeometry(0.35, 0.18);

    SHOP_ITEMS.forEach(itemInfo => {
      const itemMesh = createItemMesh(itemInfo.type);
      const shelfY = itemInfo.shelf === 0 ? 0.55 : 1.5;
      itemMesh.position.set(0, shelfY, itemInfo.pos);
      itemMesh.scale.set(1.5, 1.5, 1.5); 
      itemMesh.rotation.y = 0; // Face the camera (+X)
      itemMesh.userData = { isShopItem: true, type: itemInfo.type, cost: itemInfo.cost };
      
      // Price tag - angled physical label
      const tagTexture = createTextTexture(`${itemInfo.cost}B`, '#0a0a0a', '#00ff44');
      const tagMat = new THREE.MeshBasicMaterial({ 
        map: tagTexture, 
        transparent: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });
      const tag = new THREE.Mesh(tagGeo, tagMat);
      
      // Placed on the edge of the shelf depth (X)
      tag.position.set(0.81, shelfY - 0.1, itemInfo.pos);
      tag.rotation.y = 0; 
      tag.rotation.z = -0.15 + (Math.random() * 0.3); 
      shopGroup.add(tag);

      shopGroup.add(itemMesh);
      shopItemMeshes.push(itemMesh);
    });

    // --- THE HOODED DEALER ---
    const dealerGroup = new THREE.Group();
    dealerGroup.position.set(0, -0.4, -3.2); // sitting on chair behind table
    scene.add(dealerGroup);

    // Dealer's Chair
    const chairGroup = new THREE.Group();
    chairGroup.name = "dealerChairGroup";
    chairGroup.position.set(0, -1.2, -3.2); // On the floor
    scene.add(chairGroup);
    
    // Chair legs
    const chairLegGeo = new THREE.BoxGeometry(0.08, 0.8, 0.08);
    const chairLegMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.8 });
    [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].forEach(([cx, cz]) => {
      const cleg = new THREE.Mesh(chairLegGeo, chairLegMat);
      cleg.position.set(cx, 0.4, cz);
      cleg.castShadow = true;
      chairGroup.add(cleg);
    });

    // Chair seat
    const seatGeo = new THREE.BoxGeometry(1.0, 0.1, 0.8);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x221111, roughness: 0.8 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.85, 0);
    seat.castShadow = true;
    chairGroup.add(seat);

    // Chair backrest
    const backGeo = new THREE.BoxGeometry(1.0, 1.0, 0.1);
    const backrest = new THREE.Mesh(backGeo, seatMat);
    backrest.position.set(0, 1.35, -0.35);
    backrest.castShadow = true;
    chairGroup.add(backrest);

    const polyCount = getControllerSettings().polygonCount || 'high';
    const isUltra = polyCount === 'ultra';
    const isHigh = polyCount === 'high';
    const isMed = polyCount === 'medium';
    
    const cloakSegments = isUltra ? 32 : (isHigh ? 16 : (isMed ? 8 : 6));
    const cloakGeo = new THREE.CylinderGeometry(0.1, 0.9, 1.8, cloakSegments, 1, false);
    const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
    cloakMesh.position.set(0, 1.5, 0);
    cloakMesh.scale.set(1.0, 1.55, 1.0); // Make cloak taller to reach the raised head
    cloakMesh.castShadow = true;
    dealerGroup.add(cloakMesh);

    // Hood Structure (Square/Box-like hood framing the dark face void)
    const hoodGeo = new THREE.BoxGeometry(0.85, 0.9, 0.75);
    const hoodMesh = new THREE.Mesh(hoodGeo, cloakMat);
    hoodMesh.position.set(0, 2.7, 0.1);
    hoodMesh.castShadow = true;
    dealerGroup.add(hoodMesh);

    // Inside the Dark Face Cavity
    const faceCavityGeo = new THREE.BoxGeometry(0.55, 0.55, 0.2);
    const blackCavityMat = new THREE.MeshBasicMaterial({ color: 0x010000 });
    const faceCavity = new THREE.Mesh(faceCavityGeo, blackCavityMat);
    faceCavity.position.set(0, 2.7, 0.45);
    dealerGroup.add(faceCavity);

    // Glowing red skeletal eyes with sharp faceted low-poly geometry across all settings
    const eyeGeo = new THREE.IcosahedronGeometry(0.052, 0); // Crisp 20-facet low-poly polyhedron
    const leftEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const rightEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const leftEye = new THREE.Mesh(eyeGeo, leftEyeMat);
    leftEye.position.set(-0.16, 2.75, 0.56);
    const rightEye = new THREE.Mesh(eyeGeo, rightEyeMat);
    rightEye.position.set(0.16, 2.75, 0.56);
    dealerGroup.add(leftEye);
    dealerGroup.add(rightEye);

    // Faceted low-poly eye sockets / orbit frames framing the glowing eyes
    const eyeSocketGeo = new THREE.BoxGeometry(0.13, 0.13, 0.04);
    const eyeSocketMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.8 });
    const leftSocket = new THREE.Mesh(eyeSocketGeo, eyeSocketMat);
    leftSocket.position.set(-0.16, 2.75, 0.53);
    const rightSocket = new THREE.Mesh(eyeSocketGeo, eyeSocketMat);
    rightSocket.position.set(0.16, 2.75, 0.53);
    dealerGroup.add(leftSocket);
    dealerGroup.add(rightSocket);

    // Expressive, low-poly angular eyebrows that tilt and furrow dynamically
    const browGeo = new THREE.BoxGeometry(0.14, 0.035, 0.06);
    const browMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.5 });
    const leftBrow = new THREE.Mesh(browGeo, browMat);
    leftBrow.position.set(-0.16, 2.82, 0.58);
    const rightBrow = new THREE.Mesh(browGeo, browMat);
    rightBrow.position.set(0.16, 2.82, 0.58);
    dealerGroup.add(leftBrow);
    dealerGroup.add(rightBrow);

    // Multi-segmented articulate mask line & mouth structure
    const dealerMouthGroup = new THREE.Group();
    dealerMouthGroup.position.set(0, 2.52, 0.56);
    dealerGroup.add(dealerMouthGroup);

    const mouthCenterGeo = new THREE.BoxGeometry(0.12, 0.028, 0.05);
    const mouthSideMidGeo = new THREE.BoxGeometry(0.08, 0.024, 0.04);
    const mouthSideCornerGeo = new THREE.BoxGeometry(0.06, 0.022, 0.04);

    const mouthCenter = new THREE.Mesh(mouthCenterGeo, maskLineMat);
    mouthCenter.position.set(0, 0, 0);
    dealerMouthGroup.add(mouthCenter);

    const mouthLeftMid = new THREE.Mesh(mouthSideMidGeo, maskLineMat);
    mouthLeftMid.position.set(-0.08, 0, 0);
    dealerMouthGroup.add(mouthLeftMid);

    const mouthLeftCorner = new THREE.Mesh(mouthSideCornerGeo, maskLineMat);
    mouthLeftCorner.position.set(-0.14, 0, 0);
    dealerMouthGroup.add(mouthLeftCorner);

    const mouthLeft = mouthLeftCorner; // compatibility

    const mouthRightMid = new THREE.Mesh(mouthSideMidGeo, maskLineMat);
    mouthRightMid.position.set(0.08, 0, 0);
    dealerMouthGroup.add(mouthRightMid);

    const mouthRightCorner = new THREE.Mesh(mouthSideCornerGeo, maskLineMat);
    mouthRightCorner.position.set(0.14, 0, 0);
    dealerMouthGroup.add(mouthRightCorner);

    const mouthRight = mouthRightCorner; // compatibility

    // --- CYLINDER MONITOR (The big revolving visual indicator) ---
    const cylinderUIGroup = new THREE.Group();
    cylinderUIGroup.position.set(-2.0, 0.8, 0.2); // visible left corner
    scene.add(cylinderUIGroup);

    // Heavy iron support stand
    const standGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
    const ironStand = new THREE.Mesh(standGeo, rustySteelMat);
    ironStand.position.set(0, -0.1, 0);
    ironStand.castShadow = true;
    cylinderUIGroup.add(ironStand);

    const revolvingChamberGroup = new THREE.Group();
    revolvingChamberGroup.position.set(0, 0.25, 0);
    cylinderUIGroup.add(revolvingChamberGroup);

    // Core revolving visual indicator drum
    const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 6);
    const drumMat = new THREE.MeshStandardMaterial({
      color: 0x222728,
      roughness: 0.6,
      metalness: 0.8,
    });
    const drumMesh = new THREE.Mesh(drumGeo, drumMat);
    drumMesh.rotation.x = Math.PI / 2;
    drumMesh.castShadow = true;
    revolvingChamberGroup.add(drumMesh);

    // Golden brass rod in core
    const rodGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 5);
    const rodMesh = new THREE.Mesh(rodGeo, brassMat);
    rodMesh.rotation.x = Math.PI / 2;
    revolvingChamberGroup.add(rodMesh);

    // Visual chamber cartridge indicator sockets
    const cartridges: THREE.Mesh[] = [];
    const cartridgeShellGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.32, 5);

    const updateCylinderShells = () => {
      cartridges.forEach((c) => revolvingChamberGroup.remove(c));
      cartridges.length = 0;

      const currentChambers = stateRef.current.chambers;
      for (let i = 0; i < 6; i++) {
        const chamber = currentChambers[i];
        if (!chamber) continue;

        const angle = (i / 6) * Math.PI * 2;
        const radius = 0.27;

        let mat = blankShellMat;
        if (chamber.isSpent) {
          mat = hollowShellMat;
        } else if (chamber.isLive) {
          mat = liveShellMat;
        }

        const cartridge = new THREE.Mesh(cartridgeShellGeo, mat);
        cartridge.position.set(
          Math.sin(angle) * radius,
          Math.cos(angle) * radius,
          0
        );
        cartridge.castShadow = true;
        revolvingChamberGroup.add(cartridge);
        cartridges.push(cartridge);
      }
    };

    updateCylinderShells();

    // Neon Active red arrow shining from above
    const pointerConeGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
    const redGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const activePointer = new THREE.Mesh(pointerConeGeo, redGlowMat);
    activePointer.position.set(0, 0.9, 0);
    activePointer.rotation.z = Math.PI;
    cylinderUIGroup.add(activePointer);


    // --- HIGH-REALISM ADAPTIVE GRAPHICS REVOLVER MODEL ---
    const polySetting = getControllerSettings().polygonCount || 'high';
    const isHighPoly = polySetting === 'high' || polySetting === 'ultra';
    const isUltraPoly = polySetting === 'ultra';

    // Segment resolution scaling according to graphics & polygonCount settings
    const drumSegments = isUltraPoly ? 64 : (isHighPoly ? 32 : 16);
    const barrelSegments = isUltraPoly ? 32 : (isHighPoly ? 24 : 12);
    const torusSegments = isUltraPoly ? 24 : (isHighPoly ? 16 : 8);

    // Enhanced metallic & wood materials for realistic revolver shading
    const polishedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xc0c6ca,
      roughness: 0.18,
      metalness: 0.96,
    });
    const brassAccentMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.25,
      metalness: 0.90,
    });

    const gunGroup = new THREE.Group();
    gunGroup.position.set(0, 0.62, -0.4); // center table rest
    scene.add(gunGroup);

    // Metal Frame: body of the pistol
    const frameGeo = new THREE.BoxGeometry(0.24, 0.38, 0.6);
    const frameMesh = new THREE.Mesh(frameGeo, gunMetalMat);
    frameMesh.position.set(0, 0.12, -0.1);
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    gunGroup.add(frameMesh);

    // Top strap frame rail above cylinder
    const topStrapGeo = new THREE.BoxGeometry(0.20, 0.08, 0.58);
    const topStrapMesh = new THREE.Mesh(topStrapGeo, gunMetalMat);
    topStrapMesh.position.set(0, 0.31, -0.05);
    gunGroup.add(topStrapMesh);

    // Rear sight notch on top strap
    const rearSightGeo = new THREE.BoxGeometry(0.08, 0.04, 0.08);
    const rearSightMesh = new THREE.Mesh(rearSightGeo, polishedSteelMat);
    rearSightMesh.position.set(0, 0.35, -0.32);
    gunGroup.add(rearSightMesh);

    // Cylinder crane / hinge arm connecting frame to cylinder
    const craneGeo = new THREE.BoxGeometry(0.08, 0.12, 0.32);
    const craneMesh = new THREE.Mesh(craneGeo, gunMetalMat);
    craneMesh.position.set(-0.10, 0.08, 0.02);
    gunGroup.add(craneMesh);

    // Pistol wooden rustic grip handle
    const gripGeo = new THREE.BoxGeometry(0.12, 0.45, 0.24);
    const gripMesh = new THREE.Mesh(gripGeo, stockMat);
    gripMesh.position.set(0, -0.15, -0.45);
    gripMesh.rotation.x = -0.35; // angled grip
    gripMesh.castShadow = true;
    gripMesh.receiveShadow = true;
    gunGroup.add(gripMesh);

    // Left & right contoured grip panel overlays
    const leftPanelGeo = new THREE.BoxGeometry(0.025, 0.42, 0.22);
    const leftPanelMesh = new THREE.Mesh(leftPanelGeo, stockMat);
    leftPanelMesh.position.set(0.068, -0.15, -0.45);
    leftPanelMesh.rotation.x = -0.35;
    gunGroup.add(leftPanelMesh);

    const rightPanelMesh = new THREE.Mesh(leftPanelGeo, stockMat);
    rightPanelMesh.position.set(-0.068, -0.15, -0.45);
    rightPanelMesh.rotation.x = -0.35;
    gunGroup.add(rightPanelMesh);

    // Brass medallion emblems embedded in the grip center
    const medallionGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.01, 16);
    medallionGeo.rotateZ(Math.PI / 2);
    const leftMedallion = new THREE.Mesh(medallionGeo, brassAccentMat);
    leftMedallion.position.set(0.082, -0.12, -0.44);
    gunGroup.add(leftMedallion);

    const rightMedallion = new THREE.Mesh(medallionGeo, brassAccentMat);
    rightMedallion.position.set(-0.082, -0.12, -0.44);
    gunGroup.add(rightMedallion);

    // Steel backstrap & grip base cap
    const gripCapGeo = new THREE.BoxGeometry(0.125, 0.03, 0.25);
    const gripCapMesh = new THREE.Mesh(gripCapGeo, gunMetalMat);
    gripCapMesh.position.set(0, -0.35, -0.37);
    gunGroup.add(gripCapMesh);

    // Lanyard swivel ring at grip base
    const lanyardRingGeo = new THREE.TorusGeometry(0.03, 0.008, 8, 16);
    const lanyardRingMesh = new THREE.Mesh(lanyardRingGeo, polishedSteelMat);
    lanyardRingMesh.position.set(0, -0.38, -0.37);
    gunGroup.add(lanyardRingMesh);

    // Revolver Cylinder (Drum) inside the frame - High Poly Cylinder
    const cylDrumGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.38, drumSegments);
    cylDrumGeo.rotateX(Math.PI / 2);
    const revolverCylinderMesh = new THREE.Mesh(cylDrumGeo, gunMetalMat);
    revolverCylinderMesh.position.set(0, 0.12, -0.05);
    revolverCylinderMesh.castShadow = true;
    revolverCylinderMesh.receiveShadow = true;
    gunGroup.add(revolverCylinderMesh);

    // Cylinder flutes (Hollow-like indents for bullet slots)
    const fluteGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.4, isHighPoly ? 12 : 6);
    fluteGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const r = 0.11;
      const flute = new THREE.Mesh(fluteGeo, darkLinerMat);
      flute.position.set(
        Math.sin(angle) * r,
        0.12 + Math.cos(angle) * r,
        -0.05
      );
      gunGroup.add(flute);

      // Recessed brass cartridge rims visible inside cylinder chambers
      const rimGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.02, 16);
      rimGeo.rotateX(Math.PI / 2);
      const brassRim = new THREE.Mesh(rimGeo, brassAccentMat);
      brassRim.position.set(
        Math.sin(angle) * r,
        0.12 + Math.cos(angle) * r,
        -0.24
      );
      gunGroup.add(brassRim);
    }

    // Ejector ratchet star gear on cylinder rear
    const ejectorStarGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12);
    ejectorStarGeo.rotateX(Math.PI / 2);
    const ejectorStarMesh = new THREE.Mesh(ejectorStarGeo, polishedSteelMat);
    ejectorStarMesh.position.set(0, 0.12, -0.25);
    gunGroup.add(ejectorStarMesh);

    // Heavy direct cylinder barrel pointing positive Z (+Z)
    const barrelGeo = new THREE.CylinderGeometry(0.072, 0.065, 0.9, barrelSegments);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, gunMetalMat);
    barrelMesh.position.set(0, 0.18, 0.45);
    barrelMesh.castShadow = true;
    barrelMesh.receiveShadow = true;
    gunGroup.add(barrelMesh);

    // Ventilated Top Rail / Rib along barrel top
    const topRibGeo = new THREE.BoxGeometry(0.06, 0.04, 0.88);
    const topRibMesh = new THREE.Mesh(topRibGeo, gunMetalMat);
    topRibMesh.position.set(0, 0.25, 0.45);
    gunGroup.add(topRibMesh);

    // Full underlug ejector rod shroud underneath barrel
    const underlugGeo = new THREE.BoxGeometry(0.08, 0.09, 0.82);
    const underlugMesh = new THREE.Mesh(underlugGeo, gunMetalMat);
    underlugMesh.position.set(0, 0.09, 0.42);
    gunGroup.add(underlugMesh);

    // Polished steel ejector rod inside underlug
    const ejectorRodGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.48, 12);
    ejectorRodGeo.rotateX(Math.PI / 2);
    const ejectorRodMesh = new THREE.Mesh(ejectorRodGeo, polishedSteelMat);
    ejectorRodMesh.position.set(0, 0.08, 0.28);
    gunGroup.add(ejectorRodMesh);

    // Muzzle hollow bore tip
    const muzzleBoreGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.12, 16);
    muzzleBoreGeo.rotateX(Math.PI / 2);
    const muzzleBoreMesh = new THREE.Mesh(muzzleBoreGeo, darkLinerMat);
    muzzleBoreMesh.position.set(0, 0.18, 0.88);
    gunGroup.add(muzzleBoreMesh);

    // Front sight ramp blade with brass insert
    const frontSightGeo = new THREE.BoxGeometry(0.02, 0.06, 0.12);
    const frontSightMesh = new THREE.Mesh(frontSightGeo, gunMetalMat);
    frontSightMesh.position.set(0, 0.30, 0.85);
    gunGroup.add(frontSightMesh);

    const sightDotGeo = new THREE.BoxGeometry(0.022, 0.02, 0.04);
    const sightDotMesh = new THREE.Mesh(sightDotGeo, brassAccentMat);
    sightDotMesh.position.set(0, 0.32, 0.88);
    gunGroup.add(sightDotMesh);

    // Pistol hammer at back rim with firing pin
    const hammerGeo = new THREE.BoxGeometry(0.05, 0.14, 0.14);
    const hammerMesh = new THREE.Mesh(hammerGeo, polishedSteelMat);
    hammerMesh.position.set(0, 0.30, -0.35);
    hammerMesh.rotation.x = -0.4;
    gunGroup.add(hammerMesh);

    // Curved steel trigger
    const triggerGeo = new THREE.TorusGeometry(0.05, 0.012, 8, 16, Math.PI / 2);
    triggerGeo.rotateY(Math.PI / 2);
    const triggerMesh = new THREE.Mesh(triggerGeo, polishedSteelMat);
    triggerMesh.position.set(0, -0.02, -0.08);
    triggerMesh.rotation.x = 0.3;
    gunGroup.add(triggerMesh);

    // Trigger guard
    const guardGeo = new THREE.TorusGeometry(0.075, 0.018, torusSegments, torusSegments * 2, Math.PI);
    guardGeo.rotateY(Math.PI / 2);
    const guardMesh = new THREE.Mesh(guardGeo, gunMetalMat);
    guardMesh.position.set(0, -0.05, -0.1);
    gunGroup.add(guardMesh);


    // --- 3D INTERACTIVE CONTROL plaques ON TABLE ---

    // Immersive, low-profile embedded player shoot-self pad on the tabletop wood
    const padGeo = new THREE.BoxGeometry(1.0, 0.02, 0.45);
    const playerSelfPad = new THREE.Mesh(padGeo, selfPadMat);
    playerSelfPad.position.set(0, 0.42, 0.95);
    playerSelfPad.castShadow = true;
    playerSelfPad.receiveShadow = true;
    playerSelfPad.userData = { isShootSelfButton: true };
    scene.add(playerSelfPad);

    // Embossed inner plate with deep blood-crimson branding
    const etchGeo = new THREE.BoxGeometry(0.9, 0.005, 0.38);
    const etchPlate = new THREE.Mesh(etchGeo, etchMat);
    etchPlate.position.set(0, 0.012, 0);
    playerSelfPad.add(etchPlate);

    // Tag the dealer recursively so that any direct click on his face, eyes, cloak or hood triggers shootDealer
    dealerGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData = { isShootDealerButton: true };
      }
    });

    // --- THE IMMERSIVE PHYSICAL TV (VITAL SIGNAL MONITORS) ---
    const tvGroup = new THREE.Group();
    tvGroup.position.set(2.4, 1.85, -2.5); // Placed perfectly to the right side of the dealer, fully visible
    tvGroup.rotation.set(0.08, -0.55, 0); // Leaned slightly down and rotated inwards to face the player/camera
    scene.add(tvGroup);

    // Suspended heavy supporting iron pipe extending upward
    const tvPipeGeo = new THREE.CylinderGeometry(0.045, 0.045, 4.0, 8);
    const tvPipeMesh = new THREE.Mesh(tvPipeGeo, rustySteelMat);
    tvPipeMesh.position.set(0, 2.0, 0);
    tvPipeMesh.castShadow = true;
    tvGroup.add(tvPipeMesh);

    // Retro CRT monitor body/chassis
    const tvCaseGeo = new THREE.BoxGeometry(2.3, 1.45, 1.20); // Slightly reduced depth to move front face back to Z=0.60
    const tvCaseMat = new THREE.MeshStandardMaterial({
      color: 0x161514,
      roughness: 0.88,
      metalness: 0.72,
    });
    const tvCase = new THREE.Mesh(tvCaseGeo, tvCaseMat);
    tvCase.castShadow = true;
    tvCase.receiveShadow = true;
    tvGroup.add(tvCase);

    // Protective heavy steel grill bars
    const tvGrillGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4);
    tvGrillGeo.rotateZ(Math.PI / 2);
    
    const tvGrateTop = new THREE.Mesh(tvGrillGeo, rustySteelMat);
    tvGrateTop.position.set(0, 0.65, 0.635);
    tvGrateTop.castShadow = true;
    tvGroup.add(tvGrateTop);

    const tvGrateBottom = new THREE.Mesh(tvGrillGeo, rustySteelMat);
    tvGrateBottom.position.set(0, -0.65, 0.635);
    tvGrateBottom.castShadow = true;
    tvGroup.add(tvGrateBottom);

    // TV Dark glass CRT screen panel
    const tvScreenGeo = new THREE.PlaneGeometry(2.1, 1.25);
    const tvScreenMat = new THREE.MeshStandardMaterial({
      color: 0x050404,
      roughness: 0.18,
      metalness: 0.88,
    });
    const tvScreenMesh = new THREE.Mesh(tvScreenGeo, tvScreenMat);
    tvScreenMesh.position.set(0, 0, 0.605); // Barely above case front (0.600)
    tvGroup.add(tvScreenMesh);

    // Screen vertical split divider
    const tvDividerGeo = new THREE.BoxGeometry(0.015, 1.15, 0.005);
    const tvDividerMat = new THREE.MeshBasicMaterial({ color: 0x130e0e });
    const tvDivider = new THREE.Mesh(tvDividerGeo, tvDividerMat);
    tvDivider.position.set(0, 0, 0.610); // Above screen
    tvGroup.add(tvDivider);

    // Dynamic numeric update routines
    const updateDealerNumericTex = (hp: number, max: number) => {
      const ctx = tvDValueCtx;
      if (!ctx) return;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 128, 64);
      ctx.strokeStyle = '#330000';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, 122, 58);
      ctx.fillStyle = '#180a0a';
      ctx.fillRect(5, 5, 118, 54);
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#ff1111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(hp)}/${Math.round(max)} HP`, 64, 32);
      tvDValueTex.needsUpdate = true;
    };

    const updatePlayerNumericTex = (hp: number, max: number) => {
      const ctx = tvPValueCtx;
      if (!ctx) return;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 128, 64);
      ctx.strokeStyle = '#001122';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, 122, 58);
      ctx.fillStyle = '#0a1018';
      ctx.fillRect(5, 5, 118, 54);
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#00bbff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(hp)}/${Math.round(max)} HP`, 64, 32);
      tvPValueTex.needsUpdate = true;
    };

    // Static Plates with "DEALER" and "YOU" labels
    const tvDLabelTex = createTextTexture("DEALER", "#330000", "#ff0000", 40);
    const tvDLabelMat = new THREE.MeshBasicMaterial({ map: tvDLabelTex, transparent: true, depthWrite: false });
    const tvDLabelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.42), tvDLabelMat);
    tvDLabelPlane.position.set(-0.52, 0.38, 0.615); // Layered to sit cleanly above screen
    tvGroup.add(tvDLabelPlane);

    const tvPLabelTex = createTextTexture("YOU", "#001122", "#00aaff", 46);
    const tvPLabelMat = new THREE.MeshBasicMaterial({ map: tvPLabelTex, transparent: true, depthWrite: false });
    const tvPLabelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.42), tvPLabelMat);
    tvPLabelPlane.position.set(-0.52, -0.22, 0.615);
    tvGroup.add(tvPLabelPlane);

    // Dynamic numeric canvas textures and plates
    const tvDValueCanvas = document.createElement('canvas');
    tvDValueCanvas.width = 128;
    tvDValueCanvas.height = 64;
    const tvDValueCtx = tvDValueCanvas.getContext('2d');
    const tvDValueTex = new THREE.CanvasTexture(tvDValueCanvas);
    tvDValueTex.generateMipmaps = false;
    tvDValueTex.minFilter = THREE.LinearFilter;

    const tvDValueMat = new THREE.MeshBasicMaterial({ map: tvDValueTex, transparent: true, depthWrite: false });
    const tvDValuePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.35), tvDValueMat);
    tvDValuePlane.position.set(0.52, 0.38, 0.615);
    tvGroup.add(tvDValuePlane);

    const tvPValueCanvas = document.createElement('canvas');
    tvPValueCanvas.width = 128;
    tvPValueCanvas.height = 64;
    const tvPValueCtx = tvPValueCanvas.getContext('2d');
    const tvPValueTex = new THREE.CanvasTexture(tvPValueCanvas);
    tvPValueTex.generateMipmaps = false;
    tvPValueTex.minFilter = THREE.LinearFilter;

    const tvPValueMat = new THREE.MeshBasicMaterial({ map: tvPValueTex, transparent: true, depthWrite: false });
    const tvPValuePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.35), tvPValueMat);
    tvPValuePlane.position.set(0.52, -0.22, 0.615);
    tvGroup.add(tvPValuePlane);

    // Initial renders to establish correct textures immediately
    updateDealerNumericTex(stateRef.current.dealer.health, stateRef.current.dealer.maxHealth);
    updatePlayerNumericTex(stateRef.current.player.health, stateRef.current.player.maxHealth);

    // Sub-groove backing plates
    const tvBackingGeo = new THREE.BoxGeometry(1.72, 0.14, 0.002); // Thin flat mesh to prevent overlapping depth
    const tvDBackingMat = new THREE.MeshStandardMaterial({ color: 0x220505, roughness: 0.65 });
    const tvDBack = new THREE.Mesh(tvBackingGeo, tvDBackingMat);
    tvDBack.position.set(0, 0.08, 0.610);
    tvGroup.add(tvDBack);

    const tvPBackingMat = new THREE.MeshStandardMaterial({ color: 0x050d22, roughness: 0.65 });
    const tvPBack = new THREE.Mesh(tvBackingGeo, tvPBackingMat);
    tvPBack.position.set(0, -0.52, 0.610);
    tvGroup.add(tvPBack);

    // Thick glass protection tubes
    const tvGlassTubeGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.70, 8);
    tvGlassTubeGeo.rotateZ(Math.PI / 2);
    const tvGlassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0.95,
    });

    const tvDGlass = new THREE.Mesh(tvGlassTubeGeo, tvGlassMat);
    tvDGlass.position.set(0, 0.08, 0.625);
    tvDGlass.castShadow = true;
    tvGroup.add(tvDGlass);

    const tvPGlass = new THREE.Mesh(tvGlassTubeGeo, tvGlassMat);
    tvPGlass.position.set(0, -0.52, 0.625);
    tvPGlass.castShadow = true;
    tvGroup.add(tvPGlass);

    // Pivot containers scaling cylinders from the left edge (X = -0.85)
    const tvDHealthGroup = new THREE.Group();
    tvDHealthGroup.position.set(-0.85, 0.08, 0.620);
    tvGroup.add(tvDHealthGroup);

    const tvPHealthGroup = new THREE.Group();
    tvPHealthGroup.position.set(-0.85, -0.52, 0.620);
    tvGroup.add(tvPHealthGroup);

    // Emissive cylinders that scale on X axis
    const tvHealthTubeGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.0, 8);
    tvHealthTubeGeo.rotateZ(Math.PI / 2);
    tvHealthTubeGeo.translate(0.5, 0, 0); // Translate so scaling centers around the left-most edge

    const tvDGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff1100,
      emissive: 0xff0000,
      emissiveIntensity: 6.0,
      roughness: 0.1,
    });
    const tvDGlowMesh = new THREE.Mesh(tvHealthTubeGeo, tvDGlowMat);
    tvDGlowMesh.castShadow = true;
    tvDHealthGroup.add(tvDGlowMesh);

    const tvPGlowMat = new THREE.MeshStandardMaterial({
      color: 0x0088ff,
      emissive: 0x0055ff,
      emissiveIntensity: 6.0,
      roughness: 0.1,
    });
    const tvPGlowMesh = new THREE.Mesh(tvHealthTubeGeo, tvPGlowMat);
    tvPGlowMesh.castShadow = true;
    tvPHealthGroup.add(tvPGlowMesh);

    // PointLight casting a live diagnostic floor glow
    const tvGlowLight = new THREE.PointLight(0xff0000, 5.0, 12);
    tvGlowLight.position.set(0, -0.2, 1.3);
    tvGroup.add(tvGlowLight);

    let lastTvPlayerHP = -1;
    let lastTvPlayerMax = -1;
    let lastTvDealerHP = -1;
    let lastTvDealerMax = -1;


    // --- SHARED THREE.JS ASSET POOLS AND RESOURCE PROTECTION SYSTEMS ---
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const unitCircleGeo = new THREE.CircleGeometry(1, 7);
    const unitSmokeSphereGeo = new THREE.SphereGeometry(0.5, 6, 5);
    const unitShellCylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const unitBulletGeo = new THREE.CylinderGeometry(0.35, 0.35, 1, 8);
    const unitPixelSplatGeo = new THREE.BoxGeometry(1, 1, 0.05);

    const sharedBloodMat = new THREE.MeshStandardMaterial({ 
      color: 0x880202, 
      roughness: 0.3, 
      metalness: 0.1,
      flatShading: true
    });
    const sharedDarkBloodMat = new THREE.MeshStandardMaterial({ 
      color: 0x420000, 
      roughness: 0.6, 
      metalness: 0.05,
      flatShading: true
    });
    const sharedBrightBloodMat = new THREE.MeshStandardMaterial({ 
      color: 0xb50505, 
      roughness: 0.15, 
      metalness: 0.15,
      flatShading: true,
      emissive: 0x220000,
      emissiveIntensity: 0.25
    });
    const sharedSparkMat = new THREE.MeshBasicMaterial({ 
      color: 0xffcc00 
    });
    const sharedSmokeMat = new THREE.MeshBasicMaterial({ 
      color: 0x999999, 
      transparent: true, 
      opacity: 0.45 
    });
    const sharedHighSmokeMat = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc, 
      transparent: true, 
      opacity: 0.22, 
      roughness: 0.95,
      metalness: 0.0,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const sharedLiquidMat = new THREE.MeshBasicMaterial({ 
      color: 0xbf7713, 
      transparent: true, 
      opacity: 0.8 
    });
    const sharedDebrisMat = new THREE.MeshStandardMaterial({ 
      color: 0x5a2d0c, 
      roughness: 0.8 
    });
    const sharedSplatMat = new THREE.MeshBasicMaterial({ 
      color: 0x5e0000, 
      transparent: true, 
      opacity: 0.95, 
      depthWrite: false, 
      depthTest: false 
    });
    const sharedBrassShellMat = new THREE.MeshStandardMaterial({ 
      color: 0xd4af37, 
      metalness: 0.92, 
      roughness: 0.22 
    });
    const sharedBlankShellMat = new THREE.MeshStandardMaterial({ 
      color: 0x1e8bc3, 
      metalness: 0.45, 
      roughness: 0.28 
    });
    const sharedBulletMat = new THREE.MeshStandardMaterial({ 
      color: 0xcc9900, 
      metalness: 0.95, 
      roughness: 0.15 
    });

    const sharedMaterials = new Set<THREE.Material>([
      rustySteelMat, brassMat, darkMetalStyle, cloakMat, maskLineMat,
      gunMetalMat, stockMat, darkLinerMat, liveShellMat, blankShellMat,
      hollowShellMat, shelfMat, tableMat, selfPadMat, etchMat,
      scalMat, defibYMat, darkSteelMat, leftEyeMat, rightEyeMat,
      bulbGlowMat, floorMat, boothWallMat, blackCavityMat, redGlowMat,
      sharedBloodMat, sharedDarkBloodMat, sharedBrightBloodMat, sharedSparkMat, sharedSmokeMat, sharedHighSmokeMat, sharedDebrisMat, sharedSplatMat,
      sharedBrassShellMat, sharedBlankShellMat, sharedBulletMat
    ]);

    const sharedGeometries = new Set<THREE.BufferGeometry>([
      tableLegsGeo, wireGeo, bulbGeo, bulbGlowGeo, tableTopGeo, floorGeo,
      boothWallGeo, shelfGeo, tagGeo, cloakGeo, hoodGeo, faceCavityGeo,
      eyeGeo, standGeo, drumGeo, rodGeo, cartridgeShellGeo, pointerConeGeo,
      frameGeo, gripGeo, cylDrumGeo, fluteGeo, barrelGeo, hammerGeo,
      guardGeo, padGeo, etchGeo, unitBoxGeo, unitCircleGeo, unitSmokeSphereGeo,
      unitShellCylinderGeo, unitBulletGeo, unitPixelSplatGeo
    ]);

    const disposeNode = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry && !sharedGeometries.has(child.geometry)) {
            child.geometry.dispose();
          }
          if (child.material) {
            const disposeMaterial = (mat: THREE.Material) => {
              if (!sharedMaterials.has(mat)) {
                if ((mat as any).map) (mat as any).map.dispose();
                if ((mat as any).lightMap) (mat as any).lightMap.dispose();
                if ((mat as any).aoMap) (mat as any).aoMap.dispose();
                if ((mat as any).emissiveMap) (mat as any).emissiveMap.dispose();
                if ((mat as any).bumpMap) (mat as any).bumpMap.dispose();
                if ((mat as any).normalMap) (mat as any).normalMap.dispose();
                if ((mat as any).displacementMap) (mat as any).displacementMap.dispose();
                if ((mat as any).roughnessMap) (mat as any).roughnessMap.dispose();
                if ((mat as any).metalnessMap) (mat as any).metalnessMap.dispose();
                if ((mat as any).alphaMap) (mat as any).alphaMap.dispose();
                mat.dispose();
              }
            };
            if (Array.isArray(child.material)) {
              child.material.forEach(disposeMaterial);
            } else {
              disposeMaterial(child.material);
            }
          }
        }
      });
    };


    // --- ITEM RACK REPRESENTATIONS ---
    const playerItemsGrp = new THREE.Group();
    playerItemsGrp.position.set(0.6, 0.6, 0.8); // user bottom-right hand
    scene.add(playerItemsGrp);

    const dealerItemsGrp = new THREE.Group();
    dealerItemsGrp.position.set(-0.8, 0.6, -1.6); // dealer top-left hand
    scene.add(dealerItemsGrp);

    let instantiatedPlayerCount = 0;
    let instantiatedDealerCount = 0;

    const playerItemMeshes: THREE.Group[] = [];
    const dealerItemMeshes: THREE.Group[] = [];

    const rebuildItemsOnTable = () => {
      // Safely dispose of unique materials and geometries inside old child meshes
      [...playerItemsGrp.children].forEach((child) => disposeNode(child));
      [...dealerItemsGrp.children].forEach((child) => disposeNode(child));

      while (playerItemsGrp.children.length > 0)
        playerItemsGrp.remove(playerItemsGrp.children[0]);
      while (dealerItemsGrp.children.length > 0)
        dealerItemsGrp.remove(dealerItemsGrp.children[0]);

      playerItemMeshes.length = 0;
      dealerItemMeshes.length = 0;

      const pItems = stateRef.current.player.items;
      const dItems = stateRef.current.dealer.items;

      // Arrange player items: 2 rows of 4
      pItems.forEach((type, idx) => {
        const itemObj = createItemMesh(type);
        const col = idx % 4;
        const row = Math.floor(idx / 4);

        const px = -0.5 + col * 0.35;
        const pz = -row * 0.45;

        itemObj.position.set(px, 0, pz);

        // Stamp interactive metadata on all sub-meshes for recursive hit validation
        itemObj.userData = { isPlayerItem: true, index: idx };

        playerItemsGrp.add(itemObj);
        playerItemMeshes.push(itemObj);
      });

      // Arrange dealer items of tabletop
      dItems.forEach((type, idx) => {
        const itemObj = createItemMesh(type);
        const col = idx % 4;
        const row = Math.floor(idx / 4);

        const px = -0.5 + col * 0.35;
        const pz = row * 0.45;

        itemObj.position.set(px, 0, pz);
        dealerItemsGrp.add(itemObj);
        dealerItemMeshes.push(itemObj);
      });

      instantiatedPlayerCount = pItems.length;
      instantiatedDealerCount = dItems.length;

      // Sync counts to animRef
      animRef.current.instantiatedPlayerCount = instantiatedPlayerCount;
      animRef.current.instantiatedDealerCount = instantiatedDealerCount;
    };

    rebuildItemsOnTable();

    // --- RAYCASTER TARGET SCANNER ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredMesh: THREE.Object3D | null = null;

    const getRaycastTargets = () => {
      const list: THREE.Object3D[] = [];
      if (playerSelfPad) list.push(playerSelfPad);
      list.push(dealerGroup);
      list.push(...playerItemMeshes);
      list.push(...shopItemMeshes);
      return list;
    };


    // --- PARTICLES SPARK EMITTER SYSTEM ---
    const activeParticles: {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      rotVelocity?: THREE.Vector3;
      life: number;
      maxLife: number;
      gravity: number;
      type: 'BLOOD' | 'SPARK' | 'SMOKE' | 'SHELL' | 'DEBRIS' | 'LIQUID' | 'BULLET';
      hasLanded: boolean;
      bounceCount: number;
    }[] = [];

    const spawnParticles = (
      origin: THREE.Vector3,
      particleColor: number,
      count = 20,
      speed = 0.15,
      gravityFactor = 0.003,
      type: 'BLOOD' | 'SPARK' | 'SMOKE' | 'SHELL' | 'DEBRIS' | 'LIQUID' | 'BULLET' = 'SPARK'
    ) => {
      // Psychological horror blood is ALWAYS enabled for gritty aesthetic
      const isBloodEnabled = true;

      // Particle Quality Density Multiplier
      const pQuality = getControllerSettings().particleQuality || 'high';
      let pMult = 1.0;
      switch (pQuality) {
        case 'off': pMult = 0.0; break;
        case 'low': pMult = 0.25; break;
        case 'medium': pMult = 0.5; break;
        case 'high': pMult = 1.0; break;
        case 'ultra': pMult = 1.75; break;
      }

      if (count > 1) {
        count = Math.round(count * pMult);
      } else if (pMult === 0 && type !== 'SHELL' && type !== 'BULLET') {
        count = 0;
      }

      if (count <= 0) return;

      // 1. Psychological horror camera lens pixelated blood splash! Triggered on massive gunshot hits
      if (type === 'BLOOD' && count >= 125) {
        const splatCount = 18 + Math.floor(Math.random() * 14);
        for (let s = 0; s < splatCount; s++) {
          // Pixelated step scale on screen glass
          const pxStep = 0.003;
          const pxSize = (1 + Math.floor(Math.random() * 3)) * pxStep;
          const splatMesh = new THREE.Mesh(unitPixelSplatGeo, sharedSplatMat);
          const pxWidth = pxSize * (1 + Math.floor(Math.random() * 3));
          const pxHeight = pxSize * (1 + Math.floor(Math.random() * 3));
          splatMesh.scale.set(pxWidth, pxHeight, 1);
          splatMesh.userData = { initialScaleX: pxWidth, initialScaleY: pxHeight };
          
          // Position directly on camera lens
          const rx = Math.floor((Math.random() - 0.5) * 16) * 0.012;
          const ry = Math.floor((Math.random() - 0.5) * 12) * 0.01;
          splatMesh.position.set(rx, ry, -0.11);
          // 90-degree pixel angular rotation snaps
          splatMesh.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2);
          
          camera.add(splatMesh);
          
          // Register splat to slide down and stretch vertically in pixelated steps
          const splatMaxLife = 160 + Math.random() * 200;
          activeParticles.push({
            mesh: splatMesh,
            velocity: new THREE.Vector3(0, -0.0002 - Math.random() * 0.0003, 0),
            life: 0,
            maxLife: splatMaxLife,
            gravity: 0,
            type: 'DEBRIS',
            hasLanded: true,
            bounceCount: 0
          });
        }
      }

      for (let i = 0; i < count; i++) {
        let mesh: THREE.Mesh;
        let maxLife = 20 + Math.random() * 30;
        let gravity = gravityFactor * (0.8 + Math.random() * 0.5);
        let rotVel: THREE.Vector3 | undefined = undefined;

        switch (type) {
          case 'BLOOD': {
            // Quantized voxel step sizing for retro PSX pixel art horror aesthetic
            const pxStep = 0.008;
            const stepCount = 1 + Math.floor(Math.random() * 4); // 0.008, 0.016, 0.024, 0.032
            const size = stepCount * pxStep;
            
            // Randomly select between arterial red, congealed dark crimson, and vivid bright red flat-shaded materials
            const matChoice = Math.random();
            const bloodMat = matChoice < 0.45 
              ? sharedBloodMat 
              : (matChoice < 0.8 ? sharedDarkBloodMat : sharedBrightBloodMat);

            mesh = new THREE.Mesh(unitBoxGeo, bloodMat);
            mesh.userData = { size, initialMat: bloodMat };
            
            // Randomize pixelated voxel shapes: Standard pixel drops vs elongated pixelated flesh chunks
            const isFleshChunk = Math.random() < 0.35;
            if (isFleshChunk) {
              const chunkLen = (2 + Math.floor(Math.random() * 4)) * pxStep;
              mesh.scale.set(size, chunkLen, size);
            } else {
              mesh.scale.set(size, size * (1 + Math.floor(Math.random() * 2)), size);
            }
              
            // Discrete pixelated angular rotation snaps
            mesh.rotation.set(
              Math.floor(Math.random() * 4) * (Math.PI / 2),
              Math.floor(Math.random() * 4) * (Math.PI / 2),
              Math.floor(Math.random() * 4) * (Math.PI / 2)
            );

            maxLife = 220 + Math.random() * 200;
            break;
          }
          case 'SPARK': {
            const size = 0.015 + Math.random() * 0.02;
            mesh = new THREE.Mesh(unitBoxGeo, sharedSparkMat);
            mesh.scale.set(size, size, size * 2);
            maxLife = 10 + Math.random() * 15;
            gravity = 0.001; 
            break;
          }
          case 'SHELL': {
            mesh = new THREE.Mesh(
              unitShellCylinderGeo, 
              particleColor === 0x1e8bc3 ? sharedBlankShellMat : sharedBrassShellMat
            );
            mesh.scale.set(0.042, 0.13, 0.042);
            mesh.rotation.z = Math.PI / 2;
            maxLife = 240;
            gravity = 0.0038;
            break;
          }
          case 'BULLET': {
            mesh = new THREE.Mesh(unitBulletGeo, sharedBulletMat);
            mesh.scale.set(0.03, 0.12, 0.03);
            maxLife = 28;
            gravity = 0.0001;
            break;
          }
          case 'SMOKE': {
            const isHighSettings = getControllerSettings().postProcessing === 'high' || getControllerSettings().postProcessing === 'cinematic';
            const size = isHighSettings
              ? 0.032 + Math.random() * 0.048
              : 0.024 + Math.random() * 0.032;

            mesh = new THREE.Mesh(
              isHighSettings ? unitSmokeSphereGeo : unitBoxGeo, 
              isHighSettings ? sharedHighSmokeMat : sharedSmokeMat
            );
            
            const sx = size * (0.8 + Math.random() * 0.4);
            const sy = size * (0.8 + Math.random() * 0.4);
            const sz = size * (0.8 + Math.random() * 0.4);
            mesh.scale.set(sx, sy, sz);
            mesh.userData = { 
              initialScaleX: sx, 
              initialScaleY: sy, 
              initialScaleZ: sz,
              rotSpeedX: (Math.random() - 0.5) * 0.04,
              rotSpeedY: (Math.random() - 0.5) * 0.04,
              rotSpeedZ: (Math.random() - 0.5) * 0.04
            };
            mesh.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );
            
            maxLife = isHighSettings 
              ? 135 + Math.random() * 65 
              : 100 + Math.random() * 45; // ~2 seconds life span
            gravity = -0.0006 - Math.random() * 0.0005; // thermal convective buoyant upward draft!
            break;
          }
          case 'LIQUID': {
            const size = 0.015 + Math.random() * 0.02;
            mesh = new THREE.Mesh(unitBoxGeo, sharedLiquidMat);
            mesh.scale.set(size, size, size);
            maxLife = 60 + Math.random() * 30;
            gravity = 0.0015; // Positive gravity so it falls into mouth/down
            break;
          }
          default: {
            const size = 0.03 + Math.random() * 0.03;
            mesh = new THREE.Mesh(unitBoxGeo, sharedDebrisMat);
            mesh.scale.set(size, size, size);
            maxLife = 60 + Math.random() * 40;
            break;
          }
        }

        mesh.position.copy(origin);
        scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        const spread = type === 'BLOOD' 
          ? (0.12 + Math.random() * 0.65) 
          : (type === 'SMOKE' ? (0.02 + Math.random() * 0.15) : (type === 'LIQUID' ? 0.05 + Math.random() * 0.05 : Math.random() - 0.5));
        
        let velocity = new THREE.Vector3(
          Math.cos(angle) * spread * speed,
          (Math.random() - 0.15) * speed * 2.0 + (type === 'BLOOD' ? 0.18 : (type === 'SMOKE' ? 0.005 : (type === 'LIQUID' ? -0.1 : 0.05))),
          Math.sin(angle) * spread * speed
        );

        if (type === 'SHELL') {
          // Eject casing out of chamber port with angular spin and realistic arc physics
          const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(gunGroup.quaternion).normalize();
          const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(gunGroup.quaternion).normalize();
          const backVec = new THREE.Vector3(0, 0, -1).applyQuaternion(gunGroup.quaternion).normalize();

          velocity = rightVec.clone().multiplyScalar(0.08 + Math.random() * 0.04)
            .addScaledVector(upVec, 0.12 + Math.random() * 0.05)
            .addScaledVector(backVec, 0.02 + Math.random() * 0.03);

          rotVel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.45,
            (Math.random() - 0.5) * 0.45,
            (Math.random() - 0.5) * 0.45
          );
        } else if (type === 'BULLET') {
          // High velocity forward trajectory along gun barrel direction
          const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(gunGroup.quaternion).normalize();
          velocity = forwardVec.multiplyScalar(0.85 + Math.random() * 0.1);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forwardVec);
        } else if (type === 'SMOKE') {
          // Project barrel smoke forward along the muzzle pointing vector direction
          const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(gunGroup.quaternion).normalize();
          velocity.addScaledVector(forwardVec, 0.01 + Math.random() * 0.016);
        }

        activeParticles.push({
          mesh,
          velocity,
          rotVelocity: rotVel,
          life: 0,
          maxLife,
          gravity,
          type,
          hasLanded: false,
          bounceCount: 0
        });
      }
    };

    // --- PHYSICS-DRIVEN ITEM DISCARD SYSTEM ---
    const discardItemPhysics = (itemObj: THREE.Group | null, user: 'player' | 'dealer' = 'player') => {
      if (!itemObj) return;
      const isPlayer = user === 'player';
      
      // Calculate realistic tossing impulse velocity
      const vx = (Math.random() - 0.5) * 0.12 + (isPlayer ? 0.04 : -0.04);
      const vy = 0.05 + Math.random() * 0.05; // upward arc toss
      const vz = (isPlayer ? -0.08 : 0.08) + (Math.random() - 0.5) * 0.06;

      const rotVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      );

      activeParticles.push({
        mesh: itemObj as any,
        velocity: new THREE.Vector3(vx, vy, vz),
        rotVelocity,
        life: 0,
        maxLife: 350, // stays on table/floor realistically before cleanup
        gravity: 0.0035,
        hasLanded: false,
        type: 'DEBRIS',
        bounceCount: 0,
      });
    };


    // --- ANIMATION / INTERACTION STATES moved to animRef ---
    const ar = animRef.current;

    // Table resting coordinates: physically resting flat on its side on the table surface
    const initialGunPos = new THREE.Vector3(0, 0.57, -0.4);
    const initialGunRot = new THREE.Euler(0.06, Math.PI / 2 + 0.12, Math.PI / 2); // Lying flat on the table, slightly angled
    gunGroup.position.copy(initialGunPos);
    gunGroup.rotation.copy(initialGunRot);

    // Grid Scaling layout handlers
    const handleResize = () => {
      if (!renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const isMobileDevice = false;
      isDesktopHQ = true;
      
      const graphics = getControllerSettings();
      const upscalingPreset = graphics.webGpuUpscalingPreset || 'quality';
      const sharpening = graphics.webGpuSharpening !== undefined ? graphics.webGpuSharpening : 0.6;

      // Determine internal render scale from preset
      let scale = 1.0;
      switch (upscalingPreset) {
        case 'ultra_quality': scale = 0.88; break;
        case 'quality': scale = 0.77; break;
        case 'balanced': scale = 0.67; break;
        case 'performance': scale = 0.50; break;
        case 'off': default: scale = 1.0; break;
      }

      if (scenePass && typeof scenePass.setResolutionScale === 'function') {
        scenePass.setResolutionScale(scale);
      }

      // Convert user sharpening slider (0.0..1.0) to RCAS sharpness (0.0 = max, 2.0 = none)
      const rcasSharpness = Math.max(0.0, (1.0 - sharpening) * 1.8);

      if (renderPipeline && scenePass) {
        try {
          if (upscalingPreset !== 'off') {
            renderPipeline.outputNode = fsr1(scenePass, rcasSharpness);
          } else if (sharpening > 0) {
            renderPipeline.outputNode = sharpen(scenePass, rcasSharpness);
          } else {
            renderPipeline.outputNode = scenePass;
          }
          renderPipeline.needsUpdate = true;
        } catch (e) {
          console.warn('FSR 1.0 / RCAS postprocessing node error:', e);
        }
      }

      // Configure Shadows for Desktop HQ
      renderer.shadowMap.enabled = !isMobileDevice && graphics.shadowQuality !== 'low';
      
      if (!isMobileDevice) {
         if (graphics.shadowQuality === 'high' || graphics.shadowQuality === 'ultra') {
             renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated, and PCF is the general standard now
         } else {
             renderer.shadowMap.type = THREE.PCFShadowMap;
         }
      }

      scene.traverse((child) => {
         // Shadow maps on lights
         if (child instanceof THREE.SpotLight || child instanceof THREE.PointLight || child instanceof THREE.DirectionalLight) {
           child.castShadow = (!isMobileDevice && graphics.shadowQuality !== 'low');
           if (child.castShadow && graphics.shadowQuality === 'ultra') {
              child.shadow.mapSize.width = 2048;
              child.shadow.mapSize.height = 2048;
           } else if (child.castShadow) {
              child.shadow.mapSize.width = 512;
              child.shadow.mapSize.height = 512;
           }
         }
         
         // Material enhancements & Anisotropic filtering
         // Calculate reflection intensity based on reflectionQuality setting
         const refQuality = graphics.reflectionQuality || 'high';
         let envIntensity = 1.0;
         switch (refQuality) {
           case 'off': envIntensity = 0.0; break;
           case 'low': envIntensity = 0.25; break;
           case 'medium': envIntensity = 0.65; break;
           case 'high': envIntensity = 1.0; break;
           case 'ultra': envIntensity = 1.65; break;
         }

         if (child instanceof THREE.Mesh && child.material) {
           const mat = child.material as THREE.MeshStandardMaterial;
           // Anisotropic filtering
           if (mat.map && renderer.capabilities) {
               mat.map.anisotropy = isMobileDevice ? 1 : Math.min(graphics.textureFiltering, renderer.capabilities.getMaxAnisotropy());
               mat.map.needsUpdate = true;
           }
           if (mat.roughness !== undefined) {
               mat.envMapIntensity = graphics.materialEnhancements ? envIntensity : (refQuality === 'off' ? 0.0 : envIntensity * 0.5);
               mat.needsUpdate = true;
           }
         }
      });

      // Configure Compositor Passes
      if (lensflareGroup) lensflareGroup.visible = graphics.lensFlaresEnabled;

      if (renderer) {
        renderer.setSize(w, h, false);
      }
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    // Subscribe to performance mode changes
    import('../controller').then(({ subscribeControllerSettings }) => {
      subscribeControllerSettings((s) => {
         // Re-apply and re-render every time settings update
         handleResize();
         setDebugToggle(p => p + 1);
      });
    });

    // --- INTERACTIONS HOVER & CLICKS LIST_DURS ---
    const getIntersectionTargetRaw = (clientX: number, clientY: number): THREE.Object3D | null => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const targets = getRaycastTargets();
      const intersects = raycaster.intersectObjects(targets, true);

      if (intersects.length > 0) {
        const firstObj = intersects[0].object;
        let curr: THREE.Object3D | null = firstObj;
        while (curr && curr !== scene) {
          if (
            curr.userData &&
            (curr.userData.isPlayerItem ||
              curr.userData.isShootSelfButton ||
              curr.userData.isShootDealerButton ||
              curr.userData.isShopItem)
          ) {
            return curr;
          }
          curr = curr.parent;
        }
      }
      return null;
    };

    const getIntersectionTarget = (e: MouseEvent): THREE.Object3D | null => {
      return getIntersectionTargetRaw(e.clientX, e.clientY);
    };

    const handleMouseMoveRaw = (clientX: number, clientY: number) => {
      const target = getIntersectionTargetRaw(clientX, clientY);
      hoveredMesh = target;

      if (target) {
        document.body.style.cursor = 'pointer';

        if (target.userData.isPlayerItem) {
          const idx = target.userData.index;
          const userItemsArr = stateRef.current.player.items;
          const itemName = userItemsArr[idx];
          const itemDesc = ITEM_DESCS[itemName] || 'Mystic contract elements';

          setHoveredInfo({
            type: 'ITEM',
            name: itemName,
            description: itemDesc,
            index: idx,
          });
        } else if (target.userData.isShootSelfButton) {
          setHoveredInfo({
            type: 'SHOOT_SELF',
            name: 'SHOOT SELF',
            description: 'POINT THE REVOLVER DIRECTLY AT YOUR TEMPLE. IF IT IS A BLANK, YOU RETAIN YOUR TURN.',
          });
        } else if (target.userData.isShootDealerButton) {
          setHoveredInfo({
            type: 'SHOOT_DEALER',
            name: 'SHOOT DEALER',
            description: 'AIM AT THE HOODED DEALER. DEALS LETHAL IMPACT UPON PROPELLANT SHELL FIRE.',
          });
        } else if (target.userData.isShopItem) {
           const { type, cost } = target.userData;
           const isAffordable = stateRef.current.bloodCurrency >= cost;
           setHoveredInfo({
              type: 'SHOP_ITEM',
              name: `${type} (${isAffordable ? 'AFFORDABLE' : 'TOO DEAR'})`,
              description: `${ITEM_DESCS[type]} COST: ${cost} BLOOD. CLICKS TO PURCHASE.`
           });
        }
      } else {
        document.body.style.cursor = '';
        setHoveredInfo(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Mouse move hides HUD smoothly and starts a 3-second inactivity timer to show it back
      if (mouseInactivityTimerRef.current) {
        clearTimeout(mouseInactivityTimerRef.current);
      }
      setShowKeyboardHud(false);
      mouseInactivityTimerRef.current = setTimeout(() => {
        setShowKeyboardHud(true);
      }, 3000);

      const targetEl = e.target as HTMLElement | null;
      if (
        !targetEl ||
        !renderer?.domElement ||
        (targetEl !== renderer.domElement && !renderer.domElement.contains(targetEl)) ||
        targetEl.closest('.settings-panel, button, input, select, label, a, [data-ui]') ||
        document.querySelector('.settings-panel')
      ) {
        document.body.style.cursor = '';
        setHoveredInfo(null);
        return;
      }

      if (updateGamepads() !== null) return; // Prevent KBM overriding active gamepad
      handleMouseMoveRaw(e.clientX, e.clientY);
    };

    const handleMouseUpRaw = (clientX: number, clientY: number) => {
      const target = getIntersectionTargetRaw(clientX, clientY);
      if (target) {
        if (target.userData.isPlayerItem && stateRef.current.showControls) {
          const idx = target.userData.index;
          useItem(idx, 'player');
          setHoveredInfo(null);
        } else if (target.userData.isShootSelfButton && stateRef.current.showControls) {
          fireGun('player', 'player');
          setHoveredInfo(null);
        } else if (target.userData.isShootDealerButton && stateRef.current.showControls) {
          fireGun('dealer', 'player');
          setHoveredInfo(null);
        } else if (target.userData.isShopItem) {
           const { type, cost } = target.userData;
           if (stateRef.current.bloodCurrency >= cost && stateRef.current.player.items.length < 8) {
              buyItem(type, cost);
              playPurchaseSound();
           }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (
        !targetEl ||
        !renderer?.domElement ||
        (targetEl !== renderer.domElement && !renderer.domElement.contains(targetEl)) ||
        targetEl.closest('.settings-panel, button, input, select, label, a, [data-ui]') ||
        document.querySelector('.settings-panel')
      ) {
        return;
      }
      if (updateGamepads() !== null) return;
      handleMouseUpRaw(e.clientX, e.clientY);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Pressing any key shows the keyboard shortcuts HUD immediately
      if (mouseInactivityTimerRef.current) {
        clearTimeout(mouseInactivityTimerRef.current);
        mouseInactivityTimerRef.current = null;
      }
      setShowKeyboardHud(true);

      if (
        document.querySelector('.settings-panel') ||
        (document.activeElement &&
         (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          document.activeElement.tagName === 'SELECT' ||
          document.activeElement.closest('.settings-panel')))
      ) {
        return;
      }


      const key = e.key;
      const code = e.code;
      const lowerKey = key.toLowerCase();
      const latest = stateRef.current;

      // 1. Market / Shop View Toggle
      if (lowerKey === 'q' || lowerKey === 'e' || lowerKey === 'b') {
        e.preventDefault();
        if (latest.player.health <= 0 || latest.gameState !== 'PLAYER_TURN') return;
        isLookingAtShopRef.current = !isLookingAtShopRef.current;
        hoveredMesh = null;
        setHoveredInfo(null);
        setDebugToggle(p => p + 1);
        vibrateGamepad('click');
        return;
      }

      if (code === 'ArrowDown' && !isLookingAtShopRef.current) {
        e.preventDefault();
        if (latest.player.health <= 0 || latest.gameState !== 'PLAYER_TURN') return;
        isLookingAtShopRef.current = true;
        hoveredMesh = null;
        setHoveredInfo(null);
        setDebugToggle(p => p + 1);
        vibrateGamepad('click');
        return;
      }

      if (code === 'ArrowUp' && isLookingAtShopRef.current) {
        e.preventDefault();
        isLookingAtShopRef.current = false;
        hoveredMesh = null;
        setHoveredInfo(null);
        setDebugToggle(p => p + 1);
        vibrateGamepad('click');
        return;
      }

      // 2. Direct Item usage via Number Keys (1-8)
      if (code.startsWith('Digit') || (code.startsWith('Numpad') && !isNaN(Number(key)))) {
        const digitNum = parseInt(key, 10);
        if (digitNum >= 1 && digitNum <= 8) {
          const itemIdx = digitNum - 1;
          if (latest.player.items && latest.player.items[itemIdx] !== undefined && latest.showControls) {
            e.preventDefault();
            useItem(itemIdx, 'player');
            setHoveredInfo(null);
            vibrateGamepad('click');
            return;
          }
        }
      }

      // 3. Direct Action Shortcuts: 'S' -> Shoot Self, 'D' -> Shoot Dealer
      if (latest.showControls && !isLookingAtShopRef.current) {
        if (lowerKey === 's' || code === 'KeyS') {
          e.preventDefault();
          fireGun('player', 'player');
          setHoveredInfo(null);
          vibrateGamepad('click');
          return;
        }
        if (lowerKey === 'd' || code === 'KeyD' || lowerKey === 'f') {
          e.preventDefault();
          fireGun('dealer', 'player');
          setHoveredInfo(null);
          vibrateGamepad('click');
          return;
        }
      }

      // 4. Arrow Keys / A / D Arena Navigation & Target Cycling
      if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyA' || code === 'KeyD') {
        e.preventDefault();
        const allTargets = getRaycastTargets();
        
        let targets = allTargets.filter(t => 
          isLookingAtShopRef.current ? t.userData.isShopItem : (t.userData.isPlayerItem || t.userData.isShootSelfButton || t.userData.isShootDealerButton)
        );

        targets.sort((a, b) => {
          const posA = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
          const posB = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
          return posA.x - posB.x;
        });

        if (targets.length > 0) {
          const dx = (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD') ? 1 : -1;
          let currIdx = targets.findIndex(t => t === hoveredMesh);
          
          if (currIdx === -1) {
            currIdx = dx > 0 ? 0 : targets.length - 1;
          } else {
            currIdx = (currIdx + dx + targets.length) % targets.length;
          }

          const target = targets[currIdx];
          hoveredMesh = target;

          if (target) {
            if (target.userData.isPlayerItem) {
              const idx = target.userData.index;
              const userItemsArr = latest.player.items;
              const itemName = userItemsArr[idx];
              const itemDesc = ITEM_DESCS[itemName] || 'Mystic contract elements';
              setHoveredInfo({
                type: 'ITEM',
                name: itemName || 'UNDEFINED',
                description: itemDesc,
                index: idx,
              });
            } else if (target.userData.isShootSelfButton) {
              setHoveredInfo({
                type: 'SHOOT_SELF',
                name: 'SHOOT SELF [S / ←]',
                description: 'POINT THE REVOLVER DIRECTLY AT YOUR TEMPLE. IF IT IS A BLANK, YOU RETAIN YOUR TURN.',
              });
            } else if (target.userData.isShootDealerButton) {
              setHoveredInfo({
                type: 'SHOOT_DEALER',
                name: 'SHOOT DEALER [D / →]',
                description: 'AIM AT THE HOODED DEALER. DEALS LETHAL IMPACT UPON PROPELLANT SHELL FIRE.',
              });
            } else if (target.userData.isShopItem) {
              const { type, cost } = target.userData;
              const isAffordable = latest.bloodCurrency >= cost;
              setHoveredInfo({
                type: 'SHOP_ITEM',
                name: `${type} (${isAffordable ? 'AFFORDABLE' : 'TOO DEAR'})`,
                description: `${ITEM_DESCS[type]} COST: ${cost} BLOOD. PRESS SPACE TO PURCHASE.`
              });
            }
          }
          vibrateGamepad('click');
          setDebugToggle(p => p + 1);
          return;
        }
      }

      // 5. Primary Action / Confirm: Space or Enter
      if (code === 'Space' || code === 'Enter') {
        e.preventDefault();
        if (hoveredMesh) {
          if (hoveredMesh.userData.isPlayerItem && latest.showControls) {
            const idx = hoveredMesh.userData.index;
            useItem(idx, 'player');
            setHoveredInfo(null);
            vibrateGamepad('click');
            return;
          } else if (hoveredMesh.userData.isShootSelfButton && latest.showControls) {
            fireGun('player', 'player');
            setHoveredInfo(null);
            vibrateGamepad('click');
            return;
          } else if (hoveredMesh.userData.isShootDealerButton && latest.showControls) {
            fireGun('dealer', 'player');
            setHoveredInfo(null);
            vibrateGamepad('click');
            return;
          } else if (hoveredMesh.userData.isShopItem) {
            const { type, cost } = hoveredMesh.userData;
            if (latest.bloodCurrency >= cost && latest.player.items.length < 8) {
              buyItem(type, cost);
              playPurchaseSound();
              vibrateGamepad('click');
              return;
            }
          }
        }

        if (latest.showControls && !isLookingAtShopRef.current) {
          fireGun('dealer', 'player');
          setHoveredInfo(null);
          vibrateGamepad('click');
          return;
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);


    // --- PLAY TICK LOOP ---
    let frameId = 0;
    
    // Gamepad state for native D-pad targeting
    let gamepadTargetIndex = 0;
    let lastDPadX = 0;
    let lastGamepadA = false;
    let virtualCursorActive = false;
    let virtualX = window.innerWidth / 2;
    let virtualY = window.innerHeight / 2;
    let lastGamepadView = false;
    let lastGamepadLB = false;
    let lastGamepadRB = false;
    let lastGamepadY = false;
    let lastGamepadLT = false;
    let lastGamepadRT = false;
    let lastGamepadB = false;
    let isTargetingActive = false;
    let lastPentagramRumbleTime = 0;

    let lastFrameTime = performance.now();

    const animate = () => {
      if (webGpuErrorRef.current) {
        return; // Halt render engine immediately if WebGPU is unavailable
      }
      frameId = requestAnimationFrame(animate);
      const now = performance.now();
      let frameDiffMs = now - lastFrameTime;
      if (frameDiffMs > 150) {
        // Prevent huge frame jumps after tab switching or temporary system freeze
        frameDiffMs = 16.6;
      }
      const rawDt = Math.max(0.001, Math.min(frameDiffMs / 1000, 0.05));
      lastFrameTime = now;

      ar.tickCount++;
      ar.time += rawDt * 1.25;
      const time = ar.time;
      const deltaScale = Math.min(rawDt * 60, 2.5); // Cap deltaScale so physics remain stable on low framerates

      const damp = (factor: number) => {
        const clampedFactor = Math.min(0.99, Math.max(0.01, factor));
        return 1 - Math.pow(1 - clampedFactor, deltaScale);
      };

      const latest = stateRef.current;

      // Calculate frame-to-frame barrel/muzzle position delta for realistic fluid continuation
      gunGroup.updateMatrixWorld(true);
      const currentMuzzleWorldPos = new THREE.Vector3(0, 0.18, 0.9).applyMatrix4(gunGroup.matrixWorld);
      const muzzleDelta = new THREE.Vector3();
      if (ar.prevMuzzleWorldPos) {
        muzzleDelta.copy(currentMuzzleWorldPos).sub(ar.prevMuzzleWorldPos);
      } else {
        ar.prevMuzzleWorldPos = new THREE.Vector3();
      }
      ar.prevMuzzleWorldPos.copy(currentMuzzleWorldPos);

      if (!latest.showControls && !isLookingAtShopRef.current) {
         if (isTargetingActive) {
            isTargetingActive = false;
            hoveredMesh = null;
            setHoveredInfo(null);
         }
      }

      // Continuous low rumble when pentagram is active (during animation)
      if (ar.activeItemAnimType === 'PENTAGRAM') {
        if (Date.now() - lastPentagramRumbleTime > 100) {
          lastPentagramRumbleTime = Date.now();
          vibrateGamepad('rumble', { duration: 120, weak: 0.35, strong: 0.05 });
        }
      }


      const gp = updateGamepads();
      const cursorEl = document.getElementById('virtual-cursor');
      if (gp) {
        const btnView = gp.buttons[8]?.pressed || gp.buttons[17]?.pressed; // View / Share button
        if (btnView && !lastGamepadView) {
           virtualCursorActive = !virtualCursorActive;
           vibrateGamepad('click');
        }
        lastGamepadView = btnView;

        const btnY = gp.buttons[3]?.pressed;
        if (btnY && !lastGamepadY) {
           if (latest.player.health > 0 && latest.gameState === 'PLAYER_TURN') {
             isLookingAtShopRef.current = !isLookingAtShopRef.current;
             isTargetingActive = false;
             hoveredMesh = null;
             setHoveredInfo(null);
             setDebugToggle(p => p + 1);
             vibrateGamepad('click');
           }
        }
        lastGamepadY = btnY;

        const btnLT = gp.buttons[6]?.value > 0.5 || gp.buttons[6]?.pressed;
        if (btnLT && !lastGamepadLT && latest.showControls) {
           fireGun('player', 'player');
           setHoveredInfo(null);
           vibrateGamepad('click');
        }
        lastGamepadLT = !!btnLT;

        const btnRT = gp.buttons[7]?.value > 0.5 || gp.buttons[7]?.pressed;
        if (btnRT && !lastGamepadRT && latest.showControls) {
           fireGun('dealer', 'player');
           setHoveredInfo(null);
           vibrateGamepad('click');
        }
        lastGamepadRT = !!btnRT;

        if (virtualCursorActive) {
          if (cursorEl) cursorEl.style.display = 'flex';
          const lx = gp.axes[0]; // Left stick X
          const ly = gp.axes[1]; // Left stick Y
          
          let moved = false;
          if (Math.abs(lx) > 0.1 || Math.abs(ly) > 0.1) {
            virtualX += lx * 16.0 * deltaScale;
            virtualY += ly * 16.0 * deltaScale;
            moved = true;
          }

          const rect = canvas.getBoundingClientRect();
          virtualX = Math.max(rect.left, Math.min(rect.right, virtualX));
          virtualY = Math.max(rect.top, Math.min(rect.bottom, virtualY));

          if (cursorEl) {
            cursorEl.style.left = `${virtualX}px`;
            cursorEl.style.top = `${virtualY}px`;
          }

          if (moved || ar.tickCount % 5 === 0) {
            handleMouseMoveRaw(virtualX, virtualY);
          }

          const aPressed = gp.buttons[0]?.pressed; 
          if (aPressed && !lastGamepadA) {
             handleMouseUpRaw(virtualX, virtualY);
             const domTarget = document.elementFromPoint(virtualX, virtualY);
             if (domTarget instanceof HTMLElement) {
                if (domTarget.tagName.toLowerCase() === 'select') {
                  const select = domTarget as HTMLSelectElement;
                  select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  domTarget.click();
                }
             }
             vibrateGamepad('click');
          }
          lastGamepadA = aPressed;
        } else {
          // Native item cycle targeting mode
          if (cursorEl) cursorEl.style.display = 'none';

          const btnB = gp.buttons[1]?.pressed;
          if (btnB && !lastGamepadB) {
            const allTargets = getRaycastTargets();
            const availableTargets = allTargets.filter(t => 
               isLookingAtShopRef.current ? t.userData.isShopItem : t.userData.isPlayerItem
            );
            if (availableTargets.length > 0 || isTargetingActive) {
              isTargetingActive = !isTargetingActive;
              vibrateGamepad('click');
              if (!isTargetingActive) {
                  hoveredMesh = null;
                  setHoveredInfo(null);
              }
            }
          }
          lastGamepadB = !!btnB;

          const dpadLeft = gp.buttons[14]?.pressed || gp.axes[0] < -0.5;
          const dpadRight = gp.buttons[15]?.pressed || gp.axes[0] > 0.5;
          
          const btnLB = gp.buttons[4]?.pressed;
          const btnRB = gp.buttons[5]?.pressed;
          
          let dx = 0;
          
          if (dpadRight) {
             dx = 1;
          } else if (dpadLeft) {
             dx = -1;
          } else if (btnRB && !lastGamepadRB) {
             dx = 1;
          } else if (btnLB && !lastGamepadLB) {
             dx = -1;
          }

          lastGamepadLB = !!btnLB;
          lastGamepadRB = !!btnRB;
          
          if (isTargetingActive) {
            // Exclusively target actionable items with cycle (Shoot actions have dedicated LT/RT)
            const allTargets = getRaycastTargets();
            const targets = allTargets.filter(t => 
               isLookingAtShopRef.current ? t.userData.isShopItem : t.userData.isPlayerItem
            );
            
            // Sort targets by X position for logical left/right cycling
            targets.sort((a, b) => {
              const posA = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
              const posB = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
              return posA.x - posB.x;
            });

            if (targets.length > 0) {
              if (dx !== 0 && lastDPadX === 0) {
                gamepadTargetIndex = (gamepadTargetIndex + dx + targets.length) % targets.length;
                vibrateGamepad('click');
              }
              
              const target = targets[gamepadTargetIndex % targets.length];
              hoveredMesh = target;
              
              if (target) {
              if (target.userData.isPlayerItem) {
                const idx = target.userData.index;
                const userItemsArr = latest.player.items;
                const itemName = userItemsArr[idx];
                const itemDesc = ITEM_DESCS[itemName] || 'Mystic contract elements';

                setHoveredInfo({
                  type: 'ITEM',
                  name: itemName || 'UNDEFINED',
                  description: itemDesc,
                  index: idx,
                });
              } else if (target.userData.isShootSelfButton) {
                setHoveredInfo({
                  type: 'SHOOT_SELF',
                  name: 'SHOOT SELF',
                  description: 'POINT THE REVOLVER DIRECTLY AT YOUR TEMPLE. IF IT IS A BLANK, YOU RETAIN YOUR TURN.',
                });
              } else if (target.userData.isShootDealerButton) {
                setHoveredInfo({
                  type: 'SHOOT_DEALER',
                  name: 'SHOOT DEALER',
                  description: 'AIM AT THE HOODED DEALER. DEALS LETHAL IMPACT UPON PROPELLANT SHELL FIRE.',
                });
              } else if (target.userData.isShopItem) {
                 const { type, cost } = target.userData;
                 const isAffordable = latest.bloodCurrency >= cost;
                 setHoveredInfo({
                    type: 'SHOP_ITEM',
                    name: `${type} (${isAffordable ? 'AFFORDABLE' : 'TOO DEAR'})`,
                    description: `${ITEM_DESCS[type]} COST: ${cost} BLOOD. CLICKS TO PURCHASE.`
                 });
              }
            }
            
            const aPressed = gp.buttons[0]?.pressed;
            if (aPressed && !lastGamepadA) {
               // Handle Action
               if (target.userData.isPlayerItem && latest.showControls) {
                 useItem(target.userData.index, 'player');
                 setHoveredInfo(null);
               } else if (target.userData.isShootSelfButton && latest.showControls) {
                 fireGun('player', 'player');
                 setHoveredInfo(null);
               } else if (target.userData.isShootDealerButton && latest.showControls) {
                 fireGun('dealer', 'player');
                 setHoveredInfo(null);
               } else if (target.userData.isShopItem) {
                 const { type, cost } = target.userData;
                 if (latest.bloodCurrency >= cost && latest.player.items.length < 8) {
                    buyItem(type, cost);
                    import('../audio').then(a => a.playPurchaseSound());
                 }
               }
               vibrateGamepad('click');
            }
            lastGamepadA = aPressed;
           } else {
             isTargetingActive = false;
             hoveredMesh = null;
             setHoveredInfo(null);
           }
          }
          lastDPadX = dx;
        }
      } else {
        if (cursorEl) cursorEl.style.display = 'none';
      }

      // Rebuild components detection
      if (
        latest.player.items.length !== ar.instantiatedPlayerCount ||
        latest.dealer.items.length !== ar.instantiatedDealerCount
      ) {
        rebuildItemsOnTable();
      }

      if (latest.chambers !== ar.previousChambers) {
        updateCylinderShells();
        ar.previousChambers = latest.chambers;
      }

      // Overhanging spotlight sway mechanics
      spotLight.position.x = Math.sin(time * 0.7) * 0.38;
      spotLight.position.z = Math.cos(time * 0.5) * 0.22;
      spotLightTarget.position.x = Math.sin(time * 0.4) * 0.2;

      bulbMesh.position.x = spotLight.position.x;
      wireMesh.position.x = spotLight.position.x;
      bulbGlow.position.x = spotLight.position.x;

      bulbMesh.rotation.z = Math.sin(time * 0.7) * 0.08;
      wireMesh.rotation.z = Math.sin(time * 0.7) * 0.04;

      // Dynamic lighting adjustment based on user brightness settings
      const bMult = getControllerSettings().brightness ?? 1.0;
      ambientLight.intensity = 1.2 * bMult;
      fillLight.intensity = 1.5 * bMult;

      // Dim light flickering
      if (Math.random() < 0.012 * deltaScale) {
        spotLight.intensity = (4.0 + Math.random() * 8.0) * bMult;
        bulbGlowMat.color.setHex(0x3a2510);
      } else {
        const targetSpotIntensity = 28.0 * bMult;
        spotLight.intensity = spotLight.intensity * (1 - damp(0.05)) + targetSpotIntensity * damp(0.05);
        bulbGlowMat.color.setHex(0xffeaad);
      }

      // Shop Lamp flickering & shop ambient lights dynamic updates
      shopSpotLight.intensity = (25.0 + Math.sin(time * 12) * 5.0 + (Math.random() > 0.98 ? -10 : 0)) * bMult;
      shopAmbient.intensity = 25.0 * bMult;
      shelfBottomLight.intensity = 12.0 * bMult;
      shelfTopLight.intensity = 12.0 * bMult;

      // Force shop view off when player dies or during action / dealer turn
      if (latest.player.health <= 0 || latest.gameState !== 'PLAYER_TURN') {
        isLookingAtShopRef.current = false;
      }

      // --- CAMERA TARGET & POSITION INTERPOLATION ---
      const dealerTarget = new THREE.Vector3(0, ar.lookTargetY, -1);
      const shopTarget = new THREE.Vector3(-15, 1.2, 0); 
      
      const activeLookTarget = isLookingAtShopRef.current ? shopTarget : dealerTarget;
      
      const dealerCamPos = new THREE.Vector3(0, 3.4, 5.5);
      const shopCamPos = new THREE.Vector3(-8.5, 2.8, 0); // Reverted zoom: Excellent distance
      
      const activeCamPos = isLookingAtShopRef.current ? shopCamPos : dealerCamPos;
      
      if (!stateRef.current.lookTargetVec) {
        stateRef.current.lookTargetVec = dealerTarget.clone();
      }
      if (!stateRef.current.camPosVec) {
        stateRef.current.camPosVec = dealerCamPos.clone();
      }
      
      const lerpSpeed = isLookingAtShopRef.current ? 0.14 : 0.20;
      stateRef.current.lookTargetVec.lerp(activeLookTarget, damp(lerpSpeed));
      stateRef.current.camPosVec.lerp(activeCamPos, damp(lerpSpeed));

      // Check if the gun barrel needs to show as cutoff/shortened (double damage)
      if (latest.doubleDamageActive) {
        barrelMesh.scale.z = 0.45;
        barrelMesh.position.z = 0.225;
      } else {
        barrelMesh.scale.z = 1.0;
        barrelMesh.position.z = 0.45;
      }

      // Check if dealer is being hovered in KBM controls
      let isShootDealerHovered = false;
      if (hoveredMesh) {
        let p: THREE.Object3D | null = hoveredMesh;
        while (p && p !== scene) {
          if (p === dealerGroup) {
            isShootDealerHovered = true;
            break;
          }
          p = p.parent;
        }
      }

      // Handle Dealer Death Visuals: eyes turn to X and he falls
      if (latest.dealer.health <= 0) {
        leftEye.scale.set(1.4, 0.2, 1);
        leftEye.rotation.z = Math.PI / 4;
        rightEye.scale.set(1.4, 0.2, 1);
        rightEye.rotation.z = -Math.PI / 4;
        
        // Add crossed bars as direct siblings in dealerGroup to form perfect X shapes
        if (!leftEye.userData.isCrossed) {
          const crossBarL = new THREE.Mesh(eyeGeo, leftEye.material);
          crossBarL.position.copy(leftEye.position);
          crossBarL.scale.set(1.4, 0.2, 1);
          crossBarL.rotation.z = -Math.PI / 4;
          dealerGroup.add(crossBarL);

          const crossBarR = new THREE.Mesh(eyeGeo, rightEye.material);
          crossBarR.position.copy(rightEye.position);
          crossBarR.scale.set(1.4, 0.2, 1);
          crossBarR.rotation.z = Math.PI / 4;
          dealerGroup.add(crossBarR);

          leftEye.userData.isCrossed = true;
          leftEye.userData.crossBarMesh = crossBarL;
          rightEye.userData.crossBarMesh = crossBarR;

          if (leftEye.material instanceof THREE.MeshBasicMaterial) {
            leftEye.material.color.setHex(0xffffff); // Dead white eyes
          }
          if (rightEye.material instanceof THREE.MeshBasicMaterial) {
            rightEye.material.color.setHex(0xffffff); // Dead white eyes
          }
        }
      }

      // Hooded Dealer slow idling breathing + smooth smile transitions + flaring eye squints
      if (latest.dealer.health > 0) {
        ar.dealerDeathStartTime = 0;
        ar.hasThumpedDealerFall = false;
        if (leftEye.userData.isCrossed) {
          leftEye.userData.isCrossed = false;
          // Clean up cross bars safely from dealerGroup
          if (leftEye.userData.crossBarMesh) {
            dealerGroup.remove(leftEye.userData.crossBarMesh);
            leftEye.userData.crossBarMesh = null;
          }
          if (rightEye.userData.crossBarMesh) {
            dealerGroup.remove(rightEye.userData.crossBarMesh);
            rightEye.userData.crossBarMesh = null;
          }
          if (leftEye.material instanceof THREE.MeshBasicMaterial) {
            leftEye.material.color.setHex(0xff0000); 
          }
          if (rightEye.material instanceof THREE.MeshBasicMaterial) {
            rightEye.material.color.setHex(0xff0000); 
          }
          leftEye.rotation.z = 0;
          rightEye.rotation.z = 0;
        }

        const dealerHPPct = latest.dealer.health / latest.dealer.maxHealth;
        const playerHPPct = latest.player.health / latest.player.maxHealth;
        let personality = 'NORMAL';
        if (dealerHPPct <= 0.35) personality = 'DESPERATE';
        else if (dealerHPPct >= 0.6 && playerHPPct <= 0.4) personality = 'ARROGANT';

        let breathSpeed = 1.8;
        let breathAmp = 0.035;
        let twitchX = 0;
        let twitchY = 0;
        let twitchZ = 0;
        let jitterRotX = 0;
        let jitterRotY = 0;
        let jitterRotZ = 0;
        let leanZ = 0;

        if (personality === 'DESPERATE') {
          breathSpeed = 3.0; // slightly faster tense breathing
          breathAmp = 0.025;
          // Very subtle smooth micro-tremor instead of wild random jitter
          twitchX = Math.sin(time * 14.0) * 0.004;
          twitchY = Math.cos(time * 11.0) * 0.003;
          twitchZ = Math.sin(time * 9.0) * 0.002;
          
          jitterRotX = Math.sin(time * 10.0) * 0.008;
          jitterRotY = Math.cos(time * 12.0) * 0.008;
          jitterRotZ = Math.sin(time * 8.0) * 0.006;
          
          leanZ = -0.05; // slightly recoiled back in tense focus
        } else if (personality === 'ARROGANT') {
          breathSpeed = 1.2;
          breathAmp = 0.02;
          leanZ = 0.15; // leaning forward confidently
        }

        const flinchTimeElapsed = Date.now() - latest.dealerFlinchTime;

        dealerGroup.position.x = (personality === 'DESPERATE' ? twitchX : (flinchTimeElapsed >= 400 ? 0 : dealerGroup.position.x));
        dealerGroup.position.y = -0.4 + Math.sin(time * breathSpeed) * breathAmp + twitchY;

        // Smoothly restore scale & base parameters when resurrected or alive
        if (dealerGroup.scale.x < 0.999) {
          dealerGroup.scale.setScalar(dealerGroup.scale.x * (1 - damp(0.1)) + 1.0 * damp(0.1));
        } else {
          dealerGroup.scale.setScalar(1.0);
        }
        
        // Ambient breathing and recoil rotation (without cursor tracking)
        const targetRotY = Math.sin(time * 0.9) * 0.04;
        let targetRotX = 0;

        // VISCERAL DEALER RECOIL & FLINCH WHEN DAMAGED / SHOT
        let flinchZ = 0;
        if (flinchTimeElapsed < 650) {
          const t = flinchTimeElapsed / 650;
          // Explosive backward impulse with elastic spring recoil
          const impulse = Math.sin(Math.pow(t, 0.35) * Math.PI);
          flinchZ = -0.72 * impulse; // Heavy visceral backward blowback
          targetRotX = -0.35 * impulse; // Torso & head throw back
          jitterRotZ += (Math.sin(time * 35) * 0.08) * (1.0 - t); // Spasmic muscle shiver
          
          // Expressive recoil reaction: Head throws back, mouth opens in shock, eyebrows furrow
          ar.dealerHeadTiltFactor = Math.max(ar.dealerHeadTiltFactor, 0.9 * impulse);
          ar.dealerMouthOpenFactor = Math.max(ar.dealerMouthOpenFactor, 0.7 * impulse);
          ar.dealerSmileFactor *= (1.0 - impulse);
        } else {
          if (personality !== 'DESPERATE') dealerGroup.position.x = 0;
          dealerGroup.rotation.z = Math.cos(time * 1.2) * 0.025;
        }

        // Apply smoothed head/body tracking rotations + frantic desperation jitter
        dealerGroup.rotation.x = dealerGroup.rotation.x * (1 - damp(0.16)) + (targetRotX + jitterRotX) * damp(0.16);
        dealerGroup.rotation.y = dealerGroup.rotation.y * (1 - damp(0.16)) + (targetRotY + jitterRotY) * damp(0.16);
        dealerGroup.rotation.z = (flinchTimeElapsed >= 400 ? Math.cos(time * 1.2) * 0.025 : dealerGroup.rotation.z) + jitterRotZ;

        // Natural periodic blinking logic
        if (ar.nextBlinkTime === 0) {
          ar.nextBlinkTime = time + 1.5 + Math.random() * 3.0;
        }

        if (time >= ar.nextBlinkTime) {
          ar.blinkStartTime = time;
          ar.blinkDuration = 0.13 + Math.random() * 0.05; // 130ms - 180ms natural blink
          ar.nextBlinkTime = time + 2.2 + Math.random() * 4.2; // Next blink in 2.2 - 6.4 seconds
          if (Math.random() < 0.2) {
            ar.isDoubleBlinkPending = true;
          }
        }

        let blinkScaleY = 1.0;
        const blinkElapsed = time - ar.blinkStartTime;
        if (blinkElapsed >= 0 && blinkElapsed <= ar.blinkDuration) {
          const blinkT = blinkElapsed / ar.blinkDuration;
          blinkScaleY = Math.max(0.05, 1.0 - Math.sin(blinkT * Math.PI) * 0.95);
        } else if (ar.isDoubleBlinkPending && blinkElapsed > ar.blinkDuration + 0.08) {
          ar.isDoubleBlinkPending = false;
          ar.blinkStartTime = time;
          ar.blinkDuration = 0.11;
        }

        if (isShootDealerHovered && latest.showControls) {
          dealerGroup.position.z = -3.2 + flinchZ + leanZ + twitchZ;
          leftEye.scale.set(1.0, 1.0 * blinkScaleY, 1.0);
          rightEye.scale.set(1.0, 1.0 * blinkScaleY, 1.0);
          if (leftEye.material instanceof THREE.Material) {
            (leftEye.material as any).color.setHex(0xff3333); // flaring high hostile red
          }
        } else {
          dealerGroup.position.z = -3.2 + flinchZ + leanZ + twitchZ;
          leftEye.scale.set(1.0, 1.0 * blinkScaleY, 1.0);
          rightEye.scale.set(1.0, 1.0 * blinkScaleY, 1.0);
          if (leftEye.material instanceof THREE.Material) {
            (leftEye.material as any).color.setHex(0xff0000); // stable blood red
          }
        }

        // Check if the dealer should actually smile (smoothly transition mask mouth segments)
        const msgLower = latest.message.toLowerCase();
        const subLower = (latest.subMessage || "").toLowerCase();
        
        const isBlankOutcome = msgLower.includes("empty") || msgLower.includes("click") || subLower.includes("empty") || subLower.includes("click");
        const playerIsDead = latest.gameState === 'GAME_OVER' && latest.player.health <= 0;
        
        // 1. Explicit message instructions to smile or stretch grin
        const explicitSmile = msgLower.includes("dealer smiles") || msgLower.includes("the dealer smiles") || msgLower.includes("mask glitches") || subLower.includes("tilts his head") || subLower.includes("grin stretches");
        
        // 2. Player tries to shoot themselves (during any phase of shooting at themselves inside SHOOTING state)
        const tryingToShootSelf = (ar.animShooter === 'player' && ar.animTarget === 'player' && latest.gameState === 'SHOOTING');
        
        // 3. Player fires an empty chamber at the dealer
        const emptyShotAtDealer = (ar.animShooter === 'player' && ar.animTarget === 'dealer' && isBlankOutcome && latest.gameState === 'SHOOTING');
        
        // 4. Any completed empty self shot
        const emptyShotAtSelf = (ar.animShooter === 'player' && ar.animTarget === 'player' && isBlankOutcome);

        const shouldSmile = explicitSmile || tryingToShootSelf || emptyShotAtDealer || emptyShotAtSelf || playerIsDead || personality === 'ARROGANT' || latest.retaliationActive;
        
        if (personality === 'DESPERATE') {
          ar.dealerSmileFactor = 0.0; // Strictly NEVER smile in desperate mode
        } else if (shouldSmile) {
          ar.dealerSmileFactor = ar.dealerSmileFactor * (1 - damp(0.12)) + 1.0 * damp(0.12);
        } else {
          ar.dealerSmileFactor = ar.dealerSmileFactor * (1 - damp(0.05)) + 0.0 * damp(0.05);
        }

        const openFactor = ar.dealerMouthOpenFactor || 0.0;
        const tiltFactor = ar.dealerHeadTiltFactor || 0.0;

        // Smoothly decay mouth open and head tilt back to resting position
        ar.dealerMouthOpenFactor *= (1 - damp(0.08));
        ar.dealerHeadTiltFactor *= (1 - damp(0.08));

        // Dealer Head Tilt Back when drinking or smoking
        dealerGroup.rotation.x = -0.22 * tiltFactor;

        // Multi-jointed angular mask line translations (Smile + Speaking/Opening Movement)
        const smile = ar.dealerSmileFactor;
        const talkMutter = (latest.gameState === 'DEALER_TURN' || latest.gameState === 'AI_THINKING') ? Math.sin(time * 18) * 0.03 : 0;
        const totalOpen = Math.max(0, openFactor + talkMutter);

        // Single clean center bar
        mouthCenter.position.y = -0.015 * smile - 0.04 * totalOpen;

        // Mid lip joints bend smoothly with smile curve
        mouthLeftMid.position.x = -0.075;
        mouthLeftMid.position.y = 0.028 * smile - 0.03 * totalOpen;
        mouthLeftMid.rotation.z = -0.45 * smile + 0.2 * totalOpen;

        mouthRightMid.position.x = 0.075;
        mouthRightMid.position.y = 0.028 * smile - 0.03 * totalOpen;
        mouthRightMid.rotation.z = 0.45 * smile - 0.2 * totalOpen;

        // Outer corner joints bow outward & flare up into sinister wide grin
        mouthLeftCorner.position.x = -0.135;
        mouthLeftCorner.position.y = 0.065 * smile - 0.02 * totalOpen;
        mouthLeftCorner.rotation.z = -0.75 * smile + 0.3 * totalOpen;

        mouthRightCorner.position.x = 0.135;
        mouthRightCorner.position.y = 0.065 * smile - 0.02 * totalOpen;
        mouthRightCorner.rotation.z = 0.75 * smile - 0.3 * totalOpen;

        // Dynamic Eyebrow Expression Mechanics
        let targetBrowAngleL = -0.12;
        let targetBrowAngleR = 0.12;
        let targetBrowY = 2.82;

        if (isShootDealerHovered && latest.showControls) {
          // Threat/Flinch response: Angry, hostile V-furrowed brow
          targetBrowAngleL = -0.38;
          targetBrowAngleR = 0.38;
          targetBrowY = 2.79;
        } else if (personality === 'DESPERATE') {
          // Panicked / distressed inward slope
          targetBrowAngleL = 0.22;
          targetBrowAngleR = -0.22;
          targetBrowY = 2.81;
        } else if (smile > 0.1) {
          // Asymmetric arrogant/smug raised eyebrow
          targetBrowAngleL = 0.28;
          targetBrowAngleR = -0.12;
          targetBrowY = 2.84;
        } else {
          // Resting slight sinister slant
          targetBrowAngleL = -0.12;
          targetBrowAngleR = 0.12;
          targetBrowY = 2.82;
        }

        leftBrow.position.y = targetBrowY;
        leftBrow.rotation.z = targetBrowAngleL;
        rightBrow.position.y = targetBrowY;
        rightBrow.rotation.z = targetBrowAngleR;

        const isDealerHigh = latest.dealerDamageReductionEnd && Date.now() < latest.dealerDamageReductionEnd;

        const squint = ar.dealerSmileFactor > 0.001 ? (1.0 - 0.55 * ar.dealerSmileFactor) : 1.0;
        const baseScale = 1.0;

        if (latest.retaliationActive) {
          maskLineMat.color.setHex(Math.sin(time * 15) > 0 ? 0xff0000 : 0x220000);
          leftEye.scale.set(baseScale, baseScale * squint * blinkScaleY, baseScale);
          rightEye.scale.set(baseScale, baseScale * squint * blinkScaleY, baseScale);
        } else {
          maskLineMat.color.setHex(0xff0000);
          leftEye.scale.set(baseScale, baseScale * squint * blinkScaleY, baseScale);
          rightEye.scale.set(baseScale, baseScale * squint * blinkScaleY, baseScale);
        }

        // Glossy Eye Glaze
        if (leftEye.material instanceof THREE.MeshBasicMaterial) {
          if (isDealerHigh) {
            (leftEye.material as THREE.MeshBasicMaterial).color.setHex(0xffaaaa); // glazed hazy pink
            (rightEye.material as THREE.MeshBasicMaterial).color.setHex(0xffaaaa);
            leftEye.scale.setScalar(1.15 + Math.sin(time * 5) * 0.05);
            rightEye.scale.setScalar(1.15 + Math.sin(time * 5) * 0.05);
          } else if (isShootDealerHovered && latest.showControls) {
            (leftEye.material as THREE.MeshBasicMaterial).color.setHex(0xff3333);
            (rightEye.material as THREE.MeshBasicMaterial).color.setHex(0xff3333);
          } else {
            (leftEye.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
            (rightEye.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
          }
        }
        // Reset head pose when alive
        hoodMesh.position.set(0, 2.7, 0.1);
        hoodMesh.rotation.set(0, 0, 0);
        ar.dealerDeathStartTime = 0;
        ar.hasThumpedDealerFall = false;
      } else {
        // --- VISCERAL BACKWARD RAGDOLL PHYSICS COLLAPSE ANIMATION ---
        if (ar.dealerDeathStartTime === 0) ar.dealerDeathStartTime = Date.now();
        const deathElapsed = (Date.now() - ar.dealerDeathStartTime) / 1000;

        // Total collapse timeline: ~2.5 seconds
        // Phase 1 (0.0s - 0.4s): Kinetic Bullet Impact & Violent Backward Torso Snap
        // Phase 2 (0.4s - 1.35s): Gravitational Freefall Backward & Chair Flipping
        // Phase 3 (1.35s - 1.85s): Concrete Floor Impact & Elastic Ragdoll Rebound
        // Phase 4 (1.85s+): Sprawled Limp Resting State

        if (deathElapsed < 0.4) {
          // Phase 1: Sudden Kinetic Impact - Chest arches back, head snaps violently back
          const t1 = deathElapsed / 0.4;
          const ease1 = t1 * t1;

          dealerGroup.position.x = (Math.random() - 0.5) * 0.06 * (1 - t1) + Math.sin(time * 30) * 0.03 * (1 - t1);
          dealerGroup.position.y = -0.4 - (0.18 * ease1);
          dealerGroup.position.z = -3.2 - (0.35 * ease1); // Driven backward by impact
          dealerGroup.rotation.x = -0.45 * ease1; // Torso thrown backward
          dealerGroup.rotation.z = 0.12 * ease1; // Asymmetric shoulder drop

          // Head snaps backward limply on neck
          hoodMesh.position.z = 0.1 - 0.20 * ease1;
          hoodMesh.rotation.x = -0.55 * ease1;
          hoodMesh.rotation.z = 0.15 * ease1;

          // Eye glow flickers out instantly
          const flicker = Math.max(0, (1.0 - t1) * (0.8 + Math.sin(time * 50) * 0.2));
          leftEye.scale.setScalar(flicker);
          rightEye.scale.setScalar(flicker);

          const chair = scene.getObjectByName('dealerChairGroup');
          if (chair) {
            chair.rotation.x = -0.28 * ease1; // Chair begins tipping back
            chair.position.z = -3.2 - (0.18 * ease1);
          }
        } else if (deathElapsed < 1.35) {
          // Phase 2: Full Gravitational Fall Backward & Chair Tipping Over
          const t2 = (deathElapsed - 0.4) / 0.95;
          const gravityAccel = Math.pow(t2, 2.2); // Heavy exponential acceleration

          const targetY = -0.58 - (1.45 * gravityAccel);
          const targetZ = -3.55 - (1.35 * gravityAccel);
          
          const shiver = (1.0 - t2) * 0.04;
          dealerGroup.position.x = (Math.random() - 0.5) * shiver + Math.sin(time * 20) * shiver;
          dealerGroup.position.y = targetY;
          dealerGroup.position.z = targetZ;

          // Rotates flat backward onto spine
          dealerGroup.rotation.x = -0.45 - (1.25 * gravityAccel);
          dealerGroup.rotation.z = 0.12 + (0.28 * gravityAccel);

          // Neck & head ragdoll back then flop sideways onto shoulder
          hoodMesh.position.z = -0.10 - (0.15 * t2);
          hoodMesh.rotation.x = -0.55 - (0.35 * gravityAccel);
          hoodMesh.rotation.y = 0.42 * gravityAccel;
          hoodMesh.rotation.z = -0.35 * gravityAccel;

          leftEye.scale.setScalar(0);
          rightEye.scale.setScalar(0);

          const chair = scene.getObjectByName('dealerChairGroup');
          if (chair) {
            const chairFall = Math.pow(t2, 2.0);
            chair.rotation.x = -0.28 - (Math.PI / 1.8 - 0.28) * chairFall;
            chair.rotation.z = 0.18 * chairFall; // Twisted angle as chair crashes back
            chair.position.y = -1.2 + Math.sin(t2 * Math.PI) * 0.18;
            chair.position.z = -3.38 - (0.85 * chairFall);
          }
        } else if (deathElapsed < 1.85) {
          // Phase 3: Heavy Floor Impact & Ragdoll Rebound
          const t3 = deathElapsed - 1.35;

          if (!ar.hasThumpedDealerFall) {
            ar.hasThumpedDealerFall = true;
            import('../audio').then(a => a.playThumpSound());
            vibrateGamepad('jolt', { duration: 250, weak: 1.0, strong: 1.0 });

            // Violent impact screen shake & camera kick
            ar.cameraShakeIntensity = 1.2;
            ar.cameraKickZ = 0.15;

            const impactPos = new THREE.Vector3(0, -0.9, -4.8);
            spawnParticles(impactPos, 0x111111, 30, 0.18, -0.001, 'SMOKE');
            spawnParticles(impactPos, 0x880000, 25, 0.12, -0.002, 'BLOOD');
          }

          // Ragdoll dampening bounce off concrete floor
          const bounceFactor = Math.exp(-6.0 * t3) * Math.sin(16 * t3) * 0.12;

          dealerGroup.position.x = 0.06;
          dealerGroup.position.y = -1.98 + bounceFactor;
          dealerGroup.position.z = -4.85;

          dealerGroup.rotation.x = -1.62 - (bounceFactor * 0.8);
          dealerGroup.rotation.z = 0.22 + (bounceFactor * 0.3);

          const flopT = Math.min(1.0, t3 / 0.35);
          hoodMesh.position.set(0, 2.7, -0.05);
          hoodMesh.rotation.x = -0.75;
          hoodMesh.rotation.z = -0.52 * flopT;
          hoodMesh.rotation.y = 0.45 * flopT;

          leftEye.scale.setScalar(0);
          rightEye.scale.setScalar(0);

          const chair = scene.getObjectByName('dealerChairGroup');
          if (chair) {
            const chairBounce = Math.exp(-7.0 * t3) * Math.sin(14 * t3) * 0.08;
            chair.rotation.x = -Math.PI / 1.8 + chairBounce;
            chair.rotation.z = 0.18;
            chair.position.y = -1.2 + Math.abs(chairBounce) * 0.6;
            chair.position.z = -4.20;
          }
        } else {
          // Phase 4: Final Sprawled Limp Resting State
          const settleT = deathElapsed - 1.85;
          const residualTremor = Math.exp(-3.5 * settleT) * Math.sin(18 * settleT) * 0.004;

          dealerGroup.position.set(0.06 + residualTremor, -1.98, -4.85);
          dealerGroup.rotation.set(-1.62, 0, 0.22);

          hoodMesh.position.set(0, 2.7, -0.05);
          hoodMesh.rotation.set(-0.75, 0.45, -0.52);

          leftEye.scale.setScalar(0);
          rightEye.scale.setScalar(0);

          const chair = scene.getObjectByName('dealerChairGroup');
          if (chair) {
            chair.rotation.set(-Math.PI / 1.8, 0, 0.18);
            chair.position.set(0, -1.2, -4.20);
          }
        }
      }

      const chair = scene.getObjectByName('dealerChairGroup');
      if (chair && latest.dealerHealth > 0) {
         chair.rotation.x = chair.rotation.x * (1 - damp(0.1));
         chair.position.y = chair.position.y * (1 - damp(0.1)) + -1.2 * damp(0.1);
         chair.position.z = chair.position.z * (1 - damp(0.1)) + -3.2 * damp(0.1);
      }

      // Visual holographic cylinder indicator rotational snapping
      if (latest.gameState === 'LOADING') {
        revolvingChamberGroup.rotation.z += 0.42 * deltaScale;
        ar.localCylinderAngle = revolvingChamberGroup.rotation.z;
        cylinderUIGroup.position.y = cylinderUIGroup.position.y * (1 - damp(0.1)) + 1.15 * damp(0.1);
      } else {
        cylinderUIGroup.position.y = cylinderUIGroup.position.y * (1 - damp(0.08)) + 0.8 * damp(0.08);

        const targetDrumAngle = (latest.currentChamberIndex / 6) * Math.PI * 2;
        let angleDiff = targetDrumAngle - ar.localCylinderAngle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        ar.localCylinderAngle += angleDiff * damp(0.15);
        revolvingChamberGroup.rotation.z = ar.localCylinderAngle;
      }

      // Cylindrical drum spinning of the weapon revolver itself!
      if (revolverCylinderMesh) {
        if (latest.gameState === 'LOADING') {
          revolverCylinderMesh.rotation.z += 0.35 * deltaScale;
        } else if (ar.activeShootAnimationState === 'RAISING') {
          revolverCylinderMesh.rotation.z += 0.05 * deltaScale;
        } else {
          const targetDrumAngle = (latest.currentChamberIndex / 6) * Math.PI * 2;
          let drumDiff = targetDrumAngle - revolverCylinderMesh.rotation.z;
          while (drumDiff < -Math.PI) drumDiff += Math.PI * 2;
          while (drumDiff > Math.PI) drumDiff -= Math.PI * 2;
          revolverCylinderMesh.rotation.z += drumDiff * damp(0.2);
        }
      }


      // --- GUN ANIMATION SYSTEM ---
      if (latest.gameState === 'SHOOTING') {
          if (ar.activeShootAnimationState === 'IDLE') {
          ar.activeShootAnimationState = 'RAISING';
          ar.activeShootStartTime = Date.now();
          ar.hasDischarged = false;
          ar.hasCockingSoundPlayed = false;

          const msg = latest.message.toLowerCase();
          ar.animShooter = (msg.startsWith("the dealer") || msg.includes("dealer pulled") || msg.includes("dealer fires")) ? 'dealer' : 'player';
          ar.animTarget = (msg.includes("at yourself") || msg.includes("at you") || msg.includes("on you")) ? 'player' : 'dealer';
          ar.animIsLive = latest.chambers[latest.currentChamberIndex]?.isLive || false;
        }

        const elapsedMs = (Date.now() - ar.activeShootStartTime) * 1.25;

        if (elapsedMs < 1800) {
          // --- RAISING & COCKING & AIMING PHASE ---
          const finalAimPos = new THREE.Vector3();
          const finalAimRot = new THREE.Euler();

          if (ar.animShooter === 'player') {
            if (ar.animTarget === 'player') {
              // Pointing closely and intimidatingly at the player's face
              finalAimPos.set(0, 1.48, 1.45);
              finalAimRot.set(0.42, 0, 0);
            } else {
              // Pointing at dealer opposite end of table
              finalAimPos.set(0, 1.35, -0.6);
              finalAimRot.set(0.12, Math.PI, 0);
            }
          } else {
            // Dealer shooter
            if (ar.animTarget === 'player') {
              // Dealer points gun across the table directly in our face
              finalAimPos.set(0, 1.45, -1.8);
              finalAimRot.set(0.35, 0, 0);
            } else {
              // Dealer points gun back under their own hood
              finalAimPos.set(0, 1.55, -2.15);
              finalAimRot.set(0.2, Math.PI, 0);
            }
          }

          if (elapsedMs < 750) {
            // Phase 1: Raise & Cocking
            gunGroup.position.lerp(finalAimPos, damp(0.12));
            gunGroup.rotation.x = gunGroup.rotation.x * (1 - damp(0.12)) + finalAimRot.x * damp(0.12);
            gunGroup.rotation.y = gunGroup.rotation.y * (1 - damp(0.12)) + finalAimRot.y * damp(0.12);
            gunGroup.rotation.z = gunGroup.rotation.z * (1 - damp(0.12)) + finalAimRot.z * damp(0.12);
            
            if (elapsedMs > 50) {
              if (!ar.hasCockingSoundPlayed) {
                ar.hasCockingSoundPlayed = true;
                import('../audio').then(a => a.playCockSound());
                if (ar.animShooter === 'player') {
                    vibrateGamepad('jolt', { duration: 50, weak: 0.1, strong: 0.8 });
                }
              }
              const t = Math.min(1.0, (elapsedMs - 50) / 350);
              const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
              hammerMesh.rotation.x = -0.15 - (0.6 * easeT);
            } else {
              hammerMesh.rotation.x = -0.15;
            }
          } else {
            // Phase 2: Bringing to bear / aiming
            hammerMesh.rotation.x = -0.75; // Locked back
            
            gunGroup.position.lerp(finalAimPos, damp(0.18));
            gunGroup.rotation.x = gunGroup.rotation.x * (1 - damp(0.18)) + finalAimRot.x * damp(0.18);
            gunGroup.rotation.y = gunGroup.rotation.y * (1 - damp(0.18)) + finalAimRot.y * damp(0.18);
            gunGroup.rotation.z = gunGroup.rotation.z * (1 - damp(0.18)) + finalAimRot.z * damp(0.18);
          }

          // Add heavy realistic trembles under breathing and cold blood (after 900ms)
          if (elapsedMs > 900) {
            const tremblingIntensity = ((elapsedMs - 900) / 900) * 0.015;
            gunGroup.position.x += (Math.random() - 0.5) * tremblingIntensity * deltaScale;
            gunGroup.position.y += (Math.random() - 0.5) * tremblingIntensity * deltaScale;
            gunGroup.position.z += (Math.random() - 0.5) * tremblingIntensity * deltaScale;

            // Nerve-wracking deep gun sway
            gunGroup.rotation.x += Math.sin(time * 30.0) * tremblingIntensity * 0.15;
            gunGroup.rotation.y += Math.cos(time * 25.0) * tremblingIntensity * 0.15;
            
            // Camera subtle vibration tracking panic/heartbeats
            ar.cameraShakeIntensity = ar.cameraShakeIntensity * (1 - damp(0.08)) + tremblingIntensity * 1.5;
          }

          // Add dynamic, realistic nerve-wracking gamepad vibrations when aiming (only for player shooter)
          if (ar.animShooter === 'player') {
            const now = Date.now();
            if (elapsedMs < 900) {
              // Faint slow heartbeat: once every 450ms
              if (!ar.lastAimVibrateTime || now - ar.lastAimVibrateTime >= 450) {
                ar.lastAimVibrateTime = now;
                vibrateGamepad('rumble', { duration: 80, weak: 0.10, strong: 0.01 });
              }
            } else {
              // Anxiety peaks: rapid/erratic nerve shakes vibrating faster (150ms - 90ms interval) for immersion
              const shakeFactor = Math.min(1.0, (elapsedMs - 900) / 900); // 0 to 1
              const interval = 150 - (shakeFactor * 60); // 150ms down to 90ms
              if (now - ar.lastAimVibrateTime >= interval) {
                ar.lastAimVibrateTime = now;
                // Vibration intensity increases dynamically from 0.12 to 0.32
                const weakIntensity = 0.12 + (shakeFactor * 0.20);
                const strongIntensity = 0.02 + (shakeFactor * 0.05);
                vibrateGamepad('rumble', {
                  duration: Math.round(interval * 0.8),
                  weak: weakIntensity,
                  strong: strongIntensity
                });
              }
            }
          }

        } else {
          // --- THE DISCHARGE OR DRY BLANK CLICK MOMENTS ---
          hammerMesh.rotation.x = -0.15; // hammer snaps instantly forward!

          if (!ar.hasDischarged) {
            ar.hasDischarged = true;
            ar.lastFireTime = Date.now();

            if (ar.animIsLive) {
              ar.lastFireIsLive = true;

              // Direct Visceral Camera Kickback
              if (ar.animTarget === 'player') {
                // Player gets shot by Dealer or Self
                ar.cameraKickZ = 0.62; // Violent backward jolt on camera
                ar.cameraKickPitch = -0.38; // Upward camera pitch kick
                ar.cameraKickRoll = (Math.random() > 0.5 ? 0.22 : -0.22); // Impact roll
                ar.cameraShakeIntensity = 4.8;

                spawnScreenSplat();
                setTimeout(spawnScreenSplat, 100);
                setTimeout(spawnScreenSplat, 250);
                vibrateGamepad('jolt', { duration: 250, weak: 1.0, strong: 1.0 });
              } else {
                // Player shoots Dealer or Dealer shoots self
                ar.cameraKickZ = 0.32; // Firing heavy gun kickback
                ar.cameraKickPitch = -0.22; // Muzzle climb
                ar.cameraKickRoll = (Math.random() > 0.5 ? 0.09 : -0.09);
                ar.cameraShakeIntensity = 3.6;

                vibrateGamepad('jolt', { duration: 180, weak: 0.8, strong: 0.9 });
              }

              if (ar.animTarget === 'dealer') {
                stateRef.current.dealerFlinchTime = Date.now();
                const muzzleWorldPos = new THREE.Vector3(0, 0.18, 0.9).applyMatrix4(gunGroup.matrixWorld);
                spawnParticles(muzzleWorldPos, 0x880000, 80, 0.45, 0.002, 'BLOOD');
              }

              const muzzleWorldPos = new THREE.Vector3(0, 0.18, 0.9).applyMatrix4(gunGroup.matrixWorld);
              const chamberWorldPos = new THREE.Vector3(0.12, 0.12, -0.15).applyMatrix4(gunGroup.matrixWorld);

              // 1. Real bullet projectile trajectory + ejected spent brass casing
              spawnParticles(muzzleWorldPos, 0xcc9900, 1, 0.85, 0.0001, 'BULLET');
              spawnParticles(chamberWorldPos, 0xd4af37, 1, 0.16, 0.0038, 'SHELL');

              // 2. Spark particles, heavy smoke & blood splatter
              spawnParticles(muzzleWorldPos, 0xffaa00, 85, 0.5, 0.001, 'SPARK'); 
              spawnParticles(muzzleWorldPos, 0xd01010, 800, 0.85, 0.0035, 'BLOOD'); // Massively intense visceral blood splatter!
              spawnParticles(muzzleWorldPos, 0xaaaaaa, 65, 0.65, -0.0018, 'SMOKE');
            } else {
              // Dry blank click -> extremely subtle mechanical click feedback
              ar.lastFireIsLive = false;
              ar.cameraShakeIntensity = 0.04;
              ar.cameraKickZ = 0.005;
              ar.cameraKickPitch = -0.003;

              const chamberWorldPos = new THREE.Vector3(0.12, 0.12, -0.15).applyMatrix4(gunGroup.matrixWorld);
              spawnParticles(chamberWorldPos, 0x1e8bc3, 1, 0.12, 0.0038, 'SHELL');
            }
          }

          // --- RECOIL SETTLE AND RETURNING HOME ---
          const recoilAge = Math.max(0, elapsedMs - 1800);

          if (recoilAge < 500) {
            // Settle holding post-fire phase
            const settlePos = new THREE.Vector3();
            let settleRotX = 0;
            let settleRotY = 0;

            if (ar.animShooter === 'player') {
              if (ar.animTarget === 'player') {
                settlePos.set(0, 1.45, 1.25);
                settleRotX = 0.5;
              } else {
                settlePos.set(0, 1.35, -0.5);
                settleRotX = 0.2;
                settleRotY = Math.PI;
              }
            } else {
              if (ar.animTarget === 'player') {
                settlePos.set(0, 1.4, -1.65);
                settleRotX = 0.4;
              } else {
                settlePos.set(0, 1.5, -2.05);
                settleRotX = 0.25;
                settleRotY = Math.PI;
              }
            }

            let recoilBasePos = settlePos.clone();
            let recoilRotX = settleRotX;

            if (ar.lastFireIsLive) {
               // Smooth realistic kickback for an active shot
               let kickForce = 0;
               if (recoilAge <= 50) {
                 kickForce = Math.sin((recoilAge / 50) * (Math.PI / 2));
               } else {
                 const fade = 1.0 - ((recoilAge - 50) / 450);
                 kickForce = fade * fade * fade; // cubic ease out
               }

               if (ar.animTarget === 'player') {
                 recoilBasePos.z -= 0.85 * kickForce;
                 recoilRotX += 1.0 * kickForce;
               } else {
                 recoilBasePos.z += 0.85 * kickForce;
                 recoilRotX -= 1.0 * kickForce;
               }
            } else {
               // Dry blank click
               let kickForce = 0;
               if (recoilAge <= 30) {
                 kickForce = Math.sin((recoilAge / 30) * (Math.PI / 2));
               } else if (recoilAge < 200) {
                 const fade = 1.0 - ((recoilAge - 30) / 170);
                 kickForce = fade * fade;
               }
               if (ar.animTarget === 'player') {
                 recoilBasePos.z -= 0.015 * kickForce;
               } else {
                 recoilBasePos.z += 0.015 * kickForce;
               }
            }

            // Bind smoothly to the recoil curve
            gunGroup.position.lerp(recoilBasePos, damp(0.4));
            gunGroup.rotation.x = gunGroup.rotation.x * (1 - damp(0.4)) + recoilRotX * damp(0.4);
            gunGroup.rotation.y = gunGroup.rotation.y * (1 - damp(0.4)) + settleRotY * damp(0.4);
          } else {
            // Lower cleanly back to the wooden tabletop
            gunGroup.position.lerp(initialGunPos, damp(0.16));
            gunGroup.rotation.x = gunGroup.rotation.x * (1 - damp(0.16)) + initialGunRot.x * damp(0.16);
            gunGroup.rotation.y = gunGroup.rotation.y * (1 - damp(0.16)) + initialGunRot.y * damp(0.16);
            gunGroup.rotation.z = gunGroup.rotation.z * (1 - damp(0.16)) + initialGunRot.z * damp(0.16);
          }
        }

      } else {
        // --- IDLE STATE ---
        ar.activeShootAnimationState = 'IDLE';
        ar.activeShootStartTime = 0;
        ar.hasDischarged = false;
        
        // Ensure hammer is resting
        hammerMesh.rotation.x = -0.15;

        // Perfectly flat wooden table top resting sways/coordinates
        gunGroup.position.lerp(initialGunPos, damp(0.16));
        gunGroup.rotation.x = gunGroup.rotation.x * (1 - damp(0.16)) + initialGunRot.x * damp(0.16);
        gunGroup.rotation.y = gunGroup.rotation.y * (1 - damp(0.16)) + initialGunRot.y * damp(0.16);
        gunGroup.rotation.z = gunGroup.rotation.z * (1 - damp(0.16)) + initialGunRot.z * damp(0.16);
      }


      // --- AMBIENT ANIMS ON INVENTORY ITEMS ---
      playerItemMeshes.forEach((mesh, idx) => {
        mesh.position.y = Math.sin(time * 2.0 + idx * 0.7) * 0.03;
        mesh.rotation.y = Math.cos(time * 0.6 + idx * 0.5) * 0.08;

        // Interactive states hovering/gamepad tracking highlights
        const isHovered = hoveredMesh === mesh;
        const isSelected = isHovered;
        const currentInputType = getControllerSettings().inputType || 'kbm';

        if (isSelected && latest.showControls) {
          if (currentInputType === 'gamepad') {
            mesh.position.y += 0.25 + Math.sin(time * 8.0) * 0.03;
          }
          mesh.rotation.y += 0.08 * deltaScale;
          mesh.scale.setScalar(1.24);
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              if ('emissive' in child.material) {
                (child.material as any).emissive.setHex(0x350d0d);
              }
            }
          });
        } else {
          mesh.scale.setScalar(1.0);
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              if ('emissive' in child.material) {
                (child.material as any).emissive.setHex(0);
              }
            }
          });
        }
      });

      // Dealer slow item floating sways
      dealerItemMeshes.forEach((mesh, idx) => {
        mesh.position.y = Math.sin(time * 1.5 + idx * 0.6) * 0.02;
        mesh.rotation.y = Math.sin(time * 0.5 + idx * 0.3) * 0.05;
      });


      // --- IMMERSIVE REALISTIC ITEM ANIMATIONS ENGINE ---
      if (latest.gameState === 'ITEM_USE') {
        if (!ar.activeItemAnimType) {
          // Parse which item is being used from latest.message
          // Format is: "You used MIRROR." or "The Dealer used MIRROR."
          const msg = latest.message;
          const userStr = msg.includes("The Dealer") ? 'dealer' : 'player';
          
          let foundType: ItemType | null = null;
          const itemsList: ItemType[] = ['MIRROR', 'PLIERS', 'WHISKEY', 'TOURNIQUET', 'PENTAGRAM', 'CIGARETTE', 'SCALPEL', 'DEFIBRILLATOR', 'SYRINGE', 'RAZORBLADE'];
          for (const item of itemsList) {
            if (msg.includes(item)) {
              foundType = item;
              break;
            }
          }
          
          if (foundType) {
            ar.activeItemAnimType = foundType;
            ar.hasEjectedPliers = false;
            ar.hasSlammedSyringe = false;
            ar.hasCappedSyringe = false;
            ar.hasSlicedRazor = false;
            ar.hasLitCigarette = false;
            ar.hasExhaledSmoke = false;
            ar.activeItemAnimUser = userStr;
            ar.activeItemAnimStartTime = Date.now();
            
            // Build the floating item mesh representation
            ar.activeItemAnimGroup = createItemMesh(foundType);
            scene.add(ar.activeItemAnimGroup);
            
            // Initial positioning
            if (userStr === 'player') {
              ar.activeItemAnimGroup.position.set(0.6, 0.6, 0.8); // player's hand side
            } else {
              ar.activeItemAnimGroup.position.set(-0.8, 0.6, -1.6); // dealer's side
            }
          }
        }
      } else {
        // Not in ITEM_USE state, toss active item into physics if present
        if (ar.activeItemAnimGroup) {
          discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
          ar.activeItemAnimGroup = null;
        }
        ar.activeItemAnimType = null;
        ar.activeItemAnimStartTime = 0;
      }

      // Anim loop calculations for used item
      if (ar.activeItemAnimType && ar.activeItemAnimGroup) {
        const rawSec = (Date.now() - ar.activeItemAnimStartTime) / 1000.0;
        const elapsedSec = rawSec * 1.25;
        const currentIsLive = latest.chambers[latest.currentChamberIndex]?.isLive || false;
        
        switch (ar.activeItemAnimType) {
          case 'MIRROR': {
            const isPlayer = ar.activeItemAnimUser === 'player';
            // Gun is at (0, 0.62, -0.4). Hold mirror just behind it to reflect chamber.
            const targetP = isPlayer ? new THREE.Vector3(0, 0.95, -0.1) : new THREE.Vector3(0, 0.95, -0.7);
            const targetRotX = isPlayer ? Math.PI / 3.5 : -Math.PI / 3.5;
            
            if (elapsedSec < 1.2) {
              const t = elapsedSec / 1.2;
              const easeT = 1 - Math.pow(1 - t, 3);
              const startPos = isPlayer ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6);
              ar.activeItemAnimGroup.position.lerpVectors(startPos, targetP, easeT);
              ar.activeItemAnimGroup.rotation.set(targetRotX * easeT, 0, 0);
              
              if (!isPlayer) {
                ar.dealerHeadTiltFactor = easeT * 0.15; // Lean in
              }
            } else if (elapsedSec < 2.8) {
              // Held relatively steady, slight human jitter
              ar.activeItemAnimGroup.position.copy(targetP);
              ar.activeItemAnimGroup.position.y += Math.sin(time * 4) * 0.005;
              ar.activeItemAnimGroup.rotation.set(targetRotX + Math.sin(time * 15) * 0.01, 0, 0);
              
              if (!isPlayer) {
                ar.dealerHeadTiltFactor = 0.15;
                ar.dealerMouthOpenFactor = 0.1;
              }
            } else {
              // Physics drop off
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
              
            }
            break;
          }
          case 'PLIERS': {
            const isPlayer = ar.activeItemAnimUser === 'player';
            // Gun is at (0, 0.62, -0.4). Cylinder is roughly at (0, 0.9, -0.2)
            const targetP = new THREE.Vector3(0, 0.9, -0.2);
            
            if (elapsedSec < 1.3) {
              // Hand brings pliers to barrel cylinder eject area
              const t = elapsedSec / 1.3;
              const easeT = 1 - Math.pow(1 - t, 3);
              const startPos = isPlayer ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6);
              ar.activeItemAnimGroup.position.lerpVectors(startPos, targetP, easeT);
              
              // Angle slightly pointing towards cylinder
              ar.activeItemAnimGroup.rotation.set((isPlayer ? Math.PI/6 : -Math.PI/6) * easeT, 0, 0);
              
              if (!isPlayer) {
                ar.dealerHeadTiltFactor = easeT * 0.15; // leans in
              }
            } else if (elapsedSec < 2.2) {
              // Grip, squeeze & eject
              ar.activeItemAnimGroup.position.set(0, 0.9, -0.2 + Math.sin(time * 20) * 0.01);
              ar.activeItemAnimGroup.rotation.set((isPlayer ? Math.PI/6 : -Math.PI/6), 0, 0);
              
              // Squeeze mechanism: rotate the duplicate joints together
              ar.activeItemAnimGroup.children.forEach(child => {
                if (child.position.x < 0) child.rotation.z = Math.max(0.08, 0.35 - (elapsedSec - 1.3) * 0.4);
                if (child.position.x > 0) child.rotation.z = Math.min(-0.08, -0.35 + (elapsedSec - 1.3) * 0.4);
              });
              
              if (!isPlayer) {
                ar.dealerHeadTiltFactor = 0.2;
                ar.dealerMouthOpenFactor = 0.1;
              }

              // Ejection moment around 1.5s
              if (elapsedSec >= 1.5 && elapsedSec <= 1.55 && !ar.hasEjectedPliers) {
                ar.hasEjectedPliers = true;
                import('../audio').then(a => a.playPliersSound());
                vibrateGamepad('rumble', { duration: 110, weak: 0.85, strong: 0.15 }); // Subtle but distinct vibration jolt when extracting bullet
                spawnParticles(new THREE.Vector3(0, 0.7, -0.2), 0xdd8833, 8, 0.08, 0.002, 'SPARK');
                
                // Spawn brass shell physical block
                const brassGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 5);
                const brassMatOnEject = new THREE.MeshStandardMaterial({ color: 0xcca300, metalness: 0.9, roughness: 0.2 });
                const brassC = new THREE.Mesh(brassGeo, brassMatOnEject);
                brassC.position.set(0, 0.7, -0.2);
                scene.add(brassC);
                
                // Launch physics simulation for ejection shell!
                const ejectVelocity = new THREE.Vector3(
                  0.12 + Math.random() * 0.08,
                  0.08 + Math.random() * 0.08,
                  -0.05 + (Math.random() - 0.5) * 0.05
                );
                
                activeParticles.push({
                  mesh: brassC,
                  velocity: ejectVelocity,
                  life: 0,
                  maxLife: 110,
                  gravity: 0.004,
                  hasLanded: false,
                  type: 'SHELL',
                  bounceCount: 0
                });
              }
            } else {
              // Physics toss off
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
              
            }
            break;
          }
          case 'WHISKEY': {
            const isPlayer = ar.activeItemAnimUser === 'player';
            const lipsPos = isPlayer ? new THREE.Vector3(0, 1.3, 1.8) : new THREE.Vector3(0, 2.12, -2.64);
            const localSpout = new THREE.Vector3(0, 0.46, 0);

            let liquidMesh: THREE.Mesh | null = null;
            let meniscusMesh: THREE.Mesh | null = null;
            let corkMesh: THREE.Mesh | null = null;
            ar.activeItemAnimGroup.traverse((child) => {
              if (child.name === 'whiskeyLiquidMesh') liquidMesh = child as THREE.Mesh;
              if (child.name === 'whiskeyMeniscus') meniscusMesh = child as THREE.Mesh;
              if (child.name === 'whiskeyCork') corkMesh = child as THREE.Mesh;
            });

            if (elapsedSec < 1.2) {
              const t = elapsedSec / 1.2;
              const startPos = isPlayer ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6);
              
              ar.activeItemAnimGroup.rotation.set(isPlayer ? Math.PI / 4 : -Math.PI / 4, 0, 0);
              
              const targetSpoutOffset = localSpout.clone().applyEuler(ar.activeItemAnimGroup.rotation);
              const targetGroupPos = lipsPos.clone().sub(targetSpoutOffset);
              
              ar.activeItemAnimGroup.position.lerpVectors(startPos, targetGroupPos, t);
              
              if (!isPlayer) {
                ar.dealerMouthOpenFactor = t * 0.5;
                ar.dealerHeadTiltFactor = t * 0.4;
              }

              // Liquid sloshes in bottle during pickup
              if (liquidMesh && meniscusMesh) {
                const sloshWave = Math.sin(time * 12) * 0.02;
                liquidMesh.rotation.z = sloshWave;
                meniscusMesh.position.y = 0.315 + sloshWave * 0.5;
              }
            } else if (elapsedSec < 3.0) {
              // Pop cork on first frame of drinking
              if (corkMesh && corkMesh.visible) {
                corkMesh.visible = false;
                const corkWorldPos = new THREE.Vector3(0, 0.46, 0).applyMatrix4(ar.activeItemAnimGroup.matrixWorld);
                spawnParticles(corkWorldPos, 0x8b5a2b, 1, 0.15, 0.003, 'SHELL');
              }

              const tiltT = Math.min(1.0, (elapsedSec - 1.2) / 0.8);
              const drainT = Math.min(1.0, (elapsedSec - 1.2) / 1.6);
              
              const rotX = isPlayer ? 
                (Math.PI / 4 + tiltT * Math.PI * 0.48) : 
                (-Math.PI / 4 - tiltT * Math.PI * 0.48);

              ar.activeItemAnimGroup.rotation.set(
                rotX,
                0,
                tiltT * (isPlayer ? 0.3 : -0.3)
              );
              
              const currentSpoutOffset = localSpout.clone().applyEuler(ar.activeItemAnimGroup.rotation);
              ar.activeItemAnimGroup.position.copy(lipsPos).sub(currentSpoutOffset);

              if (!isPlayer) {
                ar.dealerMouthOpenFactor = 1.0;
                ar.dealerHeadTiltFactor = 1.0;
              }

              // Realistic Liquid Level & Sloshing Drain Physics
              if (liquidMesh && meniscusMesh) {
                const remainingRatio = Math.max(0.01, 1.0 - drainT);
                liquidMesh.scale.y = remainingRatio;
                liquidMesh.position.y = 0.16 * remainingRatio;
                
                const sloshWave = Math.sin(time * 18) * 0.03 * remainingRatio;
                meniscusMesh.position.y = 0.315 * remainingRatio + sloshWave;
                meniscusMesh.scale.set(remainingRatio, remainingRatio, remainingRatio);
              }
              
              const spoutPos = localSpout.clone().applyMatrix4(ar.activeItemAnimGroup.matrixWorld);
              
              if (Math.random() < 0.65 && drainT < 0.95) {
                spawnParticles(spoutPos, 0xdf8a1c, 4, 0.04, 0.003, 'LIQUID');
                spawnParticles(spoutPos, 0xf59e0b, 2, 0.02, 0.002, 'LIQUID');
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'TOURNIQUET': {
            if (elapsedSec < 1.2) {
              const t = elapsedSec / 1.2;
              const targetP = ar.activeItemAnimUser === 'player' ? new THREE.Vector3(0, 1.2, 1.8) : new THREE.Vector3(0, 1.6, -1.85);
              ar.activeItemAnimGroup.position.lerpVectors(
                ar.activeItemAnimUser === 'player' ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6),
                targetP,
                t
              );
              ar.activeItemAnimGroup.rotation.set(0.2, time * 3, 0);
            } else if (elapsedSec < 2.8) {
              // Tension snaps
              ar.activeItemAnimGroup.position.y += Math.sin(time * 30) * 0.015;
              ar.activeItemAnimGroup.rotation.set(0.2, time * 12, Math.sin(time * 15) * 0.2);
              
              if (Math.random() < 0.35) {
                const targetWorldPos = new THREE.Vector3();
                ar.activeItemAnimGroup.getWorldPosition(targetWorldPos);
                spawnParticles(targetWorldPos, 0xffaa00, 3, 0.1, 0.001, 'SPARK'); // Sparks of jolt/friction!
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'PENTAGRAM': {
            if (elapsedSec < 1.2) {
              const t = elapsedSec / 1.2;
              const targetP = new THREE.Vector3(0, 1.4, -0.6); // dead center under spot!
              ar.activeItemAnimGroup.position.lerpVectors(
                ar.activeItemAnimUser === 'player' ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6),
                targetP,
                t
              );
              ar.activeItemAnimGroup.rotation.set(0, time * 5, 0);
            } else if (elapsedSec < 2.8) {
              // Rapid wild rotation in space
              ar.activeItemAnimGroup.rotation.y = time * 35;
              ar.activeItemAnimGroup.position.set(0, 1.4 + Math.sin(time * 18) * 0.04, -0.6);
              
              // Emitters of the FIVE pillars of crimson bloody sparks!
              if (Math.random() < 0.38) {
                for (let i = 0; i < 5; i++) {
                  const angle = (i / 5) * Math.PI * 2;
                  const px = Math.cos(angle) * 1.5;
                  const pz = Math.sin(angle) * 1.5 - 0.6;
                  // Blood sparks rising upwards
                  spawnParticles(new THREE.Vector3(px, 0.45, pz), 0xd01010, 4, 0.05, -0.0018, 'BLOOD'); // Negative gravity rises!
                }
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'CIGARETTE': {
            const isPlayerUser = ar.activeItemAnimUser === 'player';
            const lipsPos = isPlayerUser 
              ? new THREE.Vector3(0, 1.35, 1.8) // Near player mouth
              : new THREE.Vector3(0, 1.95, -2.45); // Near dealer mouth

            const cigGroupInner = ar.activeItemAnimGroup.getObjectByName('cigGroupInner');
            const emberTip = ar.activeItemAnimGroup.getObjectByName('emberTip');
            const cigPack = ar.activeItemAnimGroup.getObjectByName('cigPack');

            if (cigPack) cigPack.visible = false;

            // Dynamically instantiate Zippo lighter into active item group for separate lighting action
            let zippoGroup = ar.activeItemAnimGroup.getObjectByName('zippoGroup') as THREE.Group | undefined;
            if (!zippoGroup) {
              zippoGroup = createZippoMesh();
              ar.activeItemAnimGroup.add(zippoGroup);
            }

            const zippoCap = zippoGroup.getObjectByName('zippoCap');
            const zippoFlame = zippoGroup.getObjectByName('zippoFlame');

            if (elapsedSec < 1.2) {
              // Phase 1: Bring cigarette up to lips, lighter hidden below
              const t = elapsedSec / 1.2;
              const easeT = 1 - Math.pow(1 - t, 3);
              const startPos = isPlayerUser ? new THREE.Vector3(0.5, 0.5, 0.8) : new THREE.Vector3(-0.6, 0.6, -1.6);
              
              const currentPos = new THREE.Vector3().lerpVectors(startPos, lipsPos, easeT);
              ar.activeItemAnimGroup.position.copy(currentPos);
              
              ar.activeItemAnimGroup.rotation.set(
                isPlayerUser ? (-Math.PI / 2.2) * easeT : (Math.PI / 2.2) * easeT,
                0,
                0
              );

              if (cigGroupInner) {
                cigGroupInner.rotation.z = (Math.PI / 2) * (1 - easeT);
                cigGroupInner.position.y = 0.02 * (1 - easeT) - 0.12 * easeT;
              }

              // Keep Zippo hidden below offscreen during initial cigarette movement
              zippoGroup.visible = false;
              zippoGroup.position.set(isPlayerUser ? 0.18 : -0.18, -0.6, isPlayerUser ? 0.1 : -0.1);

              if (!isPlayerUser) {
                ar.dealerMouthOpenFactor = easeT * 0.4;
                ar.dealerHeadTiltFactor = easeT * 0.4;
              }
            } else if (elapsedSec < 3.4) {
              // Phase 2: Pull out Zippo lighter, flick open cap, strike flint, ignite flame, light cigarette, and lower lighter
              ar.activeItemAnimGroup.position.copy(lipsPos);
              ar.activeItemAnimGroup.rotation.set(
                isPlayerUser ? -Math.PI / 2.2 : Math.PI / 2.2,
                0,
                0
              );

              if (cigGroupInner) {
                cigGroupInner.rotation.z = 0;
                cigGroupInner.position.y = -0.12;
              }

              if (!isPlayerUser) {
                ar.dealerMouthOpenFactor = 0.45;
                ar.dealerHeadTiltFactor = 0.55;
              }

              zippoGroup.visible = true;
              const phase2T = elapsedSec - 1.2; // 0.0 to 2.2s

              if (phase2T < 0.5) {
                // Subphase A: Lighter rises up from hand height to beside cigarette tip
                const raiseT = phase2T / 0.5;
                const easeR = raiseT < 0.5 ? 2 * raiseT * raiseT : -1 + (4 - 2 * raiseT) * raiseT;
                
                const startLighterY = -0.6;
                const targetLighterY = -0.05;
                const lighterY = startLighterY * (1 - easeR) + targetLighterY * easeR;

                zippoGroup.position.set(
                  isPlayerUser ? 0.12 : -0.12,
                  lighterY,
                  isPlayerUser ? -0.1 : 0.1
                );
                zippoGroup.rotation.set(0, isPlayerUser ? -0.3 : 0.3, 0);

                if (zippoCap) zippoCap.rotation.z = 0;
                if (zippoFlame) zippoFlame.visible = false;
              } else if (phase2T < 0.9) {
                // Subphase B: Smoothly flick cap open
                const capT = (phase2T - 0.5) / 0.4;
                const easeC = capT < 0.5 ? 2 * capT * capT : -1 + (4 - 2 * capT) * capT;

                zippoGroup.position.set(
                  isPlayerUser ? 0.12 : -0.12,
                  -0.05,
                  isPlayerUser ? -0.1 : 0.1
                );
                if (zippoCap) {
                  zippoCap.rotation.z = -Math.PI * 0.7 * easeC;
                }
                if (zippoFlame) zippoFlame.visible = false;
              } else if (phase2T < 1.7) {
                // Subphase C: Strike flint, ignite flame, heat tobacco tip
                zippoGroup.position.set(
                  isPlayerUser ? 0.12 : -0.12,
                  -0.05,
                  isPlayerUser ? -0.1 : 0.1
                );
                if (zippoCap) zippoCap.rotation.z = -Math.PI * 0.7;

                if (!ar.hasLitCigarette) {
                  ar.hasLitCigarette = true;
                  import('../audio').then(a => a.playCigaretteLighting());
                  vibrateGamepad(isPlayerUser ? 'weak' : 'weak', { duration: 180, weak: 0.4, strong: 0.2 });
                }

                if (zippoFlame) {
                  zippoFlame.visible = true;
                  const flicker = 0.85 + Math.sin(elapsedSec * 45.0) * 0.2 + Math.cos(elapsedSec * 28.0) * 0.1;
                  zippoFlame.scale.set(flicker, flicker * (1 + Math.sin(elapsedSec * 35.0) * 0.15), flicker);
                }

                const lighterTipPos = lipsPos.clone();
                lighterTipPos.x += (isPlayerUser ? 0.06 : -0.06);
                lighterTipPos.y -= (isPlayerUser ? 0.04 : -0.04);

                // Initial spark burst on flint wheel strike
                if (phase2T < 1.1 && Math.random() < 0.85) {
                  spawnParticles(lighterTipPos, 0xffaa00, 6, 0.07, 0.002, 'SPARK');
                  spawnParticles(lighterTipPos, 0xff3300, 4, 0.05, 0.001, 'SPARK');
                }

                // Heat up cigarette ember tip as flame catches tobacco
                if (emberTip && (emberTip as THREE.Mesh).material instanceof THREE.MeshStandardMaterial) {
                  const heatT = (phase2T - 0.9) / 0.8;
                  ((emberTip as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 2.0 + heatT * 3.5 + Math.sin(elapsedSec * 30.0) * 0.8;
                }

                // Wisps of blue-gray smoke rising from tip
                const cigTipPos = lipsPos.clone();
                cigTipPos.z += (isPlayerUser ? -0.15 : 0.15);
                if (Math.random() < 0.6) {
                  spawnParticles(cigTipPos, 0xaaaaaa, 2, 0.02, 0.001, 'SMOKE');
                }
              } else {
                // Subphase D: Snap cap shut, extinguish flame, retract lighter back down
                const retractT = (phase2T - 1.7) / 0.5;
                const easeRetract = retractT < 0.5 ? 2 * retractT * retractT : -1 + (4 - 2 * retractT) * retractT;

                if (zippoCap) zippoCap.rotation.z = 0;
                if (zippoFlame) zippoFlame.visible = false;

                const startY = -0.05;
                const endY = -0.6;
                zippoGroup.position.set(
                  isPlayerUser ? 0.12 : -0.12,
                  startY * (1 - easeRetract) + endY * easeRetract,
                  isPlayerUser ? -0.1 : 0.1
                );

                if (retractT >= 0.95) {
                  zippoGroup.visible = false;
                }
              }
            } else if (elapsedSec < 5.4) {
              // Phase 3: Deep Inhale Drag on Cigarette
              zippoGroup.visible = false;

              ar.activeItemAnimGroup.position.copy(lipsPos);

              const dragT = (elapsedSec - 3.4) / 2.0;
              const cherryIntensity = Math.sin(dragT * Math.PI) * 0.035;
              ar.activeItemAnimGroup.position.z += (isPlayerUser ? -cherryIntensity : cherryIntensity);

              if (!isPlayerUser) {
                ar.dealerMouthOpenFactor = 0.3 + Math.sin(dragT * Math.PI) * 0.2;
                ar.dealerHeadTiltFactor = 0.8;
              }

              // Glowing cherry burning hot on deep drag
              if (emberTip && (emberTip as THREE.Mesh).material instanceof THREE.MeshStandardMaterial) {
                ((emberTip as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 4.0 + Math.sin(dragT * Math.PI) * 3.5;
              }

              // Hot ember sparks and tip smoke during deep inhalation
              const cigTipPos = lipsPos.clone();
              cigTipPos.z += (isPlayerUser ? -0.15 : 0.15);
              
              if (Math.random() < 0.8) {
                spawnParticles(cigTipPos, 0xff4400, 3, 0.03, 0.001, 'SPARK');
                spawnParticles(cigTipPos, 0xdddddd, 3, 0.03, 0.002, 'SMOKE');
              }

              // Subtle camera tremor representing deep inhalation drag
              if (isPlayerUser && Math.random() < 0.45) {
                camera.position.x += (Math.random() - 0.5) * 0.006;
                camera.position.y += (Math.random() - 0.5) * 0.006;
              }
            } else if (elapsedSec < 7.2) {
              // Phase 4: Lower Cigarette & Exhale Dense Volumetric Smoke Plume
              zippoGroup.visible = false;

              const exhaleT = (elapsedSec - 5.4) / 1.8;
              
              // Lower cigarette away from mouth
              const lowerPos = lipsPos.clone();
              lowerPos.y -= 0.22 * exhaleT;
              lowerPos.x += (isPlayerUser ? 0.18 : -0.18) * exhaleT;
              ar.activeItemAnimGroup.position.copy(lowerPos);
              
              if (!isPlayerUser) {
                ar.dealerMouthOpenFactor = 0.85;
                ar.dealerHeadTiltFactor = 0.5;
              }

              if (!ar.hasExhaledSmoke) {
                ar.hasExhaledSmoke = true;
                import('../audio').then(a => a.playSmokeExhale());
              }

              // Heavy dense smoke cloud billows out forward from mouth across screen
              const smokeSource = lipsPos.clone();
              smokeSource.y -= 0.02;
              
              if (Math.random() < 0.95) {
                spawnParticles(smokeSource, 0xe0e0e8, 9, 0.08, 0.0035, 'SMOKE');
                spawnParticles(smokeSource, 0xa0a0b0, 7, 0.10, 0.0045, 'SMOKE');
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'SCALPEL': {
            const isPlayer = ar.activeItemAnimUser === 'player';
            const handPos = isPlayer 
              ? new THREE.Vector3(0.1, 1.25, 1.5) 
              : new THREE.Vector3(-0.1, 1.55, -2.15);

            if (elapsedSec < 1.0) {
              // Phase 1: Bring scalpel up steadily to hand/gun height
              const t = elapsedSec / 1.0;
              const easeT = 1 - Math.pow(1 - t, 3);
              const startPos = isPlayer ? new THREE.Vector3(0.5, 0.5, 0.8) : new THREE.Vector3(-0.6, 0.6, -1.6);
              
              ar.activeItemAnimGroup.position.lerpVectors(startPos, handPos, easeT);
              ar.activeItemAnimGroup.rotation.set(
                isPlayer ? 0.35 : -0.35,
                isPlayer ? 0.2 : Math.PI - 0.2,
                isPlayer ? -0.15 : 0.15
              );

              if (!isPlayer) {
                ar.dealerHeadTiltFactor = easeT * 0.4;
              }
            } else if (elapsedSec < 2.5) {
              // Phase 2: Grounded, precise surgical incision slice across the shell/palm
              const sliceT = (elapsedSec - 1.0) / 1.5; // 0.0 to 1.0 over 1.5s
              
              // Smooth diagonal stroke arc
              const strokeX = (Math.sin(sliceT * Math.PI) - 0.5) * 0.18;
              const strokeY = Math.cos(sliceT * Math.PI) * 0.04;
              
              const currentCutPos = handPos.clone();
              currentCutPos.x += isPlayer ? strokeX : -strokeX;
              currentCutPos.y += strokeY;
              
              ar.activeItemAnimGroup.position.copy(currentCutPos);
              
              // Angle scalpel blade dynamically along the cut path
              ar.activeItemAnimGroup.rotation.set(
                (isPlayer ? 0.35 : -0.35) + Math.sin(sliceT * Math.PI) * 0.2,
                isPlayer ? 0.2 : Math.PI - 0.2,
                (isPlayer ? -0.15 : 0.15) + Math.cos(sliceT * Math.PI) * 0.3
              );

              // Sound & blood droplets at cut peak (sliceT around 0.3)
              if (sliceT >= 0.25 && sliceT <= 0.35 && !ar.hasEjectedPliers) { // reused single-shot flag
                ar.hasEjectedPliers = true;
                import('../audio').then(a => a.playScalpelCut());
                vibrateGamepad(isPlayer ? 'jolt' : 'weak', { duration: 120, weak: 0.6, strong: 0.8 });
                
                if (isPlayer) {
                  ar.cameraShakeIntensity = 0.5;
                }

                // Fine visceral blood droplets spray from incision point
                const cutWorldPos = handPos.clone();
                spawnParticles(cutWorldPos, 0xbd0909, 18, 0.08, -0.001, 'BLOOD');
                spawnParticles(cutWorldPos, 0x800000, 12, 0.05, -0.0012, 'BLOOD');
              }

              // Subtle blood mist continuation during slice
              if (sliceT > 0.3 && sliceT < 0.7 && Math.random() < 0.35) {
                const cutWorldPos = currentCutPos.clone();
                spawnParticles(cutWorldPos, 0xcc1111, 3, 0.03, -0.001, 'BLOOD');
              }

              if (!isPlayer) {
                ar.dealerHeadTiltFactor = 0.6;
              }
            } else if (elapsedSec < 3.8) {
              // Phase 3: Lower and discard scalpel
              const discardT = (elapsedSec - 2.5) / 1.3;
              const lowerPos = handPos.clone();
              lowerPos.y -= discardT * 0.4;
              ar.activeItemAnimGroup.position.copy(lowerPos);
              ar.activeItemAnimGroup.rotation.x += discardT * 0.5;

              if (!isPlayer) {
                ar.dealerHeadTiltFactor = 0.6 * (1 - discardT);
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'DEFIBRILLATOR': {
            const isPlayer = ar.activeItemAnimUser === 'player';
            const chestPos = isPlayer ? new THREE.Vector3(0, 1.0, 1.45) : new THREE.Vector3(0, 1.4, -2.1);
            
            if (elapsedSec < 1.0) {
              const t = elapsedSec / 1.0;
              const easeT = 1 - Math.pow(1 - t, 3);
              const startPos = isPlayer ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6);
              ar.activeItemAnimGroup.position.lerpVectors(startPos, chestPos, easeT);
              
              ar.activeItemAnimGroup.rotation.set(
                (isPlayer ? -Math.PI / 4 : Math.PI / 4) * easeT, 
                0, 
                0
              );
              
              if (!isPlayer) {
                 ar.dealerHeadTiltFactor = easeT * -0.2;
              }
            } else if (elapsedSec < 2.0) {
              // Held against chest, charging up
              const currentP = chestPos.clone();
              // intense vibration as it charges
              currentP.x += Math.sin(time * 60) * 0.005;
              currentP.y += Math.cos(time * 60) * 0.005;
              ar.activeItemAnimGroup.position.copy(currentP);
              
              if (!isPlayer) {
                 ar.dealerHeadTiltFactor = -0.3; // leaning back
                 ar.dealerMouthOpenFactor = 0.4; // anticipating
              }
            } else if (elapsedSec < 2.5) {
              // SLAM / SHOCK
              const currentP = chestPos.clone();
              // the push back into the body
              currentP.z += (isPlayer ? 0.1 : -0.1); // press in
              ar.activeItemAnimGroup.position.copy(currentP);
              
              if (elapsedSec < 2.15) {
                  // ZAP sparks
                  if (Math.random() < 0.6) {
                    spawnParticles(ar.activeItemAnimGroup.position, 0x2288ff, 4, 0.16, 0.001, 'SPARK');
                  }
                  if (isPlayer) ar.cameraShakeIntensity = 0.5;
                  
                  if (!isPlayer) {
                     ar.dealerHeadTiltFactor = 0.6; // violently head back
                     ar.dealerMouthOpenFactor = 1.0; 
                  }
              } else {
                 if (!isPlayer) {
                     ar.dealerHeadTiltFactor = 0.1; // recovering
                     ar.dealerMouthOpenFactor = 0.2; 
                  }
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'SYRINGE': {
            let fluidMesh: THREE.Mesh | null = null;
            let meniscusMesh: THREE.Mesh | null = null;
            let bubbleMesh: THREE.Mesh | null = null;
            let stopperMesh: THREE.Mesh | null = null;
            let plungerMesh: THREE.Mesh | null = null;

            ar.activeItemAnimGroup.traverse((child) => {
              if (child.name === 'syringeFluid') fluidMesh = child as THREE.Mesh;
              if (child.name === 'syringeMeniscus') meniscusMesh = child as THREE.Mesh;
              if (child.name === 'syringeBubble') bubbleMesh = child as THREE.Mesh;
              if (child.name === 'syringeStopper') stopperMesh = child as THREE.Mesh;
              if (child.name === 'syringePlunger') plungerMesh = child as THREE.Mesh;
            });

            if (elapsedSec < 1.0) {
              const t = elapsedSec / 1.0;
              const targetP = ar.activeItemAnimUser === 'player' ? new THREE.Vector3(0.1, 1.3, 1.9) : new THREE.Vector3(-0.15, 1.9, -2.5);
              ar.activeItemAnimGroup.position.lerpVectors(
                ar.activeItemAnimUser === 'player' ? new THREE.Vector3(0.6, 0.6, 0.8) : new THREE.Vector3(-0.8, 0.6, -1.6),
                targetP,
                t
              );
              ar.activeItemAnimGroup.rotation.set(ar.activeItemAnimUser === 'player' ? -Math.PI / 2.5 : -Math.PI / 2.5, ar.activeItemAnimUser === 'player' ? 0 : Math.PI, Math.sin(time * 5) * 0.1);

              if (ar.activeItemAnimUser === 'dealer') {
                ar.dealerMouthOpenFactor = t * 0.4;
                ar.dealerHeadTiltFactor = t * -0.2;
              }

              // Liquid Wobble & Floating Air Bubble Physics in syringe during movement
              if (fluidMesh && bubbleMesh && meniscusMesh) {
                const fluidWobble = Math.sin(time * 16) * 0.02;
                fluidMesh.scale.x = 1.0 + fluidWobble;
                fluidMesh.scale.z = 1.0 - fluidWobble;
                bubbleMesh.position.x = Math.sin(time * 8) * 0.012;
                bubbleMesh.position.y = 0.28 + Math.cos(time * 10) * 0.008;
                meniscusMesh.position.y = 0.31 + fluidWobble * 0.1;
              }

              if (elapsedSec >= 0.3 && !ar.hasCappedSyringe) {
                ar.hasCappedSyringe = true;
                playSyringeCap();
                spawnParticles(ar.activeItemAnimGroup.position, 0xffffff, 4, 0.08, 0.001, 'SPARK');
              }
            } else if (elapsedSec < 2.5) {
              const tSlam = Math.min(1.0, (elapsedSec - 1.0) / 0.155);
              const targetP = ar.activeItemAnimUser === 'player' ? new THREE.Vector3(0.1, 1.3, 1.9) : new THREE.Vector3(-0.15, 1.9, -2.5);
              
              let offsetZ = 0;
              if (tSlam < 0.45) {
                offsetZ = (ar.activeItemAnimUser === 'player' ? -0.15 : 0.15) * (tSlam / 0.45);
              } else {
                offsetZ = (ar.activeItemAnimUser === 'player' ? 0.3 : -0.3) * ((tSlam - 0.45) / 0.55);
              }
              const currentP = targetP.clone();
              currentP.z += offsetZ;
              currentP.x += Math.sin(time * 40) * 0.002;
              ar.activeItemAnimGroup.position.copy(currentP);
              ar.activeItemAnimGroup.rotation.set(ar.activeItemAnimUser === 'player' ? -Math.PI / 2.5 : -Math.PI / 2.5, ar.activeItemAnimUser === 'player' ? 0 : Math.PI, 0);

              if (ar.activeItemAnimUser === 'dealer') {
                ar.dealerMouthOpenFactor = 0.8;
                ar.dealerHeadTiltFactor = 0.5;
              }

              if (elapsedSec >= 1.15 && !ar.hasSlammedSyringe) {
                ar.hasSlammedSyringe = true;
                playSyringeSlam();
                vibrateGamepad(ar.activeItemAnimUser === 'player' ? 'strong' : 'weak');
                
                const spillPos = ar.activeItemAnimGroup.position.clone();
                spillPos.y -= 0.05;
                spawnParticles(spillPos, 0xbf0909, 12, 0.06, 0.0015, 'BLOOD');
                if (ar.activeItemAnimUser === 'player') {
                  ar.cameraShakeIntensity = 0.4;
                }
              }

              if (elapsedSec >= 1.25) {
                const plungeProgress = Math.min(1.0, (elapsedSec - 1.25) / 1.0);
                const fluidRatio = Math.max(0.001, 1.0 - plungeProgress);

                if (plungerMesh) plungerMesh.position.y = 0.48 - plungeProgress * 0.11;
                if (stopperMesh) stopperMesh.position.y = 0.32 - plungeProgress * 0.20;

                if (fluidMesh) {
                  fluidMesh.scale.y = fluidRatio;
                  fluidMesh.position.y = 0.09 + fluidRatio * 0.11;
                }
                if (meniscusMesh) {
                  meniscusMesh.position.y = 0.09 + fluidRatio * 0.22;
                  meniscusMesh.scale.set(fluidRatio, fluidRatio, fluidRatio);
                }

                if (bubbleMesh) {
                  if (plungeProgress > 0.8) {
                    bubbleMesh.visible = false;
                  } else {
                    const bScale = Math.max(0.001, 1.0 - plungeProgress);
                    bubbleMesh.scale.set(bScale, bScale, bScale);
                    bubbleMesh.position.y = 0.09 + fluidRatio * 0.20;
                  }
                }

                if (Math.random() < 0.7) {
                  const needleTipWorldPos = new THREE.Vector3(0, -0.10, 0).applyMatrix4(ar.activeItemAnimGroup.matrixWorld);
                  spawnParticles(needleTipWorldPos, 0x00ffaa, 5, 0.05, 0.002, 'LIQUID');
                  spawnParticles(needleTipWorldPos, 0x33ffbb, 2, 0.03, 0.001, 'SPARK');
                }
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
          case 'RAZORBLADE': {
            const isPlayerUser = ar.activeItemAnimUser === 'player';
            const basePos = isPlayerUser 
              ? new THREE.Vector3(0.02, 1.35, 1.9) // Much closer and personal, neck/chest level
              : new THREE.Vector3(-0.02, 2.0, -2.5);

            if (elapsedSec < 0.75) {
              // Phase 1: Trembling tension approach to forearm
              const t = elapsedSec / 0.75;
              const easeT = 1 - Math.pow(1 - t, 3);
              const startPos = isPlayerUser ? new THREE.Vector3(0.5, 0.5, 0.9) : new THREE.Vector3(-0.6, 0.6, -1.7);
              
              const currentPos = new THREE.Vector3().lerpVectors(startPos, basePos, easeT);
              // Nervous shivering / tremor before cutting
              currentPos.x += Math.sin(time * 35.0) * 0.003;
              currentPos.y += Math.cos(time * 30.0) * 0.003;
              currentPos.z += Math.sin(time * 25.0) * 0.002;

              ar.activeItemAnimGroup.position.copy(currentPos);
              
              if (!isPlayerUser) {
                ar.dealerMouthOpenFactor = easeT * 0.2;
                ar.dealerHeadTiltFactor = easeT * -0.1;
              }

              // Angle the razor blade threateningly against skin
              ar.activeItemAnimGroup.rotation.set(
                isPlayerUser ? Math.PI / 3 + Math.sin(time * 20.0) * 0.05 : -Math.PI / 3,
                isPlayerUser ? Math.PI / 6 : -Math.PI / 6,
                isPlayerUser ? Math.PI / 8 : -Math.PI / 8
              );
            } else if (elapsedSec < 1.75) {
              // Phase 2: Visceral incision & shuddering slice across flesh
              const tSlice = Math.min(1.0, (elapsedSec - 0.75) / 1.0);
              
              // Drag razor sideways across flesh with friction resistance
              const dragWidth = 0.38;
              const sliceX = (tSlice - 0.5) * dragWidth;
              const currentPos = basePos.clone();
              currentPos.x += (isPlayerUser ? sliceX : -sliceX);
              
              // Skin-resistance mechanical shuddering
              const frictionShudder = Math.sin(tSlice * 65.0) * 0.005;
              currentPos.y += frictionShudder - (tSlice > 0.08 && tSlice < 0.92 ? 0.035 : 0); // digs down into flesh
              currentPos.z += Math.cos(tSlice * 45.0) * 0.003;

              ar.activeItemAnimGroup.position.copy(currentPos);

              if (!isPlayerUser) {
                ar.dealerMouthOpenFactor = 0.6;
                ar.dealerHeadTiltFactor = 0.4;
              }
              
              // Blade angles down pressed into arm
              ar.activeItemAnimGroup.rotation.set(
                isPlayerUser ? Math.PI / 2.2 : -Math.PI / 2.2,
                (isPlayerUser ? 1 : -1) * (Math.PI / 4 + tSlice * 0.25),
                (isPlayerUser ? 1 : -1) * (Math.PI / 6 + frictionShudder * 6.0)
              );

              // Sound & Initial incision bite trigger
              if (!ar.hasSlicedRazor) {
                ar.hasSlicedRazor = true;
                import('../audio').then(a => {
                  if (a.playRazorSlice) a.playRazorSlice();
                  else a.playBloodSplatter();
                });
                vibrateGamepad(isPlayerUser ? 'strong' : 'weak', { duration: 250, weak: 0.4, strong: 1.0 });
              }

              // Continuous blood spray & crimson droplets trailing along the blade path
              if (Math.random() < 0.75) {
                const particlePos = currentPos.clone();
                particlePos.y -= 0.01;
                spawnParticles(particlePos, 0x880000, 5, 0.05, 0.003, 'BLOOD');
                if (Math.random() < 0.35) {
                  spawnParticles(particlePos, 0x550000, 3, 0.02, 0.001, 'BLOOD');
                }
              }

              // Screen camera shudder for visceral impact
              if (isPlayerUser && Math.random() < 0.45) {
                camera.position.x += (Math.random() - 0.5) * 0.018;
                camera.position.y += (Math.random() - 0.5) * 0.018;
              }
            } else if (elapsedSec < 2.5) {
              // Phase 3: Lifts off bloody wound, dripping, and discarded onto table
              const tRetreat = (elapsedSec - 1.75) / 0.75;
              const retreatPos = basePos.clone();
              retreatPos.y += 0.22 * Math.sin(tRetreat * Math.PI / 2);
              retreatPos.z += (isPlayerUser ? -0.15 : 0.15) * tRetreat;

              ar.activeItemAnimGroup.position.copy(retreatPos);
              ar.activeItemAnimGroup.rotation.set(
                (isPlayerUser ? 1 : -1) * (Math.PI / 3 + tRetreat * Math.PI),
                tRetreat * Math.PI * 2,
                0
              );

              // Dripping blood particles from razor tip as it retreats
              if (tRetreat < 0.6 && Math.random() < 0.5) {
                spawnParticles(ar.activeItemAnimGroup.position, 0x770000, 2, 0.02, 0.001, 'BLOOD');
              }
            } else {
              discardItemPhysics(ar.activeItemAnimGroup, ar.activeItemAnimUser || 'player');
              ar.activeItemAnimGroup = null;
            }
            break;
          }
        }
      }


      // --- PLAYER SELF PAD & DEALER HOVER HIGHLIGHTS ---
      const isShootSelfHovered = hoveredMesh === playerSelfPad;

      if (playerSelfPad) {
        if (isShootSelfHovered && latest.showControls) {
          playerSelfPad.scale.set(1.05, 1.4, 1.05); // slightly rise and swell!
          etchMat.color.setHex(0xff3333); // flaring bright glowing red!
        } else {
          playerSelfPad.scale.set(1.0, 1.0, 1.0);
          etchMat.color.setHex(0x771111);
        }
      }


      // --- SCREENSPACE ACCURATE HOVER OVERLAYS SYSTEM ---
      const popupEl = popupRef.current;
      const popupNameEl = popupNameRef.current;
      const popupDescEl = popupDescRef.current;

      let activeTargetMesh: THREE.Object3D | null = null;
      let activeTargetType: 'ITEM' | 'SHOOT_SELF' | 'SHOOT_DEALER' | 'SHOP_ITEM' = 'ITEM';
      let activeTargetName = '';
      let activeTargetDesc = '';

      if (latest.showControls || isLookingAtShopRef.current) {
        if (hoveredMesh) {
          activeTargetMesh = hoveredMesh;
          const isTouchMode = stateRef.current.isTouchActive;
          const touchPrompt = '';

          if (hoveredMesh.userData.isPlayerItem) {
            activeTargetType = 'ITEM';
            const idx = hoveredMesh.userData.index;
            const itemName = latest.player.items[idx];
            if (!itemName) {
              activeTargetName = 'EMPTY SLOT';
              activeTargetDesc = 'ERROR - NO ITEM DETECTED. PLEASE CYCLE OFF.';
            } else {
              activeTargetName = `USE ${itemName}`;
              const buyPrompt = !!updateGamepads() ? ' [A] TO USE' : '';
              activeTargetDesc = (ITEM_DESCS[itemName] || '') + buyPrompt + touchPrompt;
            }
          } else if (hoveredMesh.userData.isShootSelfButton) {
            activeTargetType = 'SHOOT_SELF';
            activeTargetName = 'SHOOT YOURSELF';
            const buyPrompt = !!updateGamepads() ? ' [LT] TO FIRE' : '';
            activeTargetDesc = 'POINT THE REVOLVER DIRECTLY AT YOUR TEMPLE. IF IT IS A BLANK, TURN CONTINUES.' + buyPrompt + touchPrompt;
          } else if (hoveredMesh.userData.isShootDealerButton) {
            activeTargetType = 'SHOOT_DEALER';
            activeTargetName = 'SHOOT THE DEALER';
            const buyPrompt = !!updateGamepads() ? ' [RT] TO FIRE' : '';
            activeTargetDesc = 'AIM AND DISCHARGE THE CHAMBER AT THE HOODED DEALER.' + buyPrompt + touchPrompt;
          } else if (hoveredMesh.userData.isShopItem) {
             activeTargetType = 'SHOP_ITEM';
             const { type, cost } = hoveredMesh.userData;
             const isAffordable = latest.bloodCurrency >= cost;
             activeTargetName = `${type} (${isAffordable ? 'AFFORDABLE' : 'TOO EXPENSIVE'})`;
             const buyPrompt = !!updateGamepads() ? ' [A] TO PURCHASE' : '';
             activeTargetDesc = `${ITEM_DESCS[type]}. COST: ${cost} BLOOD.${buyPrompt}${touchPrompt}`;
          }
        }
      }

      if (popupEl && popupNameEl && popupDescEl) {
        if (activeTargetMesh) {
          popupNameEl.textContent = activeTargetName;
          
          let stylizedDesc = activeTargetDesc;
          if (stylizedDesc.includes('[A]')) {
             stylizedDesc = stylizedDesc.replace(/\[A\]/g, '<span class="gamepad-indicator-btn-a align-middle mx-0.5 shadow-[0_0_4px_rgba(16,185,129,0.3)]">A</span>');
          }
          if (stylizedDesc.includes('[LT]')) {
             stylizedDesc = stylizedDesc.replace(/\[LT\]/g, '<span class="gamepad-indicator-cap align-middle mx-0.5">LT</span>');
          }
          if (stylizedDesc.includes('[RT]')) {
             stylizedDesc = stylizedDesc.replace(/\[RT\]/g, '<span class="gamepad-indicator-cap align-middle mx-0.5">RT</span>');
          }
          if (stylizedDesc.includes('[TAP ONCE]')) {
             stylizedDesc = stylizedDesc.replace(/\[TAP ONCE\]/g, ' • <span class="px-1.5 py-0.5 rounded-full bg-blue-500/80 text-white font-mono leading-none text-[8px] font-bold border-b border-blue-900 shadow-[0_0_6px_rgba(59,130,246,0.3)] align-middle mx-0.5 animate-pulse">TAP AGAIN TO TRIGGER</span>');
          }
          if (stylizedDesc.includes('[TAP SECONDS]')) {
             stylizedDesc = stylizedDesc.replace(/\[TAP SECONDS\]/g, ' • <span class="px-1.5 py-0.5 rounded-full bg-red-600/90 text-white font-mono leading-none text-[8px] font-bold border-b border-red-900 shadow-[0_0_6px_rgba(220,38,38,0.3)] align-middle mx-0.5 animate-pulse">DEPLOY • TAP NOW</span>');
          }
          popupDescEl.innerHTML = stylizedDesc;

          const targetWorldPos = new THREE.Vector3();
          activeTargetMesh.getWorldPosition(targetWorldPos);

          // Fine-tuned custom visual offsets based on type for perfect alignments
          if (activeTargetType === 'ITEM') {
            targetWorldPos.y += 0.42;
          } else if (activeTargetType === 'SHOOT_SELF') {
            targetWorldPos.y += 0.28;
          } else if (activeTargetType === 'SHOOT_DEALER') {
            targetWorldPos.y += 1.55; // above dealer hood
          } else if (activeTargetType === 'SHOP_ITEM') {
            targetWorldPos.y += 0.35; 
          }

          targetWorldPos.project(camera);
          
          const x = (targetWorldPos.x * 0.5 + 0.5) * container.clientWidth;
          const y = (-(targetWorldPos.y * 0.5) + 0.5) * container.clientHeight;

          popupEl.style.transform = `translate(-50%, -100%)`;
          popupEl.style.left = `${x}px`;
          popupEl.style.top = `${y}px`;
          popupEl.style.display = 'block';
        } else {
          popupEl.style.display = 'none';
        }
      }


      // --- INTERMITTENT MUZZLE SMOKE OVER 2 SECONDS AFTER SHOOTING (LIVE ROUNDS ONLY) ---
      const nowMs = Date.now();
      if (ar.lastFireTime && ar.lastFireIsLive && nowMs - ar.lastFireTime < 2000) {
        const fireAge = nowMs - ar.lastFireTime;
        const fadeRatio = 1.0 - (fireAge / 2000);
        
        // Live round gets extremely thick and continuous smoky puffs
        const spawnOdds = 0.38 * fadeRatio * deltaScale;
        if (Math.random() < spawnOdds) {
          const barrelWorldPos = new THREE.Vector3(0, 0.18, 0.9).applyMatrix4(gunGroup.matrixWorld);
          
          spawnParticles(
            barrelWorldPos, 
            0x888888, 
            1, 
            0.024 * fadeRatio, 
            -0.0018, 
            'SMOKE'
          );
        }
      }


      // --- PARTICLES LIFETIME PROCESSING ---
      for (let i = activeParticles.length - 1; i >= 0; i--) {
        const pt = activeParticles[i];
        
        // Handle Camera Screen-Lens blood splats sliding/dripping
        if (pt.mesh.parent === camera) {
          pt.mesh.position.addScaledVector(pt.velocity, deltaScale);
          // Stretch vertically to represent a real gravity-bound dripping trail
          pt.mesh.scale.y += 0.0035 * deltaScale;
          pt.mesh.scale.x *= Math.pow(0.996, deltaScale); // slightly slimmer

          const startDecayLife = pt.maxLife * 0.55;
          if (pt.life > startDecayLife) {
            const shrink = 1.0 - (pt.life - startDecayLife) / (pt.maxLife - startDecayLife);
            const initX = pt.mesh.userData.initialScaleX || 0.005;
            const initY = pt.mesh.userData.initialScaleY || 0.005;
            pt.mesh.scale.set(
              initX * shrink,
              initY * shrink + (pt.mesh.scale.y - initY * shrink) * 0.95, // scale drip naturally
              1
            );
          }
        } else if (!pt.hasLanded) {
          pt.mesh.position.addScaledVector(pt.velocity, deltaScale);
          pt.velocity.y -= pt.gravity * deltaScale;

          // Rotational torque tumbling physics for shells/debris
          if (pt.rotVelocity) {
            pt.mesh.rotation.x += pt.rotVelocity.x * deltaScale;
            pt.mesh.rotation.y += pt.rotVelocity.y * deltaScale;
            pt.mesh.rotation.z += pt.rotVelocity.z * deltaScale;
            pt.rotVelocity.multiplyScalar(Math.pow(0.985, deltaScale)); // air resistance drag
          }

          // Bullet supersonic vapor trails
          if (pt.type === 'BULLET') {
            if (Math.random() < 0.6 * deltaScale) {
              spawnParticles(pt.mesh.position.clone(), 0xdddddd, 1, 0.01, -0.0002, 'SMOKE');
            }
          }

          // Align blood/sparks/bullet mesh rotation with its trajectory vector
          if ((pt.type === 'BLOOD' || pt.type === 'SPARK' || pt.type === 'BULLET') && pt.velocity.lengthSq() > 0.001) {
            const dir = pt.velocity.clone().normalize();
            pt.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          }

          // Hit table surface or floor detection
          // Table top surface level is y = 0.552 (Table box bounds: X [-3.25, 3.25], Z [-2.8, 1.6])
          const hitsTableTop = (
            pt.mesh.position.y <= 0.552 &&
            Math.abs(pt.mesh.position.x) <= 3.25 &&
            pt.mesh.position.z >= -2.8 &&
            pt.mesh.position.z <= 1.6
          );
          const hitsFloor = pt.mesh.position.y <= 0.012;

          if (hitsTableTop || hitsFloor) {
            const surfaceY = hitsTableTop ? 0.553 : 0.012;

            if (pt.type === 'BLOOD' || pt.type === 'LIQUID') {
              const impactVelSq = pt.velocity.lengthSq();
              const impactPos = pt.mesh.position.clone();
              impactPos.y = surfaceY;

              pt.mesh.position.copy(impactPos);
              pt.hasLanded = true;
              pt.velocity.set(0, 0, 0);

              // Squash blood/liquid drops into pixelated splats/stains on the table wood!
              pt.mesh.rotation.set(Math.PI / 2, 0, Math.floor(Math.random() * 4) * (Math.PI / 2)); 
              const pxStep = 0.012;
              const wPx = Math.floor(2 + Math.random() * 5) * pxStep;
              const lPx = Math.floor(2 + Math.random() * 5) * pxStep;
              pt.mesh.scale.set(wPx, 0.002, lPx);
              pt.mesh.userData.baseScaleX = wPx;
              pt.mesh.userData.baseScaleZ = lPx;
              pt.maxLife = 3600 + Math.random() * 2400; // Persist for up to 100 seconds!

              // Secondary satellite pixelated splatters on impact
              if (hitsTableTop && impactVelSq > 0.0015 && activeParticles.length < 850) {
                const satCount = 2 + Math.floor(Math.random() * 4);
                for (let k = 0; k < satCount; k++) {
                  const satMat = Math.random() < 0.65 ? sharedDarkBloodMat : sharedBloodMat;
                  const satMesh = new THREE.Mesh(unitBoxGeo, satMat);
                  
                  const offsetDist = 0.02 + Math.random() * 0.14;
                  const offsetAngle = Math.random() * Math.PI * 2;
                  const sx = impactPos.x + Math.cos(offsetAngle) * offsetDist;
                  const sz = impactPos.z + Math.sin(offsetAngle) * offsetDist;

                  satMesh.position.set(sx, surfaceY, sz);
                  satMesh.rotation.set(Math.PI / 2, 0, Math.floor(Math.random() * 4) * (Math.PI / 2));
                  
                  const satW = (1 + Math.floor(Math.random() * 3)) * 0.008;
                  const satL = (1 + Math.floor(Math.random() * 3)) * 0.008;
                  satMesh.scale.set(satW, 0.002, satL);

                  scene.add(satMesh);
                  activeParticles.push({
                    mesh: satMesh,
                    velocity: new THREE.Vector3(0, 0, 0),
                    life: 0,
                    maxLife: 3000 + Math.random() * 2000,
                    gravity: 0,
                    type: 'BLOOD',
                    hasLanded: true,
                    bounceCount: 0
                  });
                }
              }
            } else if (pt.type === 'BULLET') {
              // Bullet impact -> sparks & wood shrapnel
              spawnParticles(pt.mesh.position.clone(), 0xffaa00, 25, 0.35, 0.002, 'SPARK');
              spawnParticles(pt.mesh.position.clone(), 0x5a2d0c, 12, 0.25, 0.003, 'DEBRIS');
              pt.hasLanded = true;
              pt.life = pt.maxLife; // expire projectile
            } else if (pt.type === 'SPARK' || pt.type === 'SHELL' || pt.type === 'DEBRIS') {
              // Bouncing casing / debris physics
              pt.mesh.position.y = surfaceY;
              pt.velocity.y *= -0.45; // bounce dampening
              pt.velocity.x *= 0.65;
              pt.velocity.z *= 0.65;
              
              if (pt.rotVelocity) {
                pt.rotVelocity.set(
                  (Math.random() - 0.5) * 0.35,
                  (Math.random() - 0.5) * 0.35,
                  (Math.random() - 0.5) * 0.35
                );
              }

              pt.bounceCount++;
              if (pt.bounceCount === 1) {
                if (pt.type === 'SHELL') {
                  playTapSound();
                }
              }
              if (pt.bounceCount > 3 || pt.velocity.lengthSq() < 0.0001) {
                pt.hasLanded = true;
                pt.velocity.set(0, 0, 0);
                if (pt.rotVelocity) pt.rotVelocity.set(0, 0, 0);
              }
            }
          }
        } else if (pt.type === 'BLOOD' || pt.type === 'LIQUID') {
          // Slow initial creep / oozing puddle expansion for first 40 frames, then congeal into dark dried blood crust
          if (pt.life < 40) {
            pt.mesh.scale.x += 0.0002 * deltaScale;
            pt.mesh.scale.z += 0.0002 * deltaScale;
          } else if (pt.life === 40 || pt.life === 41) {
            // Darken landed blood to congealed dried dark crimson crust
            if (pt.mesh.material !== sharedDarkBloodMat) {
              pt.mesh.material = sharedDarkBloodMat;
            }
          }
          
          const startDecayLife = pt.maxLife * 0.85;
          if (pt.life > startDecayLife) {
            const shrink = 1.0 - (pt.life - startDecayLife) / (pt.maxLife - startDecayLife);
            if (!pt.mesh.userData.scaleBeforeDecayX) {
              pt.mesh.userData.scaleBeforeDecayX = pt.mesh.scale.x;
              pt.mesh.userData.scaleBeforeDecayZ = pt.mesh.scale.z;
            }
            const baseX = pt.mesh.userData.scaleBeforeDecayX;
            const baseZ = pt.mesh.userData.scaleBeforeDecayZ;
            pt.mesh.scale.set(baseX * shrink, 0.002 * shrink, baseZ * shrink);
          }
        }

        // Custom realistic gaseous drift & expansion for drifting smoke
        if (pt.type === 'SMOKE') {
          // Smoke experiences a delicate atmospheric draft from the moving barrel
          const ageRatio = pt.life / pt.maxLife;
          const followFactor = Math.pow(Math.max(0.0, 1.0 - ageRatio), 2.5) * 0.16;
          pt.mesh.position.addScaledVector(muzzleDelta, followFactor);

          // Smoke expands into big soft clouds as it dissipates and then scales to 0
          const expansion = 1.0 + ageRatio * 6.5;
          const shrinkFactor = ageRatio > 0.75 ? (1.0 - ageRatio) / 0.25 : 1.0;
          
          const initX = pt.mesh.userData.initialScaleX || pt.mesh.userData.initialScale || 0.024;
          const initY = pt.mesh.userData.initialScaleY || pt.mesh.userData.initialScale || 0.024;
          const initZ = pt.mesh.userData.initialScaleZ || pt.mesh.userData.initialScale || 0.024;
          
          pt.mesh.scale.set(
            initX * expansion * shrinkFactor,
            initY * expansion * shrinkFactor,
            initZ * expansion * shrinkFactor
          );

          // Dynamic slow turbulent swirling rotation
          pt.mesh.rotation.x += (pt.mesh.userData.rotSpeedX || 0.01) * deltaScale;
          pt.mesh.rotation.y += (pt.mesh.userData.rotSpeedY || 0.01) * deltaScale;
          pt.mesh.rotation.z += (pt.mesh.userData.rotSpeedZ || 0.01) * deltaScale;

          // Drift smoke on a realistic wavy vortex path
          pt.velocity.x += Math.sin(pt.life * 0.07 + pt.mesh.position.y * 14) * 0.00022 * deltaScale;
          pt.velocity.z += Math.cos(pt.life * 0.05 + pt.mesh.position.y * 10) * 0.00022 * deltaScale;

          // Drag/friction slowing down the initial high ejection shockwave velocity
          pt.velocity.x *= Math.pow(0.94, deltaScale);
          pt.velocity.z *= Math.pow(0.94, deltaScale);
          pt.velocity.y *= Math.pow(0.96, deltaScale);
        }
        
        if (pt.type === 'DEBRIS' || pt.type === 'SHELL') {
          const fadeStartLife = pt.maxLife * 0.8;
          if (pt.life > fadeStartLife) {
            const fade = Math.max(0, 1.0 - (pt.life - fadeStartLife) / (pt.maxLife - fadeStartLife));
            pt.mesh.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const cMesh = child as THREE.Mesh;
                if (cMesh.material) {
                  const applyFade = (mat: THREE.Material, idx?: number) => {
                    if (!mat.userData.isFadingClone) {
                      const clonedMat = mat.clone();
                      clonedMat.userData.isFadingClone = true;
                      if (idx !== undefined && Array.isArray(cMesh.material)) {
                        cMesh.material[idx] = clonedMat;
                      } else {
                        cMesh.material = clonedMat;
                      }
                      mat = clonedMat;
                    }
                    mat.transparent = true;
                    mat.opacity = fade;
                  };

                  if (Array.isArray(cMesh.material)) {
                    cMesh.material.forEach((m, i) => applyFade(m, i));
                  } else {
                    applyFade(cMesh.material as THREE.Material);
                  }
                }
              }
            });
            
            if (pt.mesh.userData.baseScaleBeforeFadeX === undefined) {
              pt.mesh.userData.baseScaleBeforeFadeX = pt.mesh.scale.x;
              pt.mesh.userData.baseScaleBeforeFadeY = pt.mesh.scale.y;
              pt.mesh.userData.baseScaleBeforeFadeZ = pt.mesh.scale.z;
            }
            pt.mesh.scale.set(
              pt.mesh.userData.baseScaleBeforeFadeX * fade,
              pt.mesh.userData.baseScaleBeforeFadeY * fade,
              pt.mesh.userData.baseScaleBeforeFadeZ * fade
            );
          }
        }

        pt.life += deltaScale;

        if (pt.life > pt.maxLife) {
          if (pt.mesh.parent) {
            pt.mesh.parent.remove(pt.mesh);
          } else {
            scene.remove(pt.mesh);
          }
          if (pt.mesh.geometry && !sharedGeometries.has(pt.mesh.geometry)) {
            pt.mesh.geometry.dispose();
          }
          if (pt.mesh.material) {
            const disposeMaterialComp = (mat: THREE.Material) => {
              if (!sharedMaterials.has(mat)) {
                mat.dispose();
              }
            };
            if (Array.isArray(pt.mesh.material)) {
              pt.mesh.material.forEach(disposeMaterialComp);
            } else {
              disposeMaterialComp(pt.mesh.material);
            }
          }
          activeParticles.splice(i, 1);
        }
      }


      // --- CAMERA DECELERATIONS AND SHAKE KICKS ---
      // --- PLAYER DEATH ANIMATION: INSTANT HEAVY PHYSICS & RAGDOLL POV COLLAPSE ---
      if (latest.player.health <= 0) {
        if (ar.deathAnimStartTime === 0) {
          ar.deathAnimStartTime = Date.now();
          // Instant visceral blood spray burst right in front of POV camera
          spawnParticles(new THREE.Vector3(camera.position.x, camera.position.y - 0.2, camera.position.z - 0.3), 0x990000, 70, 0.35, -0.003, 'BLOOD');
          spawnParticles(new THREE.Vector3(camera.position.x + 0.1, camera.position.y - 0.1, camera.position.z - 0.4), 0xaa0000, 45, 0.28, -0.002, 'BLOOD');
          vibrateGamepad('jolt', { duration: 300, weak: 1.0, strong: 1.0 });
          ar.cameraShakeIntensity = 1.5;
        }
        const rawDeath = (Date.now() - ar.deathAnimStartTime) / 1000;

        // Smooth mouse look inertia during dying sequence - heavy sluggish neck weight
        ar.smoothMouseX += (mouse.x - ar.smoothMouseX) * damp(0.035);
        ar.smoothMouseY += (mouse.y - ar.smoothMouseY) * damp(0.035);

        const lookWeight = Math.max(0.15, 1.0 - rawDeath * 0.25);
        const mouseLookX = ar.smoothMouseX * lookWeight;
        const mouseLookY = ar.smoothMouseY * lookWeight;
        
        // Heavy 2.9s Ragdoll POV death collapse
        if (rawDeath < 0.45) {
          // Phase 1: Sudden Kinetic Bullet Shock - head snaps backward limply
          const t1 = rawDeath / 0.45;
          const ease1 = t1 * t1;

          camera.position.y = 3.4 + (0.22 * Math.sin(t1 * Math.PI)) + mouseLookY * 0.12;
          camera.position.z = 5.5 + (0.42 * ease1); // Driven backward by impact force
          camera.position.x = mouseLookX * 0.25;
          camera.rotation.z = -0.24 * ease1 + mouseLookX * 0.12;
          camera.rotation.x = -0.48 * ease1 + mouseLookY * 0.12;
          ar.lookTargetY = 0.6 + (0.60 * ease1) + mouseLookY * 0.4;
        } else if (rawDeath < 1.30) {
          // Phase 2: Spinal Motor Failure & Heavy Chest Slump onto Table Edge
          const t2 = (rawDeath - 0.45) / 0.85;
          const ease2 = Math.pow(t2, 2.5); // Exponential mass gravitational drop

          const baseY = 3.4 - (2.55 * ease2); // Sags heavily down to tabletop surface (~0.85)
          const baseZ = 5.92 - (1.28 * ease2); // Slumps forward over table
          const baseX = 0.38 * ease2;

          camera.position.y = baseY + mouseLookY * 0.15;
          camera.position.z = baseZ;
          camera.position.x = baseX + mouseLookX * 0.3;

          camera.rotation.z = -0.24 + (0.42 * ease2) + mouseLookX * 0.15;
          camera.rotation.x = -0.48 + (0.92 * ease2) + mouseLookY * 0.15;
          ar.lookTargetY = 1.20 - (1.10 * ease2) + mouseLookY * 0.4;

          // First Impact: Cheek/Chest slams onto hardwood table
          if (t2 >= 0.80 && !ar.hasThumpedPlayerTable) {
            ar.hasThumpedPlayerTable = true;
            import('../audio').then(a => a.playThumpSound());
            vibrateGamepad('jolt', { duration: 180, weak: 0.85, strong: 0.95 });
            ar.cameraShakeIntensity = 0.9;
            spawnParticles(new THREE.Vector3(0, 0.85, 4.6), 0x880000, 20, 0.10, -0.002, 'BLOOD');
          }
        } else if (rawDeath < 2.10) {
          // Phase 3: Unconscious Inertia Sliding Sideways off Chair down to Floor
          const t3 = (rawDeath - 1.30) / 0.80;
          const ease3 = Math.pow(t3, 2.0);

          const baseY = 0.85 - (0.67 * ease3); // Drops down to floor tiles level (~0.18)
          const baseZ = 4.64 + (0.58 * ease3);
          const baseX = 0.38 + (0.42 * ease3);

          camera.position.y = baseY + mouseLookY * 0.10;
          camera.position.z = baseZ;
          camera.position.x = baseX + mouseLookX * 0.35;

          // Camera rolls onto side lying on cheek on cold floor
          camera.rotation.z = 0.18 - (1.68 * ease3) + mouseLookX * 0.18;
          camera.rotation.x = 0.44 - (0.64 * ease3) + mouseLookY * 0.18;
          ar.lookTargetY = 0.10 - (0.05 * ease3) + mouseLookY * 0.3;
        } else if (rawDeath < 2.90) {
          // Phase 4: Full Heavy Body Mass Floor Impact & Absorbed Rebound
          const t4 = rawDeath - 2.10;

          if (!ar.hasThumpedPlayerFall) {
            ar.hasThumpedPlayerFall = true;
            import('../audio').then(a => a.playThumpSound());
            vibrateGamepad('jolt', { duration: 260, weak: 1.0, strong: 1.0 });
            ar.cameraShakeIntensity = 1.4;
          }

          // Heavy body mass dampening rebound
          const bounce = Math.exp(-6.5 * t4) * Math.sin(12 * t4) * 0.055;

          camera.position.y = 0.18 + bounce + mouseLookY * 0.08;
          camera.position.z = 5.22;
          camera.position.x = 0.80 + mouseLookX * 0.35;

          camera.rotation.z = -1.50 - (bounce * 0.5) + mouseLookX * 0.15;
          camera.rotation.x = -0.20 + mouseLookY * 0.15;
          ar.lookTargetY = 0.05 + mouseLookY * 0.25;
        } else {
          // Phase 5: Final Settled Resting Pose on Floor
          camera.position.set(0.80 + mouseLookX * 0.35, 0.18 + mouseLookY * 0.08, 5.22);
          camera.rotation.z = -1.50 + mouseLookX * 0.15;
          camera.rotation.x = -0.20 + mouseLookY * 0.15;
          ar.lookTargetY = 0.05 + mouseLookY * 0.25;
        }
      } else {
        ar.deathAnimStartTime = 0;
        ar.hasThumpedPlayerFall = false;
        ar.hasThumpedPlayerTable = false;
        camera.rotation.z = 0;
        camera.rotation.x = 0;
        ar.lookTargetY = 0.6;

        ar.cameraShakeIntensity *= Math.pow(0.88, deltaScale);
        const shakeX = (Math.random() - 0.5) * ar.cameraShakeIntensity * 0.45;
        const shakeY = (Math.random() - 0.5) * ar.cameraShakeIntensity * 0.45;
        const shakeZ = (Math.random() - 0.5) * ar.cameraShakeIntensity * 0.25;

        // Exponential decay of camera kickback
        ar.cameraKickZ = (ar.cameraKickZ || 0) * Math.pow(0.83, deltaScale);
        ar.cameraKickPitch = (ar.cameraKickPitch || 0) * Math.pow(0.81, deltaScale);
        ar.cameraKickRoll = (ar.cameraKickRoll || 0) * Math.pow(0.82, deltaScale);

        // Heavy, organic camera sway and mouse parallax when alive
        ar.smoothMouseX += (mouse.x - ar.smoothMouseX) * damp(0.04);
        ar.smoothMouseY += (mouse.y - ar.smoothMouseY) * damp(0.04);

        const handSwayX = Math.sin(time * 0.9) * 0.035;
        const handSwayY = Math.cos(time * 0.70) * 0.025;

        // Apply position and look-target parallax for a heavy, physical camera presence
        const parallaxX = ar.smoothMouseX * 0.38;
        const parallaxY = ar.smoothMouseY * 0.24;

        camera.position.copy(stateRef.current.camPosVec);
        camera.position.x += handSwayX + shakeX + parallaxX;
        camera.position.y += handSwayY + shakeY + parallaxY;
        camera.position.z += shakeZ + ar.cameraKickZ;

        if (stateRef.current.lookTargetVec) {
          stateRef.current.lookTargetVec.x += ar.smoothMouseX * 0.65 * damp(0.12);
          stateRef.current.lookTargetVec.y += ar.smoothMouseY * 0.45 * damp(0.12);
        }
      }

      // --- LOADING ANIMATION: CYLINDER RELOAD ---
      if (latest.gameState === 'LOADING') {
        if (ar.loadingAnimStartTime === 0) {
            ar.loadingAnimStartTime = Date.now();
            ar.bulletLoadedFlags = [false, false, false, false, false, false];
        }
        const rawLoad = (Date.now() - ar.loadingAnimStartTime) / 1000;
        const loadElapsed = rawLoad * 1.3;
        
        // Raising the gun to center view
        if (loadElapsed < 0.5) {
            const t = loadElapsed / 0.5;
            gunGroup.position.y = initialGunPos.y + t * 0.6;
            gunGroup.rotation.x = initialGunRot.x - t * 0.7;
        } else if (loadElapsed < 2.5) {
            // Loading bullets sequence
            const bulletTime = (loadElapsed - 0.5) / 1.7; // load sequence duration
            const bulletIdx = Math.floor(bulletTime * 6);
            
            if (bulletIdx >= 0 && bulletIdx < 6 && !ar.bulletLoadedFlags[bulletIdx]) {
                ar.bulletLoadedFlags[bulletIdx] = true;
                playBulletLoad();
                spawnParticles(gunGroup.position, 0xffcc00, 5, 0.05, 0.001, 'SPARK');
                // Sharp, quick visceral jolt when the bullet slides into the cylinder
                vibrateGamepad('jolt', { duration: 45, weak: 0.1, strong: 1.0 });
            }
            
            // Jitter/Recoil on each bullet load
            const jitter = Math.sin(bulletTime * Math.PI * 12) * 0.02;
            gunGroup.position.y = initialGunPos.y + 0.6 + jitter;
            
            // Spinning cylinder during load
            revolverCylinderMesh.rotation.z += 0.15 * deltaScale;
            drumMesh.rotation.y += 0.15 * deltaScale;
        } else if (loadElapsed < 3.0) {
            // Lowering back down
            const lowerT = (loadElapsed - 2.5) / 0.5;
            gunGroup.position.y = initialGunPos.y + 0.6 - (lowerT * 0.6);
            gunGroup.rotation.x = (initialGunRot.x - 0.7) + (lowerT * 0.7);
        }
      } else {
        ar.loadingAnimStartTime = 0;
      }

      // --- DYNAMIC TV HEALTH MONITORS AND INDENT GLOW UPDATES ---
      const latestPlayerHP = latest.player.health;
      const latestPlayerMax = latest.player.maxHealth;
      const latestDealerHP = latest.dealer.health;
      const latestDealerMax = latest.dealer.maxHealth;

      // Render updated text readout sheets to textures only on mechanical health changes
      if (latestPlayerHP !== lastTvPlayerHP || latestPlayerMax !== lastTvPlayerMax) {
        lastTvPlayerHP = latestPlayerHP;
        lastTvPlayerMax = latestPlayerMax;
        updatePlayerNumericTex(latestPlayerHP, latestPlayerMax);
      }
      if (latestDealerHP !== lastTvDealerHP || latestDealerMax !== lastTvDealerMax) {
        lastTvDealerHP = latestDealerHP;
        lastTvDealerMax = latestDealerMax;
        updateDealerNumericTex(latestDealerHP, latestDealerMax);
      }

      // Fluid progression animations: dynamic ratio scaling
      const tvPHealthRatio = Math.max(0.0001, Math.min(1.0, latestPlayerHP / latestPlayerMax));
      const tvDHealthRatio = Math.max(0.0001, Math.min(1.0, latestDealerHP / latestDealerMax));

      // LERP scale to give an inert mercury-like dial rise/fall
      tvPGlowMesh.scale.x = tvPGlowMesh.scale.x * (1 - damp(0.12)) + (tvPHealthRatio * 1.70) * damp(0.12);
      tvDGlowMesh.scale.x = tvDGlowMesh.scale.x * (1 - damp(0.12)) + (tvDHealthRatio * 1.70) * damp(0.12);

      // Hide glow meshes entirely if health goes to 0 or below
      tvPGlowMesh.visible = latestPlayerHP > 0;
      tvDGlowMesh.visible = latestDealerHP > 0;

      // Flickering, breathing tubes representing heartbeat patterns
      const tvBreatheIntensity = 4.0 + Math.sin(time * 3.8) * 1.4;
      tvPGlowMat.emissiveIntensity = tvBreatheIntensity;
      tvDGlowMat.emissiveIntensity = tvBreatheIntensity;

      // Color mix the PointLight room glow based on participants' status ratios
      const glowRIntensity = tvDHealthRatio * 3.2;
      const glowBIntensity = tvPHealthRatio * 3.2;
      tvGlowLight.color.setRGB(glowRIntensity, 0, glowBIntensity);
      tvGlowLight.intensity = 4.0 + Math.sin(time * 1.8) * 0.6;

      if (stateRef.current.lookTargetVec) {
         camera.lookAt(stateRef.current.lookTargetVec);
      } else {
         camera.lookAt(0, 0.5, -1);
      }

      // Apply rotational kickback pitch & roll to camera orientation
      if (ar.cameraKickPitch || ar.cameraKickRoll) {
        camera.rotation.x += ar.cameraKickPitch;
        camera.rotation.z += ar.cameraKickRoll;
      }

      if (renderPipeline) {
        renderPipeline.render();
      } else if (renderer) {
        renderer.render(scene, camera);
      }
    };

    animate();
    return () => {
      if (mouseInactivityTimerRef.current) clearTimeout(mouseInactivityTimerRef.current);
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.cursor = '';
      if (renderPipeline && typeof renderPipeline.dispose === 'function') {
        try { renderPipeline.dispose(); } catch (e) {}
      }
      if (renderer) {
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black overflow-hidden relative flex justify-center items-center select-none"
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          imageRendering: 'pixelated',
          WebkitFontSmoothing: 'none',
        }}
      />

      {/* DYNAMIC HIGH-PERFORMANCE SCREENSPACE FLOATING TOOLTIP ABOVE THREE.JS OBJECTS */}
      {/* PLAYER DEATH RED TINT & WEBGPU VISION BLUR VIGNETTE OVERLAY */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-[118] transition-opacity duration-300"
        style={{
          opacity: player.health <= 0 ? 1 : 0,
          background: 'radial-gradient(circle at center, rgba(180, 0, 0, 0.30) 0%, rgba(100, 0, 0, 0.75) 50%, rgba(15, 0, 0, 0.98) 100%)',
          backdropFilter: player.health <= 0 ? 'blur(10px) contrast(150%) saturate(190%)' : 'none',
          WebkitBackdropFilter: player.health <= 0 ? 'blur(10px) contrast(150%) saturate(190%)' : 'none',
          mixBlendMode: 'hard-light'
        }}
      />

      {/* DYNAMIC SCREEN BLOOD SPLATTER OVERLAY */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[120]">
        {screenSplats.map(splat => (
          <motion.div
            key={splat.id}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 1, 1, 0.4, 0], scale: splat.scale }}
            transition={{ duration: 3.5, ease: "easeOut" }}
            className="absolute rounded-full"
            style={{
              left: `${splat.x}%`,
              top: `${splat.y}%`,
              width: '180px',
              height: '180px',
              background: 'radial-gradient(circle, #600 0%, #300 40%, transparent 70%)',
              filter: 'blur(15px) contrast(150%)',
              transform: `rotate(${splat.rotation}deg)`,
              mixBlendMode: 'multiply'
            }}
          >
            {/* Inner drizzles for realism */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-2 h-32 bg-red-950/40 blur-md rounded-full transform origin-top animate-pulse" style={{ rotate: '5deg' }} />
            <div className="absolute top-1/2 left-1/3 -translate-x-1/2 w-1 h-24 bg-red-900/30 blur-sm rounded-full transform origin-top" style={{ rotate: '-12deg' }} />
          </motion.div>
        ))}
      </div>

      {/* SHOP PROMPT */}
      {player.health > 0 && gameState === 'PLAYER_TURN' && (
        <motion.div 
          className="absolute left-8 top-1/2 -translate-y-1/2 z-[120] flex flex-col items-start gap-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ 
            opacity: 1, 
            x: 0 
          }}
        >
          <div 
             className="group relative flex items-center gap-3 text-[10px] md:text-sm uppercase font-mono text-amber-500 frosted-glass-ui backdrop-blur-md px-4 py-3 border-l-4 border-l-amber-600 rounded-r drop-shadow-lg cursor-pointer pointer-events-auto active:scale-95 transition-transform"
             onClick={() => {

                if (player.health <= 0 || gameState !== 'PLAYER_TURN') return;
                isLookingAtShopRef.current = !isLookingAtShopRef.current;
                setHoveredInfo(null);
             }}
          >
             {inputType === 'gamepad' ? (
               <>
                 <span className="flex items-center gap-1.5">
                   <span className="gamepad-indicator-btn-y shadow-[0_0_4px_rgba(234,179,8,0.4)]">
                     Y
                   </span>
                   <span className="opacity-80 font-bold">{isLookingAtShopRef.current ? 'BACK' : 'MARKET'}</span>
                 </span>
                 <span className="opacity-30">|</span>
                 <span className="flex items-center gap-1.5 text-gray-400">
                   <span className="gamepad-indicator-cap leading-none uppercase">VIEW</span>
                   <span className="opacity-80">CURSOR</span>
                 </span>
               </>
             ) : (
               <span className="opacity-80 tracking-widest font-bold flex items-center gap-2">
                 {isLookingAtShopRef.current 
                   ? '[Q] BACK TO TABLE'
                   : '[Q] BLACK MARKET'}
               </span>
             )}
          </div>
        </motion.div>
      )}

       {/* KEYBOARD QUICK CONTROLS HUD */}
      {inputType !== 'gamepad' && getControllerSettings().showKeyboardHud !== false && (showControls || isLookingAtShopRef.current) && (
        <motion.div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[120] pointer-events-none hidden sm:flex items-center gap-2 frosted-glass-ui backdrop-blur-md px-4 py-2 font-mono text-[10px] md:text-[11px]"
          initial={{ opacity: 0, y: -10 }}

          animate={{ opacity: showKeyboardHud ? 1 : 0, y: showKeyboardHud ? 0 : -10 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
        >
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="frosted-glass-item text-red-400 px-1.5 py-0.5 border border-red-800/80 font-extrabold">S / ←</span>
            <span className="text-neutral-300 font-semibold uppercase">SHOOT SELF</span>
          </div>
          <span className="text-neutral-700">|</span>
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="frosted-glass-item text-red-400 px-1.5 py-0.5 border border-red-800/80 font-extrabold">D / →</span>
            <span className="text-neutral-300 font-semibold uppercase">SHOOT DEALER</span>
          </div>
          <span className="text-neutral-700">|</span>
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="frosted-glass-item text-amber-400 px-1.5 py-0.5 border border-amber-800/80 font-extrabold">1-8</span>
            <span className="text-neutral-300 font-semibold uppercase">USE ITEM</span>
          </div>
          <span className="text-neutral-700">|</span>
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="frosted-glass-item text-amber-400 px-1.5 py-0.5 border border-amber-800/80 font-extrabold">Q / ↓</span>
            <span className="text-neutral-300 font-semibold uppercase">MARKET</span>
          </div>
          <span className="text-neutral-700">|</span>
          <div className="flex items-center gap-1.5 text-neutral-300">
            <span className="frosted-glass-item text-emerald-400 px-1.5 py-0.5 border border-emerald-800/80 font-extrabold">SPACE</span>
            <span className="text-neutral-300 font-semibold uppercase">CONFIRM</span>
          </div>
        </motion.div>
      )}

      {/* BLOOD CURRENCY DISPLAY - ONLY SHOWS IN SHOP */}
      <motion.div
        className="absolute right-8 top-20 sm:top-24 z-[130] flex flex-col items-end pointer-events-none"
        initial={{ opacity: 0, y: -20 }}
        animate={{ 
          opacity: isLookingAtShopRef.current ? 1 : 0,
          y: isLookingAtShopRef.current ? 0 : -20
        }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center gap-4 frosted-glass-ui backdrop-blur-md px-5 py-3 border-r-4 border-red-600 shadow-[0_0_30px_rgba(150,0,0,0.2)]">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-red-400 uppercase tracking-[0.3em] font-bold">Liquid Assets</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-4xl font-mono text-red-500 font-black tabular-nums drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]">
                {bloodCurrency}
              </span>
              <span className="text-sm sm:text-base font-mono text-red-400 font-bold">BLOOD</span>
            </div>
          </div>
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-red-600 to-red-950 flex items-center justify-center shadow-lg border border-red-400/30">
            <div className="w-5 h-5 sm:w-8 sm:h-8 bg-black/40 rounded-full blur-[1px]" />
          </div>
        </div>
      </motion.div>

      <div
        ref={popupRef}
        className="absolute pointer-events-none z-[100] text-center"
        style={{ display: 'none', position: 'absolute' }}
      >
        <div className="frosted-glass-ui backdrop-blur-md p-2.5 sm:p-3 rounded-none border-l-4 border-l-red-600 max-w-[210px] sm:max-w-[250px] flex flex-col gap-1 items-center shadow-[0_16px_36px_rgba(0,0,0,0.95)]">
          <div ref={popupNameRef} className="text-red-400 font-mono text-[11px] sm:text-xs font-extrabold tracking-widest uppercase" />
          <div ref={popupDescRef} className="text-[9px] sm:text-[10px] font-mono text-gray-200 uppercase leading-relaxed font-semibold tracking-wide" />
        </div>
      </div>

      <div 
        id="virtual-cursor" 
        className="absolute w-5 h-5 border-2 border-red-500/80 rounded-full pointer-events-none z-[9999] hidden shadow-[0_0_12px_rgba(255,0,0,0.8)] transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center mix-blend-screen transition-transform duration-75" 
      >
         <div className="w-1 h-1 bg-white rounded-full" />
      </div>

      {webGpuError && (
        <div className="fixed inset-0 z-[999999] bg-[#050101]/80 backdrop-blur-md text-neutral-100 flex items-center justify-center p-4 sm:p-6 font-mono select-none overflow-hidden">
          <div className="max-w-md w-full frosted-glass-ui border-2 border-red-900/80 rounded-none p-6 sm:p-8 flex flex-col gap-5 shadow-[0_0_60px_rgba(180,0,0,0.35)] relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-600" />

            <div className="flex items-center gap-3 border-b border-red-900/40 pb-4">
              <div className="p-2.5 bg-red-950/80 border border-red-800/60 text-red-500">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-red-500 font-extrabold tracking-widest uppercase block">
                  SYSTEM WARNING
                </span>
                <h2 className="text-base sm:text-lg font-bold text-neutral-100 tracking-wide uppercase">
                  WebGPU Required
                </h2>
              </div>
            </div>

            <div className="p-3.5 bg-black/90 border border-red-900/40 space-y-1.5">
              <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3 h-3" /> FAULT DETAILS
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed font-mono">
                {webGpuError}
              </p>
            </div>

            <div className="space-y-2 text-xs text-neutral-400 leading-relaxed">
              <div className="text-[10px] text-neutral-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-red-400" /> REQUIREMENT
              </div>
              <p className="text-[11px] text-neutral-400">
                This applet relies strictly on WebGPU. Please ensure hardware acceleration is enabled or use a WebGPU-compatible browser (Chrome 113+, Edge 113+).
              </p>
            </div>

            <div className="flex justify-end pt-3 border-t border-red-900/40">
              <button
                onClick={handleRetryWebGpu}
                disabled={isRecheckingWebGpu}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-950 hover:bg-red-900 text-red-200 border border-red-800/80 font-bold text-xs uppercase tracking-widest transition-all duration-150 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRecheckingWebGpu ? 'animate-spin text-red-400' : ''}`} />
                {isRecheckingWebGpu ? 'RECHECKING...' : 'RECHECK WEBGPU'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
