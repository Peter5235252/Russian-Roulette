import * as THREE from 'three';

const dl = new THREE.DirectionalLight();
const LightShadow = Object.getPrototypeOf(dl.shadow.constructor);
console.log(LightShadow.name);
const LightShadowProto = LightShadow.prototype;
console.log(LightShadowProto.hasOwnProperty('map'));
console.log(dl.shadow.map);

