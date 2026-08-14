import * as THREE from 'three';
import { 
  StorageInstancedBufferAttribute, 
  InstancedMesh, 
  MeshBasicNodeMaterial, 
  PlaneGeometry,
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
  If, 
  clamp, 
  max,
  uv,
  length
} from 'three/tsl';

export class WebGPUVolumetricSmokeSystem {
  public cigaretteSmokeMesh: InstancedMesh | null = null;
  public computeNode: any = null;

  public maxCigaretteParticles: number = 1024;

  private cigPosAttr: StorageInstancedBufferAttribute | null = null;
  private cigVelAttr: StorageInstancedBufferAttribute | null = null;
  private cigLifeAttr: StorageInstancedBufferAttribute | null = null; // x = life, y = maxLife, z = scale, w = rotation

  private uDeltaTime = uniform(0.016);
  private uTime = uniform(0.0);

  private currentHead: number = 0;
  private isInitialized: boolean = false;

  constructor(scene: THREE.Scene) {
    this.init(scene);
  }

  private init(scene: THREE.Scene) {
    try {
      const count = this.maxCigaretteParticles;

      this.cigPosAttr = new StorageInstancedBufferAttribute(count, 3);
      this.cigVelAttr = new StorageInstancedBufferAttribute(count, 3);
      this.cigLifeAttr = new StorageInstancedBufferAttribute(count, 4);

      const posArray = this.cigPosAttr.array as Float32Array;
      const velArray = this.cigVelAttr.array as Float32Array;
      const lifeArray = this.cigLifeAttr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        posArray[i * 3 + 0] = 0;
        posArray[i * 3 + 1] = -100;
        posArray[i * 3 + 2] = 0;

        velArray[i * 3 + 0] = 0;
        velArray[i * 3 + 1] = 0;
        velArray[i * 3 + 2] = 0;

        lifeArray[i * 4 + 0] = 0;
        lifeArray[i * 4 + 1] = 1;
        lifeArray[i * 4 + 2] = 0.02;
        lifeArray[i * 4 + 3] = 0;
      }

      const posStorage = storage(this.cigPosAttr, 'vec3', count);
      const velStorage = storage(this.cigVelAttr, 'vec3', count);
      const lifeStorage = storage(this.cigLifeAttr, 'vec4', count);

      // WebGPU Compute Shader for Subtle Atmospheric Smoke Wisps
      this.computeNode = Fn(() => {
        const idx = instanceIndex;
        const p = posStorage.element(idx);
        const v = velStorage.element(idx);
        const l = lifeStorage.element(idx);

        const currentLife = l.x;
        const maxLife = l.y;

        If(currentLife.lessThan(maxLife), () => {
          l.x.addAssign(this.uDeltaTime);

          // Gentle buoyancy & micro atmospheric air drift
          const t = this.uTime.add(float(idx).mul(0.08));
          const curlX = sin(t.mul(1.2).add(p.y.mul(3.0))).mul(0.04);
          const curlZ = cos(t.mul(0.9).add(p.y.mul(2.5))).mul(0.04);

          v.x.assign(curlX);
          v.y.addAssign(float(0.04).mul(this.uDeltaTime)); // very gentle rise
          v.z.assign(curlZ);

          // Position update
          p.addAssign(v.mul(this.uDeltaTime));

          // Soft expansion and dissipation
          l.z.addAssign(float(0.015).mul(this.uDeltaTime));
          l.w.addAssign(float(0.15).mul(this.uDeltaTime));
        });
      })().compute(count);

      // Small, soft billboard geometry for grounded wisps
      const geom = new THREE.PlaneGeometry(0.035, 0.035);

      const mat = new MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = THREE.NormalBlending;

      const instancePos = posStorage.element(instanceIndex);
      const instanceLife = lifeStorage.element(instanceIndex);
      const curLife = instanceLife.x;
      const mLife = instanceLife.y;
      const lifeRatio = curLife.div(max(mLife, 0.01));

      mat.positionNode = instancePos;

      // Soft circular puff with smooth radial falloff
      const uvs = uv();
      const distFromCenter = length(uvs.sub(0.5));
      const puffAlpha = clamp(float(1.0).sub(distFromCenter.mul(2.2)), 0.0, 1.0);

      // Smooth parabolic fade (in quickly, linger, dissolve cleanly)
      const fadeInOut = sin(lifeRatio.mul(3.14159));
      const finalAlpha = puffAlpha.mul(fadeInOut).mul(0.16);

      // Subtle atmospheric tobacco/ash smoke tint
      const baseSmokeColor = color(0x8a909a);
      const litSmokeColor = color(0xb5bcc7);
      const smokeTint = mix(baseSmokeColor, litSmokeColor, fadeInOut);

      mat.colorNode = vec4(smokeTint, finalAlpha);

      this.cigaretteSmokeMesh = new InstancedMesh(geom, mat, count);
      this.cigaretteSmokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.cigaretteSmokeMesh.frustumCulled = false;

      scene.add(this.cigaretteSmokeMesh);

      this.isInitialized = true;
    } catch (e) {
      console.warn('WebGPU Volumetric Smoke init fallback:', e);
    }
  }

  public emitPuff(
    origin: THREE.Vector3,
    direction: THREE.Vector3 = new THREE.Vector3(0, 0.25, 0),
    count: number = 6,
    speed: number = 0.18,
    lifespan: number = 3.2
  ) {
    if (!this.cigPosAttr || !this.cigVelAttr || !this.cigLifeAttr) return;

    const posArray = this.cigPosAttr.array as Float32Array;
    const velArray = this.cigVelAttr.array as Float32Array;
    const lifeArray = this.cigLifeAttr.array as Float32Array;

    const total = this.maxCigaretteParticles;
    const spawnAmount = Math.min(count, 16);

    for (let i = 0; i < spawnAmount; i++) {
      const idx = (this.currentHead + i) % total;

      posArray[idx * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.015;
      posArray[idx * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.015;
      posArray[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.015;

      velArray[idx * 3 + 0] = direction.x * speed + (Math.random() - 0.5) * 0.03;
      velArray[idx * 3 + 1] = direction.y * speed + Math.random() * 0.06;
      velArray[idx * 3 + 2] = direction.z * speed + (Math.random() - 0.5) * 0.03;

      lifeArray[idx * 4 + 0] = 0.0;
      lifeArray[idx * 4 + 1] = lifespan * (0.8 + Math.random() * 0.4);
      lifeArray[idx * 4 + 2] = 0.02 + Math.random() * 0.01;
      lifeArray[idx * 4 + 3] = Math.random() * Math.PI * 2;
    }

    this.currentHead = (this.currentHead + spawnAmount) % total;
    this.cigPosAttr.needsUpdate = true;
    this.cigVelAttr.needsUpdate = true;
    this.cigLifeAttr.needsUpdate = true;
  }

  public update(renderer: any, delta: number, elapsedTime: number, camera: THREE.Camera) {
    if (!this.isInitialized || !renderer) return;

    this.uDeltaTime.value = Math.min(delta, 0.05);
    this.uTime.value = elapsedTime;

    if (this.computeNode && typeof renderer.compute === 'function') {
      try {
        renderer.compute(this.computeNode);
      } catch (e) {}
    }
  }

  public dispose(scene: THREE.Scene) {
    if (this.cigaretteSmokeMesh) {
      scene.remove(this.cigaretteSmokeMesh);
      if (this.cigaretteSmokeMesh.geometry) this.cigaretteSmokeMesh.geometry.dispose();
      this.cigaretteSmokeMesh = null;
    }
  }
}
