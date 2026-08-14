import * as THREE from 'three';
import { 
  StorageInstancedBufferAttribute, 
  InstancedMesh, 
  MeshBasicNodeMaterial, 
  BoxGeometry,
  Vector3
} from 'three/webgpu';
import { 
  Fn, 
  uniform, 
  instanceIndex, 
  storage, 
  float, 
  vec3, 
  vec4, 
  color, 
  mix, 
  If, 
  max,
  clamp
} from 'three/tsl';

export class WebGPUComputeSparksSystem {
  public mesh: InstancedMesh | null = null;
  public computeNode: any = null;
  public maxParticles: number = 4096;
  
  private posAttribute: StorageInstancedBufferAttribute | null = null;
  private velAttribute: StorageInstancedBufferAttribute | null = null;
  private lifeAttribute: StorageInstancedBufferAttribute | null = null; // x = life, y = maxLife, z = size, w = bounceCount

  private uDeltaTime = uniform(0.016);
  private uGravity = uniform(15.0);
  private uTableHeight = uniform(0.535);

  private currentHead: number = 0;
  private isInitialized: boolean = false;

  constructor(scene: THREE.Scene, maxParticles: number = 4096) {
    this.maxParticles = maxParticles;
    this.init(scene);
  }

  private init(scene: THREE.Scene) {
    try {
      const count = this.maxParticles;

      this.posAttribute = new StorageInstancedBufferAttribute(count, 3);
      this.velAttribute = new StorageInstancedBufferAttribute(count, 3);
      this.lifeAttribute = new StorageInstancedBufferAttribute(count, 4);

      const posArray = this.posAttribute.array as Float32Array;
      const velArray = this.velAttribute.array as Float32Array;
      const lifeArray = this.lifeAttribute.array as Float32Array;

      for (let i = 0; i < count; i++) {
        posArray[i * 3 + 0] = 0;
        posArray[i * 3 + 1] = -100;
        posArray[i * 3 + 2] = 0;

        velArray[i * 3 + 0] = 0;
        velArray[i * 3 + 1] = 0;
        velArray[i * 3 + 2] = 0;

        lifeArray[i * 4 + 0] = 0;
        lifeArray[i * 4 + 1] = 1;
        lifeArray[i * 4 + 2] = 0.008;
        lifeArray[i * 4 + 3] = 0;
      }

      const posStorage = storage(this.posAttribute, 'vec3', count);
      const velStorage = storage(this.velAttribute, 'vec3', count);
      const lifeStorage = storage(this.lifeAttribute, 'vec4', count);

      // WebGPU Compute Shader for Kinetic Sparks & Shrapnel
      this.computeNode = Fn(() => {
        const idx = instanceIndex;
        const p = posStorage.element(idx);
        const v = velStorage.element(idx);
        const l = lifeStorage.element(idx);

        const currentLife = l.x;
        const maxLife = l.y;

        If(currentLife.lessThan(maxLife), () => {
          l.x.addAssign(this.uDeltaTime);

          // Apply Gravity
          v.y.subAssign(this.uGravity.mul(this.uDeltaTime));

          // Move
          p.addAssign(v.mul(this.uDeltaTime));

          // Physical table bounce collision
          If(p.y.lessThanEqual(this.uTableHeight), () => {
            p.y.assign(this.uTableHeight.add(0.003));
            // Invert Y velocity with restitution loss
            v.y.mulAssign(float(-0.45));
            // Horizontal surface friction
            v.x.mulAssign(float(0.75));
            v.z.mulAssign(float(0.75));
            l.w.addAssign(1.0); // bounce count
          });
        });
      })().compute(count);

      // High-velocity elongated spark geometry
      const geom = new THREE.BoxGeometry(0.006, 0.018, 0.006);

      const mat = new MeshBasicNodeMaterial();
      
      const instancePos = posStorage.element(instanceIndex);
      const instanceLife = lifeStorage.element(instanceIndex);
      const curLife = instanceLife.x;
      const mLife = instanceLife.y;
      const lifeRatio = curLife.div(max(mLife, 0.001));

      mat.positionNode = instancePos;

      // Dynamic Incandescent Thermal Color Degradation (White hot -> Gold -> Orange -> Red -> Black)
      const cWhite = color(0xffffff);
      const cGold = color(0xffd700);
      const cOrange = color(0xff5500);
      const cRed = color(0x880000);

      const stage1 = mix(cWhite, cGold, clamp(lifeRatio.mul(2.5), 0.0, 1.0));
      const stage2 = mix(stage1, cOrange, clamp(lifeRatio.mul(1.5), 0.0, 1.0));
      const finalColor = mix(stage2, cRed, clamp(lifeRatio, 0.0, 1.0));

      mat.colorNode = finalColor;

      this.mesh = new InstancedMesh(geom, mat, count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;

      scene.add(this.mesh);
      this.isInitialized = true;
    } catch (e) {
      console.warn('WebGPU Compute Sparks init fallback:', e);
    }
  }

  public emitSparks(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    count: number = 48,
    speed: number = 4.5,
    spread: number = 0.8,
    lifespan: number = 1.2
  ) {
    if (!this.posAttribute || !this.velAttribute || !this.lifeAttribute) return;

    const posArray = this.posAttribute.array as Float32Array;
    const velArray = this.velAttribute.array as Float32Array;
    const lifeArray = this.lifeAttribute.array as Float32Array;

    const total = this.maxParticles;
    const spawnAmount = Math.min(count, 256);

    for (let i = 0; i < spawnAmount; i++) {
      const idx = (this.currentHead + i) % total;

      posArray[idx * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.02;
      posArray[idx * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.02;
      posArray[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.02;

      const vx = direction.x * speed + (Math.random() - 0.5) * spread * speed;
      const vy = direction.y * speed + (Math.random() - 0.2) * spread * speed + 1.2;
      const vz = direction.z * speed + (Math.random() - 0.5) * spread * speed;

      velArray[idx * 3 + 0] = vx;
      velArray[idx * 3 + 1] = vy;
      velArray[idx * 3 + 2] = vz;

      lifeArray[idx * 4 + 0] = 0.0;
      lifeArray[idx * 4 + 1] = lifespan * (0.6 + Math.random() * 0.8);
      lifeArray[idx * 4 + 2] = 0.008;
      lifeArray[idx * 4 + 3] = 0.0;
    }

    this.currentHead = (this.currentHead + spawnAmount) % total;
    this.posAttribute.needsUpdate = true;
    this.velAttribute.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
  }

  public update(renderer: any, delta: number) {
    if (!this.isInitialized || !this.computeNode || !renderer) return;

    this.uDeltaTime.value = Math.min(delta, 0.05);

    try {
      if (typeof renderer.compute === 'function') {
        renderer.compute(this.computeNode);
      }
    } catch (e) {}
  }

  public dispose(scene: THREE.Scene) {
    if (this.mesh) {
      scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}
