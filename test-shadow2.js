import * as THREE from 'three';

const dummyLight = new THREE.DirectionalLight();
const LightShadowClass = dummyLight.shadow.constructor;
console.log("LightShadowClass", !!LightShadowClass);
LightShadowClass.prototype._safeMapPatched = true;
const dummyRenderTarget = {
  texture: new THREE.Texture(),
  depthTexture: new THREE.DepthTexture(1, 1),
  width: 1,
  height: 1,
  dispose: () => {},
};
const realMapSymbol = Symbol('realMap');
Object.defineProperty(LightShadowClass.prototype, 'map', {
  get() {
    return this[realMapSymbol] ?? dummyRenderTarget;
  },
  set(val) {
    this[realMapSymbol] = val;
  },
  configurable: true,
  enumerable: true,
});

const dl = new THREE.DirectionalLight();
console.log("dl.shadow.map", !!dl.shadow.map);
dl.shadow.map = null;
console.log("dl.shadow.map after null", !!dl.shadow.map, dl.shadow.map.depthTexture);

