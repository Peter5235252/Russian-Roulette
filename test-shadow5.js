import * as THREE from 'three';

const dummyLight = new THREE.DirectionalLight();
const LightShadowClass = Object.getPrototypeOf(dummyLight.shadow.constructor);
const dummyRenderTarget = {
  texture: new THREE.Texture(),
  depthTexture: new THREE.DepthTexture(1, 1)
};
const realMapSymbol = Symbol('realMap');
Object.defineProperty(LightShadowClass.prototype, 'map', {
  get() {
    return this[realMapSymbol] ?? dummyRenderTarget;
  },
  set(val) {
    this[realMapSymbol] = val;
  }
});

const testLight = new THREE.DirectionalLight();
console.log("testLight map:", testLight.shadow.map);

