import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function initFoxScene(): void {
const el = document.getElementById("fox-canvas");
if (!(el instanceof HTMLCanvasElement)) return;
const foxCanvas = el;

function W() {
  return foxCanvas.getBoundingClientRect().width || 480;
}
function H() {
  return foxCanvas.getBoundingClientRect().height || 480;
}

const renderer = new THREE.WebGLRenderer({ canvas: foxCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 5);

// Env map for reflections
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const eA = new THREE.PointLight(0xffffff, 120, 100); eA.position.set(10, 10, 10); envScene.add(eA);
const eB = new THREE.PointLight(0xf97316, 80, 100); eB.position.set(-10, -5, -10); envScene.add(eB);
const eC = new THREE.PointLight(0xffd580, 60, 100); eC.position.set(0, 10, -10); envScene.add(eC);
const foxEnvMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
pmrem.dispose();
scene.environment = foxEnvMap;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 4.0);
key.position.set(4, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xf97316, 1.5);
fill.position.set(-5, -2, 3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 2.0);
rim.position.set(-3, 4, -5); scene.add(rim);

let fox: THREE.Object3D | null = null;
let isDragging = false;
let prevMouse = { x: 0, y: 0 };
let rotVel = { x: 0, y: 0 };

const loader = new GLTFLoader();
loader.load('/fox.glb', (gltf) => {
    fox = gltf.scene;

    const box = new THREE.Box3().setFromObject(fox);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    fox.position.sub(center);
    fox.scale.setScalar(3.2 / Math.max(size.x, size.y, size.z));

    fox.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if ("envMap" in m) {
          (m as THREE.MeshStandardMaterial).envMap = foxEnvMap;
          (m as THREE.MeshStandardMaterial).envMapIntensity = 1.2;
          m.needsUpdate = true;
        }
      }
    });

    // Face straight toward camera, slight downward tilt
    fox.rotation.y = Math.PI;
    fox.rotation.x = 0.15;

    scene.add(fox);
}, undefined, (err) => console.error('fox.glb load error:', err));

// Mouse drag
foxCanvas.addEventListener('mousedown', e => {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
    rotVel = { x: 0, y: 0 };
});
window.addEventListener('mousemove', e => {
    if (!isDragging || !fox) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    rotVel.y = dx * 0.013;
    rotVel.x = dy * 0.013;
    fox.rotation.y += rotVel.y;
    fox.rotation.x += rotVel.x;
    prevMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => { isDragging = false; });

// Touch
let prevTouch: { x: number; y: number } | null = null;
foxCanvas.addEventListener('touchstart', e => {
    prevTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    rotVel = { x: 0, y: 0 };
});
foxCanvas.addEventListener('touchmove', e => {
    if (!fox || !prevTouch) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - prevTouch.x;
    const dy = e.touches[0].clientY - prevTouch.y;
    rotVel.y = dx * 0.013;
    rotVel.x = dy * 0.013;
    fox.rotation.y += rotVel.y;
    fox.rotation.x += rotVel.x;
    prevTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });
foxCanvas.addEventListener('touchend', () => { prevTouch = null; });

function animate() {
    requestAnimationFrame(animate);
    if (!isDragging && fox) {
        rotVel.x *= 0.92;
        rotVel.y *= 0.92;
        fox.rotation.x += rotVel.x;
        fox.rotation.y += rotVel.y + 0.004;
    }
    renderer.render(scene, camera);
}
animate();

function resize() {
    const w = W(), h = H();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
requestAnimationFrame(() => { resize(); });
new ResizeObserver(resize).observe(foxCanvas);
}
