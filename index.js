import * as THREE from 'three';
import { EffectComposer } from 'jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'jsm/postprocessing/UnrealBloomPass.js';
import spline from './spline.js';

const w = window.innerWidth;
const h = window.innerHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070f);
scene.fog = new THREE.FogExp2(0x04070f, 0.55);
const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.set(0, 0, 5);
const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(w, h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

//post processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 100);
bloomPass.threshold = 0.002;
bloomPass.strength = 3.5;
bloomPass.radius = 0;
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const points = spline.getPoints(100);
const geometry = new THREE.BufferGeometry().setFromPoints(points);
const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
const line = new THREE.Line(geometry, material);
// scene.add(line);



const tubeSegments = 222;
const tubeRadius = 0.65;
const railCount = 14;
const tubeRadialSegments = railCount;
const tubeGeometry = new THREE.TubeGeometry(spline, tubeSegments, tubeRadius, 16, true);
const frenetFrames = tubeGeometry.parameters.path.computeFrenetFrames(tubeSegments, true);

const tunnelWireGroup = new THREE.Group();
const pathLength = tubeGeometry.parameters.path.getLength();
const ringSpacing = (2 * Math.PI * tubeRadius) / railCount;
const ringCount = Math.max(48, Math.round(pathLength / ringSpacing));
const forwardSpeed = pathLength / 80;
const strafeSpeed = 1.25;
const maxCameraOffset = tubeRadius * 0.78;
const lookAheadDistance = 1.8;
let cameraProgress = 0;
const cameraOffset = new THREE.Vector2(0, 0);
const pressedKeys = { w: false, a: false, s: false, d: false };
const cameraSmoothing = 9;
const smoothedCameraPos = new THREE.Vector3();
const smoothedLookAt = new THREE.Vector3();
const smoothedCameraUp = new THREE.Vector3(0, 1, 0);
let cameraStateReady = false;
const currentNormal = new THREE.Vector3();
const currentBinormal = new THREE.Vector3();
const lookNormal = new THREE.Vector3();
const lookBinormal = new THREE.Vector3();
const tmpTangent = new THREE.Vector3();
const tmpCross = new THREE.Vector3();
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function setMoveKeyState(key, isPressed) {
    if (key in pressedKeys) {
        pressedKeys[key] = isPressed;
    }
}

window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in pressedKeys) {
        setMoveKeyState(key, true);
        event.preventDefault();
    }
});

window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in pressedKeys) {
        setMoveKeyState(key, false);
        event.preventDefault();
    }
});

function createTouchController() {
    const touchPad = document.createElement('div');
    touchPad.style.position = 'fixed';
    touchPad.style.left = '16px';
    touchPad.style.bottom = '16px';
    touchPad.style.width = '168px';
    touchPad.style.height = '168px';
    touchPad.style.display = 'grid';
    touchPad.style.gridTemplateColumns = 'repeat(3, 1fr)';
    touchPad.style.gridTemplateRows = 'repeat(3, 1fr)';
    touchPad.style.gap = '8px';
    touchPad.style.zIndex = '20';
    touchPad.style.touchAction = 'none';
    touchPad.style.userSelect = 'none';

    const buttons = [
        { key: 'w', row: 1, col: 2, label: '↑' },
        { key: 'a', row: 2, col: 1, label: '←' },
        { key: 's', row: 3, col: 2, label: '↓' },
        { key: 'd', row: 2, col: 3, label: '→' }
    ];

    const bindTouchKey = (element, key) => {
        const press = (event) => {
            event.preventDefault();
            setMoveKeyState(key, true);
            element.style.transform = 'scale(0.96)';
            element.style.background = 'rgba(88, 169, 255, 0.35)';
            element.style.borderColor = 'rgba(120, 190, 255, 0.95)';
        };
        const release = (event) => {
            event.preventDefault();
            setMoveKeyState(key, false);
            element.style.transform = 'scale(1)';
            element.style.background = 'rgba(18, 32, 52, 0.68)';
            element.style.borderColor = 'rgba(115, 165, 255, 0.6)';
        };

        element.addEventListener('pointerdown', press);
        element.addEventListener('pointerup', release);
        element.addEventListener('pointerleave', release);
        element.addEventListener('pointercancel', release);
    };

    buttons.forEach((buttonDef) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = buttonDef.label;
        button.style.gridRow = String(buttonDef.row);
        button.style.gridColumn = String(buttonDef.col);
        button.style.width = '100%';
        button.style.height = '100%';
        button.style.borderRadius = '14px';
        button.style.border = '1px solid rgba(115, 165, 255, 0.6)';
        button.style.background = 'rgba(18, 32, 52, 0.68)';
        button.style.color = '#dff1ff';
        button.style.fontSize = '28px';
        button.style.fontWeight = '700';
        button.style.backdropFilter = 'blur(8px)';
        button.style.webkitBackdropFilter = 'blur(8px)';
        button.style.padding = '0';
        button.style.cursor = 'pointer';
        button.style.touchAction = 'none';
        button.style.transition = 'transform 100ms ease, background 100ms ease, border-color 100ms ease';
        bindTouchKey(button, buttonDef.key);
        touchPad.appendChild(button);
    });

    document.body.appendChild(touchPad);
}

