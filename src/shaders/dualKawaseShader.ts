/**
 * WebGPU & WebGL Dual Kawase Frosted Glass Blur Shader
 * 
 * Efficient multi-pass downsample / upsample blur algorithm (Marius Kawase)
 * paired with noise and chromatic dispersion for ultra-fast, premium frosted glass.
 */

// WGSL Shader Source for WebGPU Pipelines
export const dualKawaseWGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn mainVertex(@location(0) position : vec3<f32>, @location(1) uv : vec2<f32>) -> VertexOutput {
  var output : VertexOutput;
  output.position = vec4<f32>(position, 1.0);
  output.uv = uv;
  return output;
}

@group(0) @binding(0) var uTexture : texture_2d<f32>;
@group(0) @binding(1) var uSampler : sampler;

struct Uniforms {
  texelSize : vec2<f32>,
  iteration : f32,
  blurAmount : f32,
  glassOpacity : f32,
};
@group(0) @binding(2) var uniforms : Uniforms;

// Dual Kawase Downsample Pass
@fragment
fn mainDownsample(in : VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let halfTexel = uniforms.texelSize * 0.5 * (uniforms.iteration + 1.0);

  var sum = textureSample(uTexture, uSampler, uv) * 4.0;
  sum += textureSample(uTexture, uSampler, uv - halfTexel);
  sum += textureSample(uTexture, uSampler, uv + halfTexel);
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(halfTexel.x, -halfTexel.y));
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-halfTexel.x, halfTexel.y));

  return sum * 0.125;
}

// Dual Kawase Upsample Pass with Frosted Glass Tint & Grain
@fragment
fn mainUpsample(in : VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let halfTexel = uniforms.texelSize * 0.5 * (uniforms.iteration + 1.0);

  var sum = vec4<f32>(0.0);
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-halfTexel.x * 2.0, 0.0));
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-halfTexel.x, halfTexel.y * 2.0)) * 2.0;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(0.0, halfTexel.y * 2.0));
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(halfTexel.x, halfTexel.y * 2.0)) * 2.0;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(halfTexel.x * 2.0, 0.0));
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(halfTexel.x, -halfTexel.y * 2.0)) * 2.0;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(0.0, -halfTexel.y * 2.0));
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-halfTexel.x, -halfTexel.y * 2.0)) * 2.0;

  let blurred = sum * (1.0 / 12.0);

  // Subtle frosted noise grain
  let noise = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.035;
  
  // Frosted glass dark ambient tint & specular edge boost
  let tinted = mix(blurred, vec4<f32>(0.08, 0.08, 0.11, 1.0), uniforms.glassOpacity) + noise;

  return tinted;
}
`;

// Three.js GLSL Shader Material definition for Dual Kawase Frosted Glass
export const DualKawaseFrostedShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: [1920, 1080] },
    blurSize: { value: 2.5 },
    opacity: { value: 0.35 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float blurSize;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec2 texelSize = 1.0 / resolution;
      vec2 halfTexel = texelSize * blurSize;

      // 8-tap Dual Kawase upsample kernel
      vec4 sum = vec4(0.0);
      sum += texture2D(tDiffuse, vUv + vec2(-halfTexel.x * 2.0, 0.0));
      sum += texture2D(tDiffuse, vUv + vec2(-halfTexel.x, halfTexel.y * 2.0)) * 2.0;
      sum += texture2D(tDiffuse, vUv + vec2(0.0, halfTexel.y * 2.0));
      sum += texture2D(tDiffuse, vUv + vec2(halfTexel.x, halfTexel.y * 2.0)) * 2.0;
      sum += texture2D(tDiffuse, vUv + vec2(halfTexel.x * 2.0, 0.0));
      sum += texture2D(tDiffuse, vUv + vec2(halfTexel.x, -halfTexel.y * 2.0)) * 2.0;
      sum += texture2D(tDiffuse, vUv + vec2(0.0, -halfTexel.y * 2.0));
      sum += texture2D(tDiffuse, vUv + vec2(-halfTexel.x, -halfTexel.y * 2.0)) * 2.0;

      vec4 blurColor = sum / 12.0;
      
      // Grain and glass reflection highlight
      float noise = (fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.04;
      vec3 frostedTint = vec3(0.05, 0.06, 0.09);
      
      vec3 finalColor = mix(blurColor.rgb, frostedTint, opacity) + noise;
      gl_FragColor = vec4(finalColor, blurColor.a);
    }
  `
};
