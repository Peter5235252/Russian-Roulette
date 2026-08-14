import * as THREE from 'three';
import { 
  StorageInstancedBufferAttribute, 
  InstancedMesh, 
  MeshStandardNodeMaterial, 
  SphereGeometry,
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
  sin, 
  cos, 
  clamp, 
  If, 
  min, 
  max,
  sub,
  add,
  mul,
  div,
  length
} from 'three/tsl';

export class WebGPUComputeBloodSystem {
  public mesh: InstancedMesh | null = null;
  public computeNode: any = null;
  public maxParticles: number = 8192;
  
  private posAttribute: StorageInstancedBufferAttribute | null = null;
  private velAttribute: StorageInstancedBufferAttribute | null = null;
  private lifeAttribute: StorageInstancedBufferAttribute | null = null; // x = life, y = maxLife, z = size, w = hasLanded (0 or 1)
  
  private uDeltaTime = uniform(0.016);
  private uGravity = uniform(9.8);
  private uTableHeight = uniform(0.53);
  private uSpawnIndex = uniform(0);
  private uSpawnCount = uniform(0);
  private uSpawnOrigin = uniform(vec3(0, 0, 0));
  private uSpawnVel = uniform(vec3(0, 0, 0));
  private uSpawnSpread = uniform(0.5);
  private uSpawnSpeed = uniform(2.0);
  private uTime = uniform(0);

  private currentHead: number = 0;
  private isInitialized: boolean = false;

  constructor(scene: THREE.Scene, maxParticles: number = 8192) {
    this.maxParticles = maxParticles;
    this.init(scene);
  }