if (isTouchDevice) {
    createTouchController();
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
}

window.addEventListener('resize', onWindowResize);

function getFrameVectorsAt(t, normalOut, binormalOut) {
    const framePos = t * tubeSegments;
    const i0 = Math.floor(framePos) % tubeSegments;
    const i1 = (i0 + 1) % tubeSegments;
    const alpha = framePos - Math.floor(framePos);

    normalOut.copy(frenetFrames.normals[i0]).lerp(frenetFrames.normals[i1], alpha).normalize();
    binormalOut.copy(frenetFrames.binormals[i0]).lerp(frenetFrames.binormals[i1], alpha).normalize();

    tmpTangent.copy(tubeGeometry.parameters.path.getTangentAt(t)).normalize();
    binormalOut.copy(tmpCross.crossVectors(tmpTangent, normalOut)).normalize();
    normalOut.crossVectors(binormalOut, tmpTangent).normalize();
}
for (let i = 0; i < ringCount; i += 1) {
    const t = i / ringCount;
    const frameIndex = Math.floor(t * tubeSegments) % tubeSegments;
    const centerPoint = tubeGeometry.parameters.path.getPointAt(t);
    const normal = frenetFrames.normals[frameIndex];
    const binormal = frenetFrames.binormals[frameIndex];
    const ringPoints = [];
    for (let j = 0; j <= tubeRadialSegments; j += 1) {
        const angle = (j / tubeRadialSegments) * Math.PI * 2;
        const ringPoint = centerPoint.clone()
            .add(normal.clone().multiplyScalar(Math.cos(angle) * tubeRadius))
            .add(binormal.clone().multiplyScalar(Math.sin(angle) * tubeRadius));
        ringPoints.push(ringPoint);
    }
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringColor = new THREE.Color().setHSL((0.52 + t * 0.25) % 1, 0.95, 0.6);
    const ringMaterial = new THREE.LineBasicMaterial({ color: ringColor, transparent: true, opacity: 0.85 });
    tunnelWireGroup.add(new THREE.Line(ringGeometry, ringMaterial));
}

