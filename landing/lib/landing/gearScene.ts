import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function initGearScene(): void {
const gearEl = document.getElementById("gear-canvas");
if (!(gearEl instanceof HTMLCanvasElement)) return;
const gearCanvas = gearEl;

function W() {
  return gearCanvas.getBoundingClientRect().width || 480;
}
function H() {
  return gearCanvas.getBoundingClientRect().height || 480;
}

const renderer = new THREE.WebGLRenderer({ canvas: gearCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 5);

// Lights for metallic grey gear
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 4.0);
key.position.set(4, 6, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aacc, 1.5);
fill.position.set(-5, -2, 3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 2.5);
rim.position.set(-3, 4, -5);
scene.add(rim);
const bottom = new THREE.DirectionalLight(0x334455, 1.0);
bottom.position.set(0, -5, 2);
scene.add(bottom);

// Environment map for metallic reflections
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const eA = new THREE.PointLight(0xffffff, 120, 100); eA.position.set(10, 10, 10); envScene.add(eA);
const eB = new THREE.PointLight(0x8899bb, 80, 100); eB.position.set(-10, -5, -10); envScene.add(eB);
const eC = new THREE.PointLight(0xccddee, 60, 100); eC.position.set(0, 10, -10); envScene.add(eC);
const gearEnvMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
pmrem.dispose();
scene.environment = gearEnvMap;

let gear: THREE.Object3D | null = null;
let isDragging = false;
let prevMouse = { x: 0, y: 0 };
let rotVel = { x: 0, y: 0 };

const loader = new GLTFLoader();
loader.load('/gear.glb',
    (gltf) => {
        gear = gltf.scene;

        // Center and scale
        const box = new THREE.Box3().setFromObject(gear);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        gear.position.sub(center);
        gear.scale.setScalar(3.2 / Math.max(size.x, size.y, size.z));

        // Grey metallic material with env map reflections
        const gearMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.92,
            roughness: 0.18,
            envMap: gearEnvMap,
            envMapIntensity: 1.8,
        });
                gear.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = gearMat;
                    }
                });

        // Face the gear toward the camera — axis is along Y so rotate X by ~PI/2
        const INIT_X = Math.PI / 2 - 0.3;
        gear.rotation.x = INIT_X;
        gear.rotation.y = 0;

        scene.add(gear);
    },
    undefined,
    (err) => console.error('gear.glb load error:', err)
);

// Mouse drag
gearCanvas.addEventListener('mousedown', e => {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
    rotVel = { x: 0, y: 0 };
});
window.addEventListener('mousemove', e => {
    if (!isDragging || !gear) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    rotVel.y = dx * 0.013;
    rotVel.x = dy * 0.013;
    gear.rotation.y += rotVel.y;
    gear.rotation.x += rotVel.x;
    prevMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => { isDragging = false; });

// Touch
let prevTouch: { x: number; y: number } | null = null;
gearCanvas.addEventListener('touchstart', e => {
    prevTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    rotVel = { x: 0, y: 0 };
});
gearCanvas.addEventListener('touchmove', e => {
    if (!gear || !prevTouch) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - prevTouch.x;
    const dy = e.touches[0].clientY - prevTouch.y;
    rotVel.y = dx * 0.013;
    rotVel.x = dy * 0.013;
    gear.rotation.y += rotVel.y;
    gear.rotation.x += rotVel.x;
    prevTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });
gearCanvas.addEventListener('touchend', () => { prevTouch = null; });

// Render loop — free rotation, no snap-back
function animate() {
    requestAnimationFrame(animate);
    if (!isDragging && gear) {
        rotVel.x *= 0.92;
        rotVel.y *= 0.92;
        gear.rotation.x += rotVel.x;
        gear.rotation.y += rotVel.y + 0.004;
    }
    renderer.render(scene, camera);
}
animate();

// Resize: use false so CSS controls display size, renderer handles resolution
function resize() {
    const w = W(), h = H();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
// Defer first resize until after layout is painted
requestAnimationFrame(() => { resize(); });
new ResizeObserver(resize).observe(gearCanvas);
}