  private init(scene: THREE.Scene) {
    try {
      const count = this.maxParticles;

      // Create storage buffers for positions, velocities, and life metadata
      this.posAttribute = new StorageInstancedBufferAttribute(count, 3);
      this.velAttribute = new StorageInstancedBufferAttribute(count, 3);
      this.lifeAttribute = new StorageInstancedBufferAttribute(count, 4);

      // Initialize all blood particles off-screen / inactive
      const posArray = this.posAttribute.array as Float32Array;
      const velArray = this.velAttribute.array as Float32Array;
      const lifeArray = this.lifeAttribute.array as Float32Array;

      for (let i = 0; i < count; i++) {
        posArray[i * 3 + 0] = 0;
        posArray[i * 3 + 1] = -100; // deep below
        posArray[i * 3 + 2] = 0;

        velArray[i * 3 + 0] = 0;
        velArray[i * 3 + 1] = 0;
        velArray[i * 3 + 2] = 0;

        lifeArray[i * 4 + 0] = 0; // current life
        lifeArray[i * 4 + 1] = 1; // max life
        lifeArray[i * 4 + 2] = 0.015; // base size
        lifeArray[i * 4 + 3] = 0; // has landed
      }

      // Storage nodes for TSL compute shader
      const posStorage = storage(this.posAttribute, 'vec3', count);
      const velStorage = storage(this.velAttribute, 'vec3', count);
      const lifeStorage = storage(this.lifeAttribute, 'vec4', count);

      // WebGPU Compute Shader for Blood Physics
      this.computeNode = Fn(() => {
        const idx = instanceIndex;
        const p = posStorage.element(idx);
        const v = velStorage.element(idx);
        const l = lifeStorage.element(idx);

        const currentLife = l.x;
        const maxLife = l.y;
        const baseSize = l.z;
        const hasLanded = l.w;

        // If particle is active (currentLife < maxLife)
        If(currentLife.lessThan(maxLife), () => {
          // Increment life
          l.x.addAssign(this.uDeltaTime);

          // If not landed on the surface yet, simulate ballistics
          If(hasLanded.equal(0.0), () => {
            // Apply gravity and viscous air drag
            v.y.subAssign(this.uGravity.mul(this.uDeltaTime));
            v.mulAssign(float(0.985)); // air drag

            // Position update
            p.addAssign(v.mul(this.uDeltaTime));

            // Collision against the steel table plane
            If(p.y.lessThanEqual(this.uTableHeight), () => {
              // Mark as landed
              p.y.assign(this.uTableHeight.add(0.002));
              v.assign(vec3(0.0, 0.0, 0.0));
              l.w.assign(1.0); // landed
              // Expand into puddle splatter radius
              l.z.mulAssign(2.2);
            });
          });
        });
      })().compute(count);

      // Instanced Mesh Geometry: Low-poly sphere / disk for droplet & splatter
      const geom = new THREE.SphereGeometry(0.012, 6, 6);
      
      // Node Material with custom TSL vertex & fragment shading
      const mat = new MeshStandardNodeMaterial();
      mat.roughness = 0.04; // Ultra wet glossy specular for SSR reflections
      mat.metalness = 0.22;
      mat.roughnessNode = float(0.04);
      mat.metalnessNode = float(0.22);
      
      // Position node driven by WebGPU compute storage buffer
      const instancePos = posStorage.element(instanceIndex);
      const instanceLife = lifeStorage.element(instanceIndex);
      const isLanded = instanceLife.w;
      const curLife = instanceLife.x;
      const mLife = instanceLife.y;
      const lifeRatio = curLife.div(max(mLife, 0.01));

      // Flatten landed droplets into splatter puddles on the table
      const scaleNode = mix(
        vec3(1.0, 1.0, 1.0),
        vec3(2.5, 0.1, 2.5),
        isLanded
      );

      mat.positionNode = instancePos;
      
      // Visceral deep arterial red color with coagulated darkening as it ages
      const freshBloodColor = color(0x8a0303);
      const coagulatedBloodColor = color(0x280002);
      mat.colorNode = mix(freshBloodColor, coagulatedBloodColor, clamp(lifeRatio, 0.0, 1.0));
      mat.emissiveNode = color(0x1a0000);

      this.mesh = new InstancedMesh(geom, mat, count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;

      scene.add(this.mesh);
      this.isInitialized = true;
    } catch (e) {
      console.warn('WebGPU Compute Blood initialization fallback:', e);
    }
  }

  public emitBurst(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    count: number = 32,
    speed: number = 2.5,
    spread: number = 0.6,
    lifespan: number = 18.0
  ) {
    if (!this.posAttribute || !this.velAttribute || !this.lifeAttribute) return;

    const posArray = this.posAttribute.array as Float32Array;
    const velArray = this.velAttribute.array as Float32Array;
    const lifeArray = this.lifeAttribute.array as Float32Array;

    const total = this.maxParticles;
    const spawnAmount = Math.min(count, 512);

    for (let i = 0; i < spawnAmount; i++) {
      const idx = (this.currentHead + i) % total;

      // Offset slightly around origin
      posArray[idx * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.04;
      posArray[idx * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.04;
      posArray[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.04;

      // Random cone velocity around direction
      const vx = direction.x * speed + (Math.random() - 0.5) * spread * speed;
      const vy = direction.y * speed + Math.random() * spread * speed + 0.4;
      const vz = direction.z * speed + (Math.random() - 0.5) * spread * speed;

      velArray[idx * 3 + 0] = vx;
      velArray[idx * 3 + 1] = vy;
      velArray[idx * 3 + 2] = vz;

      lifeArray[idx * 4 + 0] = 0.0; // life
      lifeArray[idx * 4 + 1] = lifespan + Math.random() * 5.0; // maxLife (long persistent table puddle)
      lifeArray[idx * 4 + 2] = 0.012 + Math.random() * 0.016; // base size
      lifeArray[idx * 4 + 3] = 0.0; // hasLanded
    }

    this.currentHead = (this.currentHead + spawnAmount) % total;
    this.posAttribute.needsUpdate = true;
    this.velAttribute.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
  }

  public update(renderer: any, delta: number, elapsedTime: number) {
    if (!this.isInitialized || !this.computeNode || !renderer) return;

    this.uDeltaTime.value = Math.min(delta, 0.05);
    this.uTime.value = elapsedTime;

    try {
      if (typeof renderer.compute === 'function') {
        renderer.compute(this.computeNode);
      }
    } catch (e) {
      // Graceful ignore during context recreation
    }
  }

  public clear() {
    if (!this.posAttribute || !this.lifeAttribute) return;
    const posArray = this.posAttribute.array as Float32Array;
    const lifeArray = this.lifeAttribute.array as Float32Array;
    for (let i = 0; i < this.maxParticles; i++) {
      posArray[i * 3 + 1] = -100;
      lifeArray[i * 4 + 0] = lifeArray[i * 4 + 1] + 1;
    }
    this.posAttribute.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
    this.currentHead = 0;
  }

  public dispose(scene: THREE.Scene) {
    if (this.mesh) {
      scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}