for (let r = 0; r < railCount; r += 1) {
    const railAngle = (r / railCount) * Math.PI * 2;
    const railPoints = [];
    for (let i = 0; i <= tubeSegments; i += 1) {
        const t = i / tubeSegments;
        const frameIndex = i % tubeSegments;
        const centerPoint = tubeGeometry.parameters.path.getPointAt(t);
        const normal = frenetFrames.normals[frameIndex];
        const binormal = frenetFrames.binormals[frameIndex];
        const railPoint = centerPoint.clone()
            .add(normal.clone().multiplyScalar(Math.cos(railAngle) * tubeRadius))
            .add(binormal.clone().multiplyScalar(Math.sin(railAngle) * tubeRadius));
        railPoints.push(railPoint);
    }
    const railGeometry = new THREE.BufferGeometry().setFromPoints(railPoints);
    const railColor = new THREE.Color().setHSL((0.52 + (r / railCount) * 0.2) % 1, 0.95, 0.55);
    const railMaterial = new THREE.LineBasicMaterial({ color: railColor, transparent: true, opacity: 0.95 });
    tunnelWireGroup.add(new THREE.Line(railGeometry, railMaterial));
}
scene.add(tunnelWireGroup);

const starCount = 1800;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starColor = new THREE.Color();
const starMinRadius = tubeRadius * 1.2;
const starMaxRadius = tubeRadius * 3.2;
for (let i = 0; i < starCount; i += 1) {
    const p = Math.random();
    const frameIndex = Math.floor(p * tubeSegments) % tubeSegments;
    const centerPoint = tubeGeometry.parameters.path.getPointAt(p);
    const normal = frenetFrames.normals[frameIndex];
    const binormal = frenetFrames.binormals[frameIndex];
    const angle = Math.random() * Math.PI * 2;
    const radialOffset = starMinRadius + Math.pow(Math.random(), 0.8) * (starMaxRadius - starMinRadius);
    const starPoint = centerPoint.clone()
        .add(normal.clone().multiplyScalar(Math.cos(angle) * radialOffset))
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * radialOffset));

    starPositions[i * 3] = starPoint.x;
    starPositions[i * 3 + 1] = starPoint.y;
    starPositions[i * 3 + 2] = starPoint.z;

    const hue = 0.54 + (Math.random() - 0.5) * 0.12;
    const saturation = 0.35 + Math.random() * 0.55;
    const lightness = 0.68 + Math.random() * 0.25;
    starColor.setHSL(hue, saturation, lightness);
    starColors[i * 3] = starColor.r;
    starColors[i * 3 + 1] = starColor.g;
    starColors[i * 3 + 2] = starColor.b;
}

const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
const starMaterial = new THREE.PointsMaterial({
    size: 0.03,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
});
const starField = new THREE.Points(starGeometry, starMaterial);
scene.add(starField);

function getInsideTubeTransform(p, maxRadiusFactor = 0.7) {
    const frameIndex = Math.floor(p * tubeSegments) % tubeSegments;
    const normal = frenetFrames.normals[frameIndex].clone();
    const binormal = frenetFrames.binormals[frameIndex].clone();
    const angle = Math.random() * Math.PI * 2;
    const radialOffset = Math.random() * tubeRadius * maxRadiusFactor;
    const centerPoint = tubeGeometry.parameters.path.getPointAt(p);
    const offset = normal.multiplyScalar(Math.cos(angle) * radialOffset)
        .add(binormal.multiplyScalar(Math.sin(angle) * radialOffset));
    const rotation = new THREE.Vector3(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
    );
    return {
        position: centerPoint.add(offset),
        rotation
    };
}

const numBoxes = 40;
const size = 0.075;
const boxGeometry = new THREE.BoxGeometry(size, size, size);
for (let i = 0; i < numBoxes; i += 1) {
    const boxColor = new THREE.Color().setHSL(Math.random(), 0.9, 0.65);
    const boxMaterial = new THREE.MeshBasicMaterial({ color: boxColor });
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    const p = (i / numBoxes + Math.random() * 0.1) % 1;
    const transform = getInsideTubeTransform(p);
    boxMesh.position.copy(transform.position);
    boxMesh.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry, 0.2);
    const lineMaterial = new THREE.LineBasicMaterial({ color: boxColor.clone().offsetHSL(0, 0, 0.2) });
    const boxLine = new THREE.LineSegments(edgesGeometry, lineMaterial);
    boxLine.position.copy(boxMesh.position);
    boxLine.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
    scene.add(boxMesh);
    scene.add(boxLine);
}

