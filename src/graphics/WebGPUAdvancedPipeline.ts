import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import { pass, mrt, output, normalView, metalness, roughness, velocity, uniform, vec2, vec3, vec4, float, int, mix, clamp, convertToTexture } from 'three/tsl';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { motionBlur } from 'three/examples/jsm/tsl/display/MotionBlur.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { fsr1 } from 'three/examples/jsm/tsl/display/FSR1Node.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { ControllerSettings } from '../controller';

export class WebGPUAdvancedPipeline {
  public renderPipeline: RenderPipeline | null = null;
  public scenePass: any = null;

  public uVelocity = uniform(vec2(0.0, 0.0));
  public uMotionBlurSamples = uniform(int(8));
  public uMotionBlurEnabled = uniform(1.0);

  public uAoIntensity = uniform(1.0);
  public uSsrIntensity = uniform(1.0);
  public uBloomIntensity = uniform(0.35);

  private isConfigured: boolean = false;
  private currentKey: string = '';

  constructor(private renderer: any, private scene: THREE.Scene, private camera: THREE.Camera) {
    this.initPipeline();
  }

  public initPipeline() {
    if (!this.renderer) return;

    try {
      this.renderPipeline = new RenderPipeline(this.renderer);
      this.scenePass = pass(this.scene, this.camera);

      // Configure MRT for output, normals, metalness, and roughness (4 attachments = 32 bytes per sample, fully compliant with WebGPU spec)
      this.scenePass.setMRT(
        mrt({
          output: output,
          normal: normalView,
          metalness: metalness,
          roughness: roughness,
        })
      );

      this.isConfigured = true;
    } catch (e) {
      console.warn('WebGPU Advanced Pipeline init fallback:', e);
    }
  }

