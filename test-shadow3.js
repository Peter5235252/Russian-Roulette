import * as THREE from 'three';

const dl = new THREE.DirectionalLight();
const pl = new THREE.PointLight();
const sl = new THREE.SpotLight();

console.log(dl.shadow.constructor.name);
console.log(pl.shadow.constructor.name);
console.log(sl.shadow.constructor.name);
console.log(dl.shadow.constructor === pl.shadow.constructor); // PointLightShadow vs DirectionalLightShadow
console.log(dl.shadow.constructor === sl.shadow.constructor); // SpotLightShadow vs DirectionalLightShadow