const numPrisms = 32;
for (let i = 0; i < numPrisms; i += 1) {
    const prismSize = size * (0.9 + Math.random() * 1.6);
    const prismGeometry = new THREE.TetrahedronGeometry(prismSize);
    const prismColor = new THREE.Color().setHSL(Math.random(), 0.85, 0.62);
    const prismMaterial = new THREE.MeshBasicMaterial({ color: prismColor });
    const prismMesh = new THREE.Mesh(prismGeometry, prismMaterial);
    const p = (i / numPrisms + Math.random() * 0.2) % 1;
    const transform = getInsideTubeTransform(p, 0.65);
    prismMesh.position.copy(transform.position);
    prismMesh.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);

    const prismEdgesGeometry = new THREE.EdgesGeometry(prismGeometry, 0.2);
    const prismLineMaterial = new THREE.LineBasicMaterial({ color: prismColor.clone().offsetHSL(0, 0, 0.18) });
    const prismLine = new THREE.LineSegments(prismEdgesGeometry, prismLineMaterial);
    prismLine.position.copy(prismMesh.position);
    prismLine.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);

    scene.add(prismMesh);
    scene.add(prismLine);
}


function updateCamera(t) {
    const deltaSeconds = t;
    const inputX = (pressedKeys.d ? 1 : 0) - (pressedKeys.a ? 1 : 0);
    const inputY = (pressedKeys.w ? 1 : 0) - (pressedKeys.s ? 1 : 0);
    const inputLength = Math.hypot(inputX, inputY);

    if (inputLength > 0) {
        cameraOffset.x += (inputX / inputLength) * strafeSpeed * deltaSeconds;
        cameraOffset.y += (inputY / inputLength) * strafeSpeed * deltaSeconds;
        const offsetLength = cameraOffset.length();
        if (offsetLength > maxCameraOffset) {
            cameraOffset.multiplyScalar(maxCameraOffset / offsetLength);
        }
    }

    cameraProgress = (cameraProgress + (forwardSpeed * deltaSeconds) / pathLength) % 1;
    const centerPoint = tubeGeometry.parameters.path.getPointAt(cameraProgress);
    getFrameVectorsAt(cameraProgress, currentNormal, currentBinormal);

    const worldOffset = currentNormal.clone().multiplyScalar(cameraOffset.y)
        .add(currentBinormal.clone().multiplyScalar(cameraOffset.x));
    const targetPos = centerPoint.clone().add(worldOffset);

    const lookAheadT = (cameraProgress + lookAheadDistance / pathLength) % 1;
    const lookCenter = tubeGeometry.parameters.path.getPointAt(lookAheadT);
    getFrameVectorsAt(lookAheadT, lookNormal, lookBinormal);
    const lookOffset = lookNormal.clone().multiplyScalar(cameraOffset.y)
        .add(lookBinormal.clone().multiplyScalar(cameraOffset.x));
    const targetLookAt = lookCenter.add(lookOffset);

    if (!cameraStateReady) {
        smoothedCameraPos.copy(targetPos);
        smoothedLookAt.copy(targetLookAt);
        smoothedCameraUp.copy(currentNormal);
        cameraStateReady = true;
    } else {
        const blend = 1 - Math.exp(-cameraSmoothing * deltaSeconds);
        smoothedCameraPos.lerp(targetPos, blend);
        smoothedLookAt.lerp(targetLookAt, blend);
        smoothedCameraUp.lerp(currentNormal, blend).normalize();
    }

    camera.position.copy(smoothedCameraPos);
    camera.up.copy(smoothedCameraUp);
    camera.lookAt(smoothedLookAt);
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    updateCamera(clock.getDelta());
    composer.render();
}
animate();