  public rebuildGraph(settings: ControllerSettings, scale: number = 1.0) {
    if (!this.renderPipeline || !this.scenePass) return;

    const gtaoQ = settings.gtaoQuality || 'low';
    const ssrQ = settings.ssrQuality || 'low';
    const mbQ = settings.motionBlurQuality || 'low';

    const gtaoOn = settings.gtaoEnabled !== false;
    const ssrOn = settings.ssrEnabled !== false;
    const mbOn = settings.motionBlurEnabled !== false;
    const upscaling = settings.webGpuUpscalingPreset || 'balanced';
    const sharpeningVal = settings.webGpuSharpening !== undefined ? settings.webGpuSharpening : 0.6;
    const rcasSharpness = Math.max(0.0, (1.0 - sharpeningVal) * 1.8);

    const graphKey = `${gtaoQ}_${ssrQ}_${mbQ}_${upscaling}_${sharpeningVal}_${scale}`;
    if (graphKey === this.currentKey) return;
    this.currentKey = graphKey;

    // Adjust motion blur samples based on quality
    const mbSamplesMap = { low: 4, medium: 6, high: 8, ultra: 12 };
    const mbSamples = mbSamplesMap[mbQ] || 4;

    try {
      if (typeof this.scenePass.setResolutionScale === 'function') {
        this.scenePass.setResolutionScale(scale);
      }

      const colorTex = this.scenePass.getTextureNode('output');
      const normalTex = this.scenePass.getTextureNode('normal');
      const depthTex = this.scenePass.getTextureNode('depth');
      const metalTex = this.scenePass.getTextureNode('metalness');
      const roughTex = this.scenePass.getTextureNode('roughness');

      let currentNode: any = colorTex;

      // 1. Screen Space Reflections (SSR)
      if (ssrOn) {
        try {
          const ssrPass = ssr(colorTex, depthTex, normalTex, metalTex, roughTex, this.camera);

          if (ssrPass.maxDistance && ssrPass.maxDistance.value !== undefined) {
            ssrPass.maxDistance.value = ssrQ === 'low' ? 3.0 : ssrQ === 'medium' ? 5.0 : ssrQ === 'high' ? 8.0 : 12.0;
          }
          if (ssrPass.thickness && ssrPass.thickness.value !== undefined) {
            ssrPass.thickness.value = ssrQ === 'low' ? 0.08 : ssrQ === 'medium' ? 0.1 : ssrQ === 'high' ? 0.12 : 0.15;
          }
          if (ssrPass.quality && ssrPass.quality.value !== undefined) {
            ssrPass.quality.value = ssrQ === 'low' ? 0.25 : ssrQ === 'medium' ? 0.5 : ssrQ === 'high' ? 0.8 : 1.0;
          }
          if (ssrPass.blurQuality && ssrPass.blurQuality.value !== undefined) {
            ssrPass.blurQuality.value = ssrQ === 'low' ? 1 : ssrQ === 'medium' ? 2 : ssrQ === 'high' ? 2 : 3;
          }
          if (ssrPass.opacity && ssrPass.opacity.value !== undefined) {
            ssrPass.opacity.value = ssrQ === 'low' ? 0.6 : ssrQ === 'medium' ? 0.75 : ssrQ === 'high' ? 0.9 : 1.0;
          }
          if (ssrPass.resolutionScale !== undefined) {
            ssrPass.resolutionScale = ssrQ === 'low' ? 0.5 : ssrQ === 'medium' ? 0.75 : 1.0;
          }

          // Composite SSR reflection buffer cleanly over the crystal-clear beauty pass.
          // By adding the reflection layer onto the scene color, we preserve full native scene brightness,
          // contrast, and sharpness without darkening unreflected objects or blurring the background geometry.
          const ssrColor = vec3(ssrPass.rgb);
          currentNode = vec4(currentNode.rgb.add(ssrColor), currentNode.a);
        } catch (e) {
          console.warn('SSR pass setup fallback:', e);
        }
      }

      // 2. Ground Truth Ambient Occlusion (GTAO)
      if (gtaoOn) {
        try {
          const aoPass = ao(depthTex, normalTex, this.camera);
          const aoTex = aoPass.getTextureNode();
          const aoWeight = gtaoQ === 'low' ? 0.4 : gtaoQ === 'medium' ? 0.65 : gtaoQ === 'high' ? 0.85 : 1.0;
          // Apply AO darkening to crevices without reducing brightness in unoccluded open areas
          const aoColor = mix(vec3(1.0), vec3(aoTex.r), float(aoWeight));
          currentNode = vec4(currentNode.rgb.mul(aoColor), currentNode.a);
        } catch (e) {
          console.warn('GTAO pass setup fallback:', e);
        }
      }

      // 3. Bloom (Atmospheric Halos on lights and TV screens)
      if (settings.bloomIntensity > 0) {
        try {
          const bloomNode = bloom(currentNode, settings.bloomIntensity * 0.75, 0.85, 0.5);
          currentNode = currentNode.add(bloomNode);
        } catch (e) {}
      }

      // 4. Motion Blur (Dynamic physical recoil and explosion impulse velocity)
      if (mbOn) {
        try {
          const mbInput = typeof currentNode.sample === 'function' ? currentNode : convertToTexture(currentNode);
          const mbNode = motionBlur(mbInput, this.uVelocity, int(mbSamples));
          currentNode = mbNode;
        } catch (e) {
          console.warn('Motion Blur pass setup fallback:', e);
        }
      }

      // 5. Upscaling & Sharpening (FSR1 / RCAS)
      currentNode = fsr1(currentNode, rcasSharpness);

      this.renderPipeline.outputNode = currentNode;
      this.renderPipeline.needsUpdate = true;
    } catch (err) {
      console.warn('WebGPU Advanced Pipeline rebuild error, falling back to scenePass:', err);
      this.renderPipeline.outputNode = this.scenePass;
    }
  }

  public updateFrame(
    delta: number,
    gameState: string,
    aimProgress: number,
    cameraShake: number,
    recoilKick: number
  ) {
    // Camera mouse movement / panning does NOT blur the scene.
    // uVelocity is kept at 0 or only gets micro physical impulses from violent weapon discharge/explosions.
    if (recoilKick > 0.05) {
      const kickImpulse = recoilKick * 0.015;
      this.uVelocity.value.set((Math.random() - 0.5) * kickImpulse, (Math.random() - 0.5) * kickImpulse);
    } else {
      this.uVelocity.value.set(0.0, 0.0);
    }
  }

  public render() {
    if (this.renderPipeline) {
      this.renderPipeline.render();
    }
  }

  public dispose() {
    if (this.renderPipeline && typeof this.renderPipeline.dispose === 'function') {
      try {
        this.renderPipeline.dispose();
      } catch (e) {}
    }
  }
}
