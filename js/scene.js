// FlexHaus "The Comeback": decorative three.js scene (canvas is aria-hidden; all content is DOM).
// Loaded via dynamic import() only after the page is usable; never under reduced motion / save-data.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TIERS = {
  high: { dpr: 1.75, dust: 6000, bloom: [0.9, 1.4, 2.0, 0.55, 0.82], shafts: 10, light: true, brick: true, plates: 24, lamps: 10, tube: [600, 6] },
  mid: { dpr: 1.5, dust: 2500, bloom: [0.75, 1.1, 1.6, 0.45, 0.85], shafts: 6, light: true, brick: true, plates: 16, lamps: 8, tube: [360, 5] },
  low: { dpr: 1.0, dust: 800, bloom: null, shafts: 0, light: false, brick: false, plates: 8, lamps: 6, tube: [300, 5] },
};
const ORDER = ['high', 'mid', 'low'];
const VOLT = new THREE.Color('#C6F24E'), EMBER = new THREE.Color('#FF5A3C'), CARBON = new THREE.Color('#0E1116');
const WARM = new THREE.Color('#FFF4DA');
const FOG = 0.045;

// Scroll-keyed tables (design-spec §3.6)
const P = [0, 0.18, 0.35, 0.48, 0.62, 0.78, 0.9, 1];
const BPM = [54, 66, 96, 120, 138, 150, 72, 72];
const SPEED = [0.06, 0.10, 0.22, 0.32, 0.40, 0.48, 0.14, 0.14];
const DRIFT = [0.3, 0.5, 1.0, 1.4, 1.6, 1.8, 0.6, 0.6];
const LIGHT = [0.6, 1.0, 1.8, 2.4, 2.6, 3.0, 2.0, 2.0];
function table(arr, p) {
  for (let i = 1; i < P.length; i++) if (p <= P[i]) { const t = (p - P[i - 1]) / (P[i] - P[i - 1]); const s = t * t * (3 - 2 * t); return arr[i - 1] + (arr[i] - arr[i - 1]) * s; }
  return arr[arr.length - 1];
}
// Camera keyframes (§3.5): [p, pos, look]
const KF = [
  [0.00, [0, 1.4, 6.0], [0, 1.4, 0]], [0.12, [0.2, 1.4, 4.0], [0, 1.3, -4]], [0.22, [0.8, 1.2, -4], [0, 1.0, -14]],
  [0.35, [-1.2, 1.0, -16], [1.5, 1.2, -26]], [0.48, [0.5, 1.6, -28], [0, 1.0, -40]], [0.62, [0, 3.2, -36], [0, 0.5, -50]],
  [0.78, [0, 4.5, -50], [0, 0, -60]], [0.90, [0, 5.2, -56], [0, 0, -63]], [1.00, [0, 5.4, -57], [0, 0, -64]],
];
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const FOG_GLSL = 'uniform float uFogD; uniform vec3 uFogC; float fogF(float d){ return 1.0 - exp(-uFogD*uFogD*d*d); }';
const OUT_GLSL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function start(opts) {
  let tierName = opts.tier;
  let T = TIERS[tierName];
  const initial = T;
  opts.onTier?.(tierName);
  console.info('[flexhaus] 3D tier:', tierName);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  const canvas = renderer.domElement;
  canvas.id = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  canvas.tabIndex = -1;
  document.body.prepend(canvas);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(CARBON);

  const scene = new THREE.Scene();
  scene.background = CARBON;
  scene.fog = new THREE.FogExp2(CARBON, FOG);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  const fogU = { uFogD: { value: FOG }, uFogC: { value: CARBON } };

  // ---- 1. The pulse line (tube + travelling head via shader uniforms) ----
  const B = 1.55;
  const pulsePts = [
    [-8, B, 0.6], [-4.5, B, 0.2], [-2.2, B, 0], [-1.35, B + 0.14, 0], [-1.0, B, 0], [-0.45, B, 0], [-0.3, B - 0.16, 0], [-0.08, B + 0.95, 0],
    [0.14, B - 0.42, 0], [0.36, B, 0], [0.7, B, 0], [1.0, B + 0.2, 0], [1.3, B, 0], [2.8, B, -0.4], [3.6, 1.4, -4], [1.4, 1.2, -10],
    [-0.4, 1.3, -17], [0.6, 1.1, -24], [0.9, 1.2, -31], [-0.3, 1.0, -38], [0, 0.8, -46], [0.6, 0.5, -54], [1.6, 0.25, -61],
    [0.4, 0.12, -65.3], [-1.3, 0.08, -64.3], [-0.5, 0.05, -62.9], [0.4, 0.04, -63.6], [0, 0.03, -64],
  ].map((a) => new THREE.Vector3(...a));
  const curve = new THREE.CatmullRomCurve3(pulsePts, false, 'centripetal');
  const heads = new Float32Array(8).fill(-1), launched = new Float32Array(8);
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: { ...fogU, uHeads: { value: heads }, uFill: { value: 0 }, uDim: { value: 0 }, uColor: { value: VOLT } },
    vertexShader: 'varying float vU; varying float vD; void main(){ vU=uv.x; vec4 mv=modelViewMatrix*vec4(position,1.0); vD=-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: `${FOG_GLSL} uniform float uHeads[8]; uniform float uFill; uniform float uDim; uniform vec3 uColor; varying float vU; varying float vD;
      void main(){ float i=0.18;
        for(int k=0;k<8;k++){ float h=uHeads[k]; if(h<-0.5) continue; float d=h-vU;
          i+=4.0*exp(-(d*d)/(2.0*0.015*0.015)); if(d>0.0) i+=1.1*exp(-d/0.04); }
        i=max(i, 2.4*smoothstep(1.0-uFill-0.01, 1.0-uFill, vU)*step(0.001,uFill));
        i*=1.0-0.2*uDim; vec3 c=uColor*i; c=mix(c,uFogC,fogF(vD)*0.85);
        gl_FragColor=vec4(c,1.0); ${OUT_GLSL} }`,
  });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, initial.tube[0], 0.025, initial.tube[1], false), pulseMat));
  const curveSamples = curve.getSpacedPoints(240);

  // ---- Lights (no shadows anywhere) ----
  scene.add(new THREE.HemisphereLight('#2A3140', '#0E1116', 0.35));
  const key = new THREE.DirectionalLight(WARM, 0.6); key.position.set(4, 8, -30); key.target.position.set(0, 0, -20);
  scene.add(key, key.target);
  const voltLight = new THREE.PointLight(VOLT, 0.6, 8, 2);
  voltLight.visible = initial.light; scene.add(voltLight);

  // ---- Lamp positions along the path ----
  const lampPos = [];
  for (let i = 0; i < 10; i++) {
    const z = -3 - i * 5; let best = curveSamples[0];
    for (const s of curveSamples) if (Math.abs(s.z - z) < Math.abs(best.z - z)) best = s;
    lampPos.push(new THREE.Vector3(best.x + (i % 2 ? 1.4 : -1.4), 4.4, z));
  }

  // ---- 7. Floor with baked lamp pools (procedural canvas, no download) ----
  const floorTex = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#14171D'; g.fillRect(0, 0, w, h);
    for (const l of lampPos) {
      const x = ((l.x + 10) / 20) * w, y = ((l.z + 70) / 80) * h;
      const gr = g.createRadialGradient(x, y, 0, x, y, 14);
      gr.addColorStop(0, 'rgba(255,244,218,0.32)'); gr.addColorStop(1, 'rgba(255,244,218,0)');
      g.fillStyle = gr; g.fillRect(x - 16, y - 16, 32, 32);
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 80), new THREE.MeshLambertMaterial({ color: '#ffffff', map: floorTex, emissive: '#ffffff', emissiveMap: floorTex, emissiveIntensity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -30); scene.add(floor);

  // ---- 8. Brick walls: left + back in ONE geometry / draw call, procedural brick texture ----
  const brick = canvasTex(256, 128, (g) => {
    g.fillStyle = '#2a2624'; g.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) {
      const v = 70 + Math.random() * 40 | 0; g.fillStyle = `rgb(${v + 30},${v},${v - 12})`;
      g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
    }
  });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const wallGeo = new THREE.BufferGeometry();
  const L = -5, Z0 = 8, Z1 = -70, H = 9, X1 = 10;
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute([L, 0, Z0, L, 0, Z1, L, H, Z1, L, H, Z0, L, 0, Z1, X1, 0, Z1, X1, H, Z1, L, H, Z1], 3));
  wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const lu = (Z0 - Z1) / 2.4, bu = (X1 - L) / 2.4, vv = H / 1.2;
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, lu, 0, lu, vv, 0, vv, 0, 0, bu, 0, bu, vv, 0, vv], 2));
  wallGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const wallMat = new THREE.MeshLambertMaterial({ color: initial.brick ? '#55575e' : '#1A1C21', map: initial.brick ? brick : null });
  scene.add(new THREE.Mesh(wallGeo, wallMat));

  // ---- 3. Rig: uprights, crossbars, rails, barbells = one InstancedMesh ----
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const boxes = [];
  const RX = [2.0, 3.2], RZ = [-13, -16.5, -20, -23.5];
  for (const z of RZ) { for (const x of RX) boxes.push([x, 1.2, z, 0.08, 2.4, 0.08]); boxes.push([2.6, 2.4, z, 1.3, 0.08, 0.08]); boxes.push([2.6, 1.4, z, 2.2, 0.035, 0.035]); }
  for (const x of RX) boxes.push([x, 2.4, -18.25, 0.08, 0.08, 10.6]);
  const rig = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#2A2F38' }), boxes.length);
  boxes.forEach((b, i) => rig.setMatrixAt(i, m4.compose(v3.set(b[0], b[1], b[2]), q.identity(), s3.set(b[3], b[4], b[5]))));
  scene.add(rig);

  // ---- 4. Plates (barbell ends + floor stacks) = InstancedMesh ----
  const plates = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), new THREE.MeshLambertMaterial({ color: '#1B1F26' }), 24);
  const qSide = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  let pi = 0;
  for (const z of RZ) for (const x of [1.72, 3.48]) plates.setMatrixAt(pi++, m4.compose(v3.set(x, 1.4, z), qSide, s3.set(1, 1, 1)));
  for (let i = 0; pi < 24; i++) plates.setMatrixAt(pi++, m4.compose(v3.set(-3.4 + (i % 4) * 0.6, 0.025 + Math.floor(i / 4) * 0.055, -14 - (i % 4) * 2.4), q.identity(), s3.set(1, 1, 1)));
  plates.count = initial.plates; scene.add(plates);

  // ---- 5. Pendant lamps (HDR emissive discs -> bloom) = InstancedMesh ----
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16), new THREE.MeshBasicMaterial({ color: WARM.clone().multiplyScalar(2.5) }), 10);
  lampPos.forEach((p, i) => lamps.setMatrixAt(i, m4.compose(p, q.identity(), s3.set(1, 1, 1))));
  lamps.count = initial.lamps; scene.add(lamps);

  // ---- 6. Light shafts: additive open cones = InstancedMesh, custom shader ----
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { ...fogU, uTime: { value: 0 }, uColor: { value: WARM } },
    vertexShader: `varying vec2 vUv; varying float vEdge; varying float vD; varying float vSeed;
      void main(){ vUv=uv; mat4 im=mat4(1.0);
        #ifdef USE_INSTANCING
        im=instanceMatrix;
        #endif
        vec4 wp=modelMatrix*im*vec4(position,1.0); vec4 mv=viewMatrix*wp; vD=-mv.z; vSeed=im[3].z;
        vec3 n=normalize(mat3(viewMatrix)*mat3(modelMatrix)*mat3(im)*normal); vEdge=abs(dot(n,normalize(-mv.xyz)));
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `${FOG_GLSL} uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vEdge; varying float vD; varying float vSeed;
      void main(){ float a=(0.06+0.03*sin(uTime*1.2566+vSeed))*pow(vUv.y,1.3)*smoothstep(0.0,0.6,vEdge);
        a*=1.0-fogF(vD); gl_FragColor=vec4(uColor,a); ${OUT_GLSL} }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shafts = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 4.3, 20, 1, true), shaftMat, 10);
  lampPos.forEach((p, i) => shafts.setMatrixAt(i, m4.compose(v3.set(p.x, p.y - 2.15, p.z), q.identity(), s3.set(1, 1, 1))));
  shafts.count = initial.shafts; shafts.visible = initial.shafts > 0; scene.add(shafts);

  // ---- 9. Chalk dust: Points, all motion in the vertex shader ----
  const N = initial.dust, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (i % 5 < 3) { const l = lampPos[i % 10], r = Math.sqrt(Math.random()) * 1.2, a = Math.random() * 6.283; x = l.x + Math.cos(a) * r; z = l.z + Math.sin(a) * r; y = Math.random() * 4.2; }
    else { const s = curveSamples[(Math.random() * curveSamples.length) | 0]; x = s.x + (Math.random() - 0.5) * 7; y = Math.random() * 4.5; z = s.z + (Math.random() - 0.5) * 6; }
    pos.set([x, y, z], i * 3); seed[i] = Math.random();
  }
  // Shuffle-free: indices are interleaved, so drawRange truncation on demotion keeps an even spread.
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { ...fogU, uDrift: { value: 0 }, uSpeed: { value: 0.3 }, uPx: { value: 1 }, uColor: { value: new THREE.Color('#F5F5F2') } },
    vertexShader: `${FOG_GLSL} attribute float aSeed; uniform float uDrift; uniform float uSpeed; uniform float uPx; varying float vA;
      void main(){ vec3 p=position; float s=aSeed*6.2831;
        p.x+=sin(uDrift*0.9+s)*0.35+sin(uDrift*0.37+s*3.0)*0.2; p.y+=sin(uDrift*0.7+s*1.7)*0.25; p.z+=cos(uDrift*0.8+s*2.3)*0.35;
        vec4 mv=modelViewMatrix*vec4(p,1.0); float d=-mv.z;
        gl_PointSize=min(24.0,(1.5+2.0*fract(aSeed*13.7))*(1.0+0.2*smoothstep(1.0,1.8,uSpeed))*uPx*(4.0/max(d,0.5)));
        vA=(0.35+0.35*fract(aSeed*29.3))*(1.0-fogF(d))*smoothstep(0.3,1.2,d); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float r=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,r)*vA; gl_FragColor=vec4(uColor,a); ${OUT_GLSL} }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false; scene.add(dust);

  // ---- 10. Comeback pool ----
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uBeat: { value: 0 }, uRim: { value: 0 }, uBoost: { value: 0 }, uVolt: { value: VOLT }, uEmber: { value: EMBER } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform float uBeat; uniform float uRim; uniform float uBoost; uniform vec3 uVolt; uniform vec3 uEmber; varying vec2 vUv;
      void main(){ float r=length(vUv-0.5)*2.0; float core=exp(-r*r*5.0)*1.6*(1.0+0.15*uBeat+uBoost);
        float rim=0.25*uRim*exp(-pow((r-0.41)/0.05,2.0)); float edge=smoothstep(1.0,0.6,r);
        vec3 c=(uVolt*core+uEmber*rim*2.0)*edge; gl_FragColor=vec4(c,1.0); ${OUT_GLSL} }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, -64); scene.add(pool);

  // ---- 11. Low-tier halo sprite (stands in for bloom) ----
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(198,242,78,1)'); gr.addColorStop(0.25, 'rgba(198,242,78,.35)'); gr.addColorStop(1, 'rgba(198,242,78,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.set(1.1, 1.1, 1); halo.visible = !initial.bloom; scene.add(halo);

  // ---- Post: bloom. UnrealBloomPass's bright-pass + blur chain start at half the drawing buffer. ----
  let composer = null, bloom = null;
  function buildComposer() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), T.bloom[0], T.bloom[3], T.bloom[4]);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  if (T.bloom) buildComposer();

  // ---- Camera rig ----
  let camPos, camLook;
  function buildCamera() {
    const narrow = innerWidth < 768;
    camera.fov = narrow ? 58 : 50;
    camPos = new THREE.CatmullRomCurve3(KF.map((k) => new THREE.Vector3(k[1][0], k[1][1] + (narrow && k[0] >= 0.78 ? 0.6 : 0), k[1][2])));
    camLook = new THREE.CatmullRomCurve3(KF.map((k) => new THREE.Vector3(...k[2])));
  }
  // Map p to the curve parameter so each keyframe lands exactly at its p (§3.5 table).
  const kfT = (p) => { for (let i = 1; i < KF.length; i++) if (p <= KF[i][0]) return (i - 1 + (p - KF[i - 1][0]) / (KF[i][0] - KF[i - 1][0])) / (KF.length - 1); return 1; };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, T.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight); }
    camera.aspect = innerWidth / innerHeight;
    buildCamera();
    camera.updateProjectionMatrix();
    dustMat.uniforms.uPx.value = dpr;
  }
  resize();

  // ---- Input state ----
  let pTarget = 0, pDamped = 0, pEnergy = 0;
  const readScroll = () => { const max = document.documentElement.scrollHeight - innerHeight; pTarget = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0; };
  readScroll(); pDamped = pEnergy = pTarget;
  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', () => { resize(); readScroll(); kick(); }, { passive: true });
  const parallaxOn = () => matchMedia('(pointer: fine)').matches && tierName !== 'low';
  let ptrX = 0, ptrY = 0, parX = 0, parY = 0, lastPtr = 0;
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; ptrX = (e.clientX / innerWidth - 0.5) * 2; ptrY = (e.clientY / innerHeight - 0.5) * 2; lastPtr = performance.now(); }, { passive: true });

  // ---- Animation state ----
  let beatAcc = 0.8, headIdx = 0, lastHead = -1, drift = 0, time = 0;
  let succT = -1, errT = -1, beatT = -1;
  const look = new THREE.Vector3(), tmp = new THREE.Vector3();
  let focusCap = false, paused = !!opts.paused, frozen = false, hidden = document.hidden, offscreen = false;
  let raf = 0, last = 0, firstFrame = true;

  function nearestU(p) { let bi = 0, bd = 1e9; for (let i = 0; i < curveSamples.length; i++) { const d = curveSamples[i].distanceToSquared(p); if (d < bd) { bd = d; bi = i; } } return bi / (curveSamples.length - 1); }

  function update(dt) {
    time += dt;
    const big = Math.abs(pTarget - pDamped) > 0.25;
    pDamped = damp(pDamped, pTarget, big ? 2.2 : 4.5, dt);
    pEnergy = damp(pEnergy, pDamped, 2.0, dt);
    const bpm = table(BPM, pEnergy), speed = table(SPEED, pEnergy);
    let driftMul = table(DRIFT, pEnergy);

    // camera
    const t = kfT(pDamped);
    camPos.getPoint(t, camera.position); camLook.getPoint(t, look);
    if (parallaxOn()) { parX = damp(parX, ptrX * 0.12, 3, dt); parY = damp(parY, -ptrY * 0.12, 3, dt); camera.position.x += parX; camera.position.y += parY; }
    if (succT >= 0) { const k = easeIO(Math.min(1, succT / 1.2)) * 0.3; tmp.subVectors(look, camera.position).normalize().multiplyScalar(k); camera.position.add(tmp); }
    camera.lookAt(look);

    // heartbeat: one head per beat, launched just behind the current view target
    beatAcc += dt * bpm / 60;
    if (beatAcc >= 1) {
      beatAcc -= 1;
      const u0 = Math.max(0, nearestU(look) - 0.05);
      heads[headIdx] = u0; launched[headIdx] = u0; lastHead = headIdx; headIdx = (headIdx + 1) % 8;
      if (pEnergy > 0.85) beatT = 0;
    }
    for (let i = 0; i < 8; i++) if (heads[i] >= 0) { heads[i] += speed * dt; if (heads[i] - launched[i] > 0.35 || heads[i] > 1.02) heads[i] = -1; }
    const hu = lastHead >= 0 && heads[lastHead] >= 0 ? heads[lastHead] : -1;
    if (hu >= 0) curve.getPointAt(Math.min(1, hu), tmp);
    const park = sstep(0.82, 0.95, pDamped);
    if (hu >= 0) { voltLight.position.copy(tmp).lerp(v3.set(0, 1.6, -64), park); halo.position.copy(tmp); halo.visible = !bloom; }
    else halo.visible = false;
    voltLight.intensity = table(LIGHT, pEnergy);

    // pool beat (each heartbeat in the arrival zone), success beats x3
    let beat = 0;
    if (beatT >= 0) { beatT += dt; beat = Math.exp(-beatT * 8); }
    let boost = 0, spike = 0;
    if (succT >= 0) {
      succT += dt;
      pulseMat.uniforms.uFill.value = easeIO(Math.min(1, succT / 1.1));
      for (let k = 0; k < 3; k++) { const x = succT - k * 0.18; if (x > 0) boost += Math.exp(-x * 14) * 0.6; }
      spike = Math.max(0, 1 - succT / 1.4);
      if (succT < 0.8) driftMul *= 3;
    }
    poolMat.uniforms.uBeat.value = beat; poolMat.uniforms.uBoost.value = boost;
    poolMat.uniforms.uRim.value = sstep(0.78, 0.9, pDamped);
    if (errT >= 0) { errT += dt; pulseMat.uniforms.uDim.value = Math.max(0, 1 - errT / 0.6); if (errT > 0.6) errT = -1; }

    drift += dt * driftMul;
    dustMat.uniforms.uDrift.value = drift; dustMat.uniforms.uSpeed.value = driftMul;
    shaftMat.uniforms.uTime.value = time;
    renderer.toneMappingExposure = 1 + 0.15 * sstep(0.78, 0.9, pDamped);
    if (bloom) { const b = T.bloom; const base = b[0] + (b[1] - b[0]) * sstep(0.7, 0.9, pDamped); bloom.strength = base + (b[2] - base) * spike; }
  }

  function render() { if (composer) composer.render(); else renderer.render(scene, camera); }

  // ---- FPS watchdog: demote one tier at a time, then freeze ----
  let wSum = 0, wN = 0, wStart = 0, warm = true;
  function watchdog(ms, now) {
    if (!opts.watchdog || ms > 250) return;
    wSum += ms; wN++;
    if (!wStart) wStart = now;
    const done = warm ? wN >= 90 : now - wStart >= 2000;
    if (!done) return;
    const avg = wSum / wN; wSum = 0; wN = 0; wStart = now; warm = false;
    if (tierName !== 'low' && avg > 22) setTier(ORDER[ORDER.indexOf(tierName) + 1], avg);
    else if (tierName === 'low' && avg > 34) freeze(avg);
  }
  function setTier(name, avg) {
    console.info(`[flexhaus] watchdog: avg ${avg.toFixed(1)}ms, demoting to ${name}`);
    tierName = name; T = TIERS[name]; opts.onTier?.(name);
    dustGeo.setDrawRange(0, Math.min(N, T.dust));
    plates.count = Math.min(24, T.plates); lamps.count = T.lamps;
    shafts.count = T.shafts; shafts.visible = T.shafts > 0;
    if (!T.light) voltLight.visible = false;
    if (!T.brick && wallMat.map) { wallMat.map = null; wallMat.color.set('#1A1C21'); wallMat.needsUpdate = true; }
    if (!T.bloom && composer) { composer.dispose?.(); composer = null; bloom = null; }
    else if (bloom) { bloom.radius = T.bloom[3]; bloom.threshold = T.bloom[4]; }
    resize(); warm = true;
  }
  function freeze(avg) {
    console.info(`[flexhaus] watchdog: avg ${avg.toFixed(1)}ms on low, freezing to a still frame`);
    frozen = true; stop(); render(); opts.onFrozen?.();
  }

  // ---- Loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const elapsed = now - last;
    const idle = Math.abs(pTarget - pDamped) < 0.0005 && now - lastPtr > 500 && (succT < 0 || succT > 1.5) && errT < 0;
    const capped = idle || focusCap;
    if (capped && elapsed < 1000 / 30 - 2) return;
    last = now;
    update(Math.min(elapsed / 1000, 0.05));
    render();
    if (firstFrame) { firstFrame = false; requestAnimationFrame(() => canvas.classList.add('on')); }
    if (!capped) watchdog(elapsed, now);
  }
  function run() { if (raf || paused || frozen || hidden || offscreen) return; last = performance.now(); wStart = 0; wSum = 0; wN = 0; raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function kick() { if (!raf && !frozen) { update(0); render(); } }

  document.addEventListener('visibilitychange', () => { hidden = document.hidden; hidden ? stop() : run(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; offscreen ? stop() : run(); }).observe(canvas);

  // context loss: wait up to 2s for a restore, else fall back to the static page
  let lostTimer = 0;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); lostTimer = setTimeout(() => { frozen = true; opts.onFail?.('webgl context lost'); }, 2000); });
  canvas.addEventListener('webglcontextrestored', () => { clearTimeout(lostTimer); run(); });

  // first frame
  update(0.016); render();
  if (paused) { canvas.classList.add('on'); firstFrame = false; }
  run();

  return {
    setPaused(p) { paused = p; if (p) { stop(); } else run(); },
    setFocusCap(on) { focusCap = on; },
    celebrate() { succT = 0; pulseMat.uniforms.uFill.value = 0; if (paused || frozen) { succT = 1.4; update(0); render(); } },
    error() { errT = 0; },
    get tier() { return tierName; },
  };
}
