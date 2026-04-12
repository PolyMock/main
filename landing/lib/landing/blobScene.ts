import * as THREE from "three";

export function initBlobScene(): void {
const canvas = document.getElementById("blob-canvas");
const section = document.getElementById("blob-platform-section");
if (!canvas || !section) return;
const W = () => section.clientWidth;
const H = () => section.clientHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);

function blobResize() {
    const w = W() || window.innerWidth;
    const h = H() || window.innerHeight;
    renderer.setSize(w, h, false);
    if (blobMat) blobMat.uniforms.uResolution.value.set(w, h);
}

const blobScene = new THREE.Scene();
const blobCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const vertexShader = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uMouse;
  uniform float uBlend;
  uniform float uSubsurface;
  uniform float uAmbient;
  uniform float uColorSharpness;
  uniform vec3 uBgColor;

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
    return mix(b, a, h) - k*h*(1.0-h);
  }
  float sdSphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
  }
  vec3 repelFromMouse(vec3 center) {
    vec3 diff = center - uMouse;
    float dist = length(diff);
    float repelRadius = 2.0;
    if (dist < repelRadius && dist > 0.001) {
      float force = 1.8 * (1.0 - dist/repelRadius);
      force = force * force;
      center += normalize(diff) * force;
    }
    return center;
  }
  vec3 getCenter(int i, float t) {
    vec3 c;
    if (i == 0)      c = vec3(sin(t*0.7)*1.2,  cos(t*0.5)*0.8,  sin(t*0.3)*0.5);
    else if (i == 1) c = vec3(cos(t*0.6)*1.0,  sin(t*0.8)*1.0,  cos(t*0.4)*0.6);
    else if (i == 2) c = vec3(sin(t*0.9)*0.8, -sin(t*0.4)*1.2,  sin(t*0.7)*0.4);
    else if (i == 3) c = vec3(-cos(t*0.5)*1.5, cos(t*0.7)*0.6,  cos(t*0.5)*0.3);
    else if (i == 4) c = vec3(sin(t*0.4)*0.6,  sin(t*1.0)*0.5, -sin(t*0.6)*0.7);
    else if (i == 5) c = vec3(0.0, 0.0, 0.0);
    else             c = vec3(cos(t*0.8)*1.8, -sin(t*0.3)*0.4,  cos(t*0.9)*0.5);
    return repelFromMouse(c);
  }
  float getRadius(int i) {
    if (i == 0) return 0.65;
    if (i == 1) return 0.58;
    if (i == 2) return 0.55;
    if (i == 3) return 0.50;
    if (i == 4) return 0.68;
    if (i == 5) return 0.72;
    return 0.48;
  }
  vec3 getColor(int i) {
    if (i == 0) return vec3(1.0, 0.0, 0.0);
    if (i == 1) return vec3(0.0, 1.0, 0.15);
    if (i == 2) return vec3(1.0, 0.0, 0.05);
    if (i == 3) return vec3(0.0, 0.9, 0.1);
    if (i == 4) return vec3(0.95, 0.0, 0.0);
    if (i == 5) return vec3(0.0, 1.0, 0.2);
    return vec3(1.0, 0.02, 0.02);
  }
  float sceneSDF(vec3 p) {
    float k = uBlend;
    float d = sdSphere(p, getCenter(0, uTime), getRadius(0));
    d = smin(d, sdSphere(p, getCenter(1, uTime), getRadius(1)), k);
    d = smin(d, sdSphere(p, getCenter(2, uTime), getRadius(2)), k);
    d = smin(d, sdSphere(p, getCenter(3, uTime), getRadius(3)), k);
    d = smin(d, sdSphere(p, getCenter(4, uTime), getRadius(4)), k);
    d = smin(d, sdSphere(p, getCenter(5, uTime), getRadius(5)), k);
    d = smin(d, sdSphere(p, getCenter(6, uTime), getRadius(6)), k);
    return d;
  }
  vec3 sceneColor(vec3 p) {
    float sharpness = uColorSharpness;
    vec3 totalColor = vec3(0.0);
    float totalWeight = 0.0;
    float d0 = length(p - getCenter(0,uTime)) - getRadius(0); float w0 = exp(-d0*sharpness); totalColor += getColor(0)*w0; totalWeight += w0;
    float d1 = length(p - getCenter(1,uTime)) - getRadius(1); float w1 = exp(-d1*sharpness); totalColor += getColor(1)*w1; totalWeight += w1;
    float d2 = length(p - getCenter(2,uTime)) - getRadius(2); float w2 = exp(-d2*sharpness); totalColor += getColor(2)*w2; totalWeight += w2;
    float d3 = length(p - getCenter(3,uTime)) - getRadius(3); float w3 = exp(-d3*sharpness); totalColor += getColor(3)*w3; totalWeight += w3;
    float d4 = length(p - getCenter(4,uTime)) - getRadius(4); float w4 = exp(-d4*sharpness); totalColor += getColor(4)*w4; totalWeight += w4;
    float d5 = length(p - getCenter(5,uTime)) - getRadius(5); float w5 = exp(-d5*sharpness); totalColor += getColor(5)*w5; totalWeight += w5;
    float d6 = length(p - getCenter(6,uTime)) - getRadius(6); float w6 = exp(-d6*sharpness); totalColor += getColor(6)*w6; totalWeight += w6;
    return totalColor / totalWeight;
  }
  vec3 calcNormal(vec3 p) {
    float e = 0.003;
    vec2 h = vec2(e, -e);
    return normalize(
      h.xyy*sceneSDF(p+h.xyy) + h.yyx*sceneSDF(p+h.yyx) +
      h.yxy*sceneSDF(p+h.yxy) + h.xxx*sceneSDF(p+h.xxx)
    );
  }
  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= aspect;
    vec3 ro = vec3(0.0, 0.0, -4.5);
    vec3 rd = normalize(vec3(uv, 1.5));
    float totalDist = 0.0;
    bool hit = false;
    vec3 hitPos;
    for (int i = 0; i < 36; i++) {
      vec3 p = ro + rd * totalDist;
      float d = sceneSDF(p);
      totalDist += d;
      if (d < 0.003) { hit = true; hitPos = p; break; }
      if (totalDist > 12.0) break;
    }
    if (!hit) {
      gl_FragColor = vec4(uBgColor, 1.0);
      return;
    }
    vec3 normal = calcNormal(hitPos);
    vec3 baseColor = sceneColor(hitPos);
    vec3 viewDir = -rd;
    vec3 lightDir = normalize(vec3(2.0, 3.0, -2.0));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 128.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
    float wrapDiffuse = max(0.0, (dot(normal, lightDir) + 0.5) / 1.5);
    float backScatter = pow(clamp(dot(viewDir, -lightDir), 0.0, 1.0), 2.0);
    float thickness = clamp(1.0 - fresnel, 0.0, 1.0);
    float sss = (wrapDiffuse*0.6 + backScatter*0.8 + thickness*0.4) * uSubsurface;
    vec3 finalColor = baseColor*(diff + uAmbient) + vec3(1.0)*spec*0.6 + baseColor*sss;
    // Fade edges into exact bg color
    finalColor = mix(finalColor, uBgColor, fresnel * 0.5);
    // Reinhard + gamma on blob only
    finalColor = finalColor / (finalColor + vec3(1.0));
    finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(1.0/2.2));
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const blobMat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
        uTime:           { value: 0.0 },
        uResolution:     { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uMouse:          { value: new THREE.Vector3(0.0, 0.0, -10.0) },
        uBlend:          { value: 1.2 },
        uSubsurface:     { value: 1.0 },
        uAmbient:        { value: 0.18 },
        uColorSharpness: { value: 6.0 },
        uBgColor:        { value: new THREE.Color(0x0b0b0b) },
    }
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blobMat);
blobScene.add(quad);

const blobClock = new THREE.Clock();
requestAnimationFrame(blobResize); // correct size after layout paints

// Mouse on section — catches cursor over text AND canvas
// Project NDC onto z=0 plane with camera at z=-3.5, focal=1.5
section.addEventListener('mousemove', e => {
    const rect = section.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    const aspect = (W() || window.innerWidth) / (H() || window.innerHeight);
    const worldX = ndcX * aspect * (4.5 / 1.5);
    const worldY = ndcY * (4.5 / 1.5);
    blobMat.uniforms.uMouse.value.set(worldX, worldY, 0.0);
});
section.addEventListener('mouseleave', () => {
    blobMat.uniforms.uMouse.value.set(0.0, 0.0, -10.0);
});

function blobAnimate() {
    requestAnimationFrame(blobAnimate);
    blobMat.uniforms.uTime.value = blobClock.getElapsedTime();
    renderer.render(blobScene, blobCamera);
}
blobAnimate();

window.addEventListener('resize', blobResize);

}
