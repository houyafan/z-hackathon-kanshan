import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const DEFAULT_GHOST_TRAIL_CONFIG = {
    maxGhostCount: 8,
    spawnIntervalFrames: 5,
    initialOpacity: 0.4,
    fadeSpeed: 0.05,
    onlyWhenMoving: true,
    keepTransform: true,
};

export function createGhostTrail(petModel, scene, config = {}) {
    const currentConfig = { ...DEFAULT_GHOST_TRAIL_CONFIG, ...config };
    const ghostList = [];
    let frameCounter = 0;

    const disposeMaterial = (material) => {
        if (!material) return;
        if (Array.isArray(material)) {
            material.forEach(disposeMaterial);
            return;
        }
        material.dispose();
    };

    const disposeGhost = (ghost) => {
        scene.remove(ghost);
        ghost.traverse((child) => {
            if (!child.isMesh) return;
            disposeMaterial(child.material);
        });
    };

    const applyGhostOpacity = (ghost, opacity) => {
        ghost.userData.ghostOpacity = opacity;
        ghost.traverse((child) => {
            if (!child.isMesh) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                material.opacity = opacity;
            });
        });
    };

    const createGhost = () => {
        const ghost = petModel.clone(true);
        ghost.userData.ghostOpacity = currentConfig.initialOpacity;

        ghost.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            const ghostMaterials = materials.map((material) => {
                const clonedMaterial = material.clone();
                clonedMaterial.transparent = true;
                clonedMaterial.opacity = currentConfig.initialOpacity;
                clonedMaterial.depthWrite = false;
                return clonedMaterial;
            });
            child.material = Array.isArray(child.material) ? ghostMaterials : ghostMaterials[0];
        });

        if (currentConfig.keepTransform) {
            ghost.position.copy(petModel.position);
            ghost.quaternion.copy(petModel.quaternion);
            ghost.scale.copy(petModel.scale);
        }

        scene.add(ghost);
        ghostList.push(ghost);

        while (ghostList.length > currentConfig.maxGhostCount) {
            disposeGhost(ghostList.shift());
        }
    };

    const updateTrail = (isMoving) => {
        frameCounter += 1;
        const canSpawn = (!currentConfig.onlyWhenMoving || isMoving) && petModel.visible !== false;

        if (canSpawn && frameCounter % currentConfig.spawnIntervalFrames === 0) {
            createGhost();
        }

        for (let index = ghostList.length - 1; index >= 0; index -= 1) {
            const ghost = ghostList[index];
            const nextOpacity = Math.max(0, ghost.userData.ghostOpacity - currentConfig.fadeSpeed);
            applyGhostOpacity(ghost, nextOpacity);

            if (nextOpacity <= 0) {
                ghostList.splice(index, 1);
                disposeGhost(ghost);
            }
        }
    };

    updateTrail.dispose = () => {
        while (ghostList.length > 0) {
            disposeGhost(ghostList.pop());
        }
    };
    updateTrail.count = () => ghostList.length;

    return updateTrail;
}

const DEFAULT_EMOJI_BUBBLE_CONFIG = {
    headOffsetY: 1.3,
    bubbleWidth: 1.4,
    bubbleHeight: 0.7,
    tailSize: 0.22,
    bgColor: 0xffffff,
    borderColor: 0xe63946,
    textColor: 0x222222,
    fontSize: 0.18,
    emojiScale: 0.25,
    fadeInTime: 0.3,
    fadeOutTime: 0.25,
    breathPulseRange: 0.04,
    enablePopScale: true,
};

function createRoundedRectShape(width, height, radius) {
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
}

function createBubbleBorderGeometry(width, height, borderWidth) {
    const radius = Math.min(width, height) * 0.18;
    const outer = createRoundedRectShape(width, height, radius);
    const inner = createRoundedRectShape(width - borderWidth * 2, height - borderWidth * 2, Math.max(0.01, radius - borderWidth));
    outer.holes.push(inner);
    return new THREE.ShapeGeometry(outer);
}

function colorToCanvasValue(color) {
    return `#${new THREE.Color(color).getHexString()}`;
}

function isMostlyEmoji(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    const nonEmojiText = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]/gu, "");
    return nonEmojiText.length === 0 && [...text].length <= 6;
}

export function createPetEmojiBubble(petModel, scene, config = {}) {
    const cfg = { ...DEFAULT_EMOJI_BUBBLE_CONFIG, ...config };
    const bubbleRoot = new THREE.Group();
    const baseScale = new THREE.Vector3(1, 1, 1);
    const targetScale = new THREE.Vector3(1, 1, 1);
    let contentSprite = null;
    let isShow = false;
    let curOpacity = 0;
    let targetOpacity = 0;
    let pulseTime = 0;
    let lastUpdateAt = performance.now();
    let popProgress = 1;

    bubbleRoot.position.y = cfg.headOffsetY;
    bubbleRoot.visible = false;
    petModel.add(bubbleRoot);

    const bgGeometry = new THREE.ShapeGeometry(createRoundedRectShape(cfg.bubbleWidth, cfg.bubbleHeight, Math.min(cfg.bubbleWidth, cfg.bubbleHeight) * 0.18));
    const bubbleBg = new THREE.Mesh(
        bgGeometry,
        new THREE.MeshBasicMaterial({
            color: cfg.bgColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    );
    bubbleBg.position.z = 0;

    const bubbleBorder = new THREE.Mesh(
        createBubbleBorderGeometry(cfg.bubbleWidth, cfg.bubbleHeight, 0.035),
        new THREE.MeshBasicMaterial({
            color: cfg.borderColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    );
    bubbleBorder.position.z = 0.002;

    const tailShape = new THREE.Shape();
    tailShape.moveTo(-cfg.tailSize * 0.55, -cfg.bubbleHeight / 2 + 0.02);
    tailShape.lineTo(0, -cfg.bubbleHeight / 2 - cfg.tailSize);
    tailShape.lineTo(cfg.tailSize * 0.55, -cfg.bubbleHeight / 2 + 0.02);
    tailShape.lineTo(-cfg.tailSize * 0.55, -cfg.bubbleHeight / 2 + 0.02);
    const bubbleTail = new THREE.Mesh(
        new THREE.ShapeGeometry(tailShape),
        new THREE.MeshBasicMaterial({
            color: cfg.borderColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    );
    bubbleTail.position.z = -0.001;

    bubbleRoot.add(bubbleTail, bubbleBg, bubbleBorder);

    const disposeContentSprite = () => {
        if (!contentSprite) return;
        bubbleRoot.remove(contentSprite);
        contentSprite.material.map?.dispose();
        contentSprite.material.dispose();
        contentSprite = null;
    };

    const drawContent = (value) => {
        disposeContentSprite();

        const message = String(value ?? "");
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = colorToCanvasValue(cfg.textColor);
        context.textAlign = "center";
        context.textBaseline = "middle";

        const emojiOnly = isMostlyEmoji(message);
        const maxWidth = canvas.width * 0.82;
        let fontPx = emojiOnly ? Math.round(210 * (cfg.emojiScale / DEFAULT_EMOJI_BUBBLE_CONFIG.emojiScale)) : Math.round(92 * (cfg.fontSize / DEFAULT_EMOJI_BUBBLE_CONFIG.fontSize));
        fontPx = Math.max(42, Math.min(240, fontPx));
        const fontFamily = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
        context.font = `700 ${fontPx}px ${fontFamily}`;

        while (context.measureText(message).width > maxWidth && fontPx > 42) {
            fontPx -= 4;
            context.font = `700 ${fontPx}px ${fontFamily}`;
        }

        context.lineJoin = "round";
        context.strokeStyle = "rgba(255, 255, 255, 0.82)";
        context.lineWidth = emojiOnly ? 0 : 8;
        if (!emojiOnly) {
            context.strokeText(message, canvas.width / 2, canvas.height / 2 + 4);
        }
        context.fillText(message, canvas.width / 2, canvas.height / 2 + 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        contentSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: curOpacity,
                depthWrite: false,
            })
        );
        contentSprite.scale.set(cfg.bubbleWidth * 0.92, cfg.bubbleHeight * 0.68, 1);
        contentSprite.position.z = 0.012;
        bubbleRoot.add(contentSprite);
    };

    const setOpacity = (opacity) => {
        bubbleBg.material.opacity = opacity;
        bubbleBorder.material.opacity = opacity;
        bubbleTail.material.opacity = opacity;
        if (contentSprite) {
            contentSprite.material.opacity = opacity;
        }
    };

    return {
        show(message) {
            drawContent(message);
            targetOpacity = 1;
            isShow = true;
            bubbleRoot.visible = true;
            if (cfg.enablePopScale) {
                popProgress = 0;
                bubbleRoot.scale.setScalar(0.2);
            }
        },

        hide() {
            targetOpacity = 0;
            isShow = false;
        },

        update(camera) {
            const now = performance.now();
            const delta = Math.min((now - lastUpdateAt) / 1000, 0.05);
            lastUpdateAt = now;

            const fadeTime = targetOpacity > curOpacity ? cfg.fadeInTime : cfg.fadeOutTime;
            const step = fadeTime > 0 ? delta / fadeTime : 1;
            curOpacity += (targetOpacity - curOpacity) * Math.min(1, step * 4);
            if (Math.abs(curOpacity - targetOpacity) < 0.01) {
                curOpacity = targetOpacity;
            }
            setOpacity(curOpacity);

            if (curOpacity <= 0 && !isShow) {
                bubbleRoot.visible = false;
                disposeContentSprite();
                return;
            }

            bubbleRoot.visible = true;
            const cameraPosition = new THREE.Vector3();
            camera.getWorldPosition(cameraPosition);
            bubbleRoot.lookAt(cameraPosition);

            pulseTime += delta * 2.4;
            const floatOffset = Math.sin(pulseTime) * 0.06;
            bubbleRoot.position.y = cfg.headOffsetY + floatOffset;

            let popScale = 1;
            if (cfg.enablePopScale && popProgress < 1) {
                popProgress = Math.min(1, popProgress + delta / Math.max(0.001, cfg.fadeInTime));
                const t = popProgress;
                popScale = 1 + 0.12 * Math.sin(Math.PI * t);
            }
            const breathScale = 1 + Math.sin(pulseTime) * cfg.breathPulseRange;
            targetScale.setScalar(breathScale * popScale);
            bubbleRoot.scale.lerpVectors(baseScale, targetScale, 1);
        },
    };
}

const DEFAULT_EVOLVE_EFFECT_CONFIG = {
    riseHeight: 0.88,
    riseDuration: 1.2,
    ringCount: 4,
    ringStartRadius: 0.95,
    ringExpandSpeed: 1.18,
    ringRotateSpeed: 2.05,
    ringColor: 0xffd700,
    bloomIntensityStart: 3.4,
    bloomIntensityEnd: 0.8,
    particleCount: 240,
    particleColor: 0xffdd44,
    particleUpSpeed: 1.45,
    particleSpread: 1.65,
    evolveScaleMultiplier: 1.28,
    scalePunchFactor: 1.22,
    evolveTotalTime: 3.8,
};

export function createPetEvolveEffect(petModel, scene, renderer, composer = null, bloomPass = null, config = {}) {
    const cfg = { ...DEFAULT_EVOLVE_EFFECT_CONFIG, ...config };
    let isEvolving = false;
    let evolveTime = 0;
    let originY = petModel.position.y;
    let originScale = petModel.scale.clone();
    let ringList = [];
    let particles = null;
    let particleGeometry = null;
    let particleMaterial = null;
    let particleVelocities = [];
    let glowLight = null;
    let halo = null;
    const defaultBloomStrength = bloomPass?.strength ?? cfg.bloomIntensityEnd;

    const easeOutQuad = (value) => {
        const t = Math.max(0, Math.min(1, value));
        return 1 - (1 - t) * (1 - t);
    };

    const lerp = (from, to, t) => from + (to - from) * Math.max(0, Math.min(1, t));

    const disposeMaterial = (material) => {
        if (!material) return;
        if (Array.isArray(material)) {
            material.forEach(disposeMaterial);
            return;
        }
        material.map?.dispose();
        material.dispose();
    };

    const cleanup = () => {
        ringList.forEach((ring) => {
            scene.remove(ring);
            ring.geometry?.dispose();
            disposeMaterial(ring.material);
        });
        ringList = [];

        if (particles) {
            scene.remove(particles);
        }
        particleGeometry?.dispose();
        disposeMaterial(particleMaterial);
        particles = null;
        particleGeometry = null;
        particleMaterial = null;
        particleVelocities = [];

        if (glowLight) {
            scene.remove(glowLight);
            glowLight = null;
        }
        if (halo) {
            scene.remove(halo);
            halo.geometry?.dispose();
            disposeMaterial(halo.material);
            halo = null;
        }
    };

    const createEvolveRings = () => {
        for (let index = 0; index < cfg.ringCount; index += 1) {
            const geometry = new THREE.RingGeometry(cfg.ringStartRadius, cfg.ringStartRadius + 0.18, 96);
            const material = new THREE.MeshBasicMaterial({
                color: cfg.ringColor,
                transparent: true,
                opacity: 0.82 - index * 0.1,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const ring = new THREE.Mesh(geometry, material);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(petModel.position.x, originY - 0.46 + index * 0.03, petModel.position.z);
            ring.userData.expandRadius = 0.86 + index * 0.24;
            ring.userData.delay = index * 0.18;
            scene.add(ring);
            ringList.push(ring);
        }
    };

    const createEvolveParticles = () => {
        particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(cfg.particleCount * 3);
        particleVelocities = [];

        for (let index = 0; index < cfg.particleCount; index += 1) {
            const i3 = index * 3;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 1.06;
            positions[i3] = petModel.position.x + Math.cos(angle) * radius;
            positions[i3 + 1] = originY - 0.32 + Math.random() * 0.18;
            positions[i3 + 2] = petModel.position.z + Math.sin(angle) * radius;

            particleVelocities.push({
                x: (Math.random() - 0.5) * cfg.particleSpread,
                y: 0.42 + Math.random() * cfg.particleUpSpeed,
                z: (Math.random() - 0.5) * cfg.particleSpread,
            });
        }

        particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        particleMaterial = new THREE.PointsMaterial({
            color: cfg.particleColor,
            size: 0.066,
            transparent: true,
            opacity: 0.52,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);
    };

    const createGlowFallback = () => {
        glowLight = new THREE.PointLight(cfg.particleColor, 3.8, 4.6);
        glowLight.position.set(petModel.position.x, originY + 0.35, petModel.position.z + 0.6);
        scene.add(glowLight);

        const haloMaterial = new THREE.MeshBasicMaterial({
            color: cfg.particleColor,
            transparent: true,
            opacity: 0.04,
            side: THREE.BackSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        halo = new THREE.Mesh(new THREE.SphereGeometry(1.22, 36, 24), haloMaterial);
        halo.position.set(petModel.position.x, originY + 0.28, petModel.position.z);
        halo.scale.set(0.82, 1.08, 0.82);
        scene.add(halo);
    };

    const endEvolve = () => {
        isEvolving = false;
        cleanup();
        petModel.position.y = originY;
        petModel.scale.copy(originScale);
        if (bloomPass) {
            bloomPass.strength = defaultBloomStrength;
        }
    };

    return {
        start() {
            if (isEvolving) return;
            cleanup();
            isEvolving = true;
            evolveTime = 0;
            originY = petModel.position.y;
            originScale = petModel.scale.clone();
            if (bloomPass) {
                bloomPass.strength = cfg.bloomIntensityStart;
            }
            createEvolveRings();
            createEvolveParticles();
            createGlowFallback();
        },

        update(deltaTime = 1 / 60) {
            if (!isEvolving) return;
            evolveTime += deltaTime;
            const totalProgress = Math.min(evolveTime / cfg.evolveTotalTime, 1);
            const riseProgress = Math.min(evolveTime / cfg.riseDuration, 1);
            const riseEase = easeOutQuad(riseProgress);
            petModel.position.y = originY + riseEase * cfg.riseHeight - totalProgress * cfg.riseHeight * 0.72;

            const shrinkPhase = Math.min(evolveTime / 0.42, 1);
            const punchPhase = Math.max(0, Math.min((evolveTime - 0.42) / 0.9, 1));
            const settlePhase = Math.max(0, Math.min((evolveTime - 1.32) / 1.25, 1));
            const returnPhase = Math.max(0, Math.min((evolveTime - (cfg.evolveTotalTime - 0.65)) / 0.65, 1));
            const shrinkScale = 1 - 0.12 * Math.sin(shrinkPhase * Math.PI);
            const punchScale = 1 + (cfg.scalePunchFactor - 1) * Math.sin(punchPhase * Math.PI);
            const settleScale = lerp(shrinkScale * punchScale, 1, settlePhase);
            const displayScale = lerp(cfg.evolveScaleMultiplier, 1, easeOutQuad(returnPhase));
            petModel.scale.copy(originScale).multiplyScalar(settleScale * displayScale);

            ringList.forEach((ring) => {
                const delayed = Math.max(0, totalProgress - ring.userData.delay * 0.22);
                ring.userData.expandRadius += cfg.ringExpandSpeed * deltaTime;
                ring.scale.setScalar(ring.userData.expandRadius);
                ring.rotation.z += cfg.ringRotateSpeed * deltaTime;
                ring.material.opacity = Math.max(0, (0.86 - delayed * 0.82) * (1 - totalProgress * 0.22));
            });

            if (particleGeometry && particleMaterial) {
                const positionArray = particleGeometry.attributes.position.array;
                for (let index = 0; index < particleVelocities.length; index += 1) {
                    const i3 = index * 3;
                    const velocity = particleVelocities[index];
                    positionArray[i3] += velocity.x * deltaTime;
                    positionArray[i3 + 1] += velocity.y * deltaTime;
                    positionArray[i3 + 2] += velocity.z * deltaTime;
                    velocity.y -= 0.42 * deltaTime;
                    velocity.x *= 0.992;
                    velocity.z *= 0.992;
                }
                particleGeometry.attributes.position.needsUpdate = true;
                particleMaterial.opacity = Math.max(0, 0.52 * (1 - totalProgress));
            }

            const bloomStrength = lerp(cfg.bloomIntensityStart, cfg.bloomIntensityEnd, totalProgress);
            if (bloomPass) {
                bloomPass.strength = bloomStrength;
            }
            if (glowLight) {
                glowLight.intensity = Math.max(0, bloomStrength * 0.55 * (1 - totalProgress * 0.55));
            }
            if (halo) {
                halo.material.opacity = Math.max(0, 0.06 * Math.sin(Math.PI * totalProgress));
                halo.scale.setScalar(1.02 + Math.sin(Math.PI * totalProgress) * 0.58);
            }

            if (evolveTime >= cfg.evolveTotalTime) {
                endEvolve();
            }
        },

        isEvolving() {
            return isEvolving;
        },
    };
}

const DEFAULT_IDLE_RING_BAND_CONFIG = {
    orbitRadius: 1.6,
    orbitHeight: 0.4,
    tubeRadius: 0.06,
    tubeSegments: 64,
    color1: 0x66ccff,
    color2: 0xff88cc,
    rotateSpeed: 0.015,
    autoRotate: true,
    opacity: 0.85,
    attachToPet: true,
    attachTargetName: null,
};

export function createPetIdleRingBand(petModel, scene, config = {}) {
    const cfg = { ...DEFAULT_IDLE_RING_BAND_CONFIG, ...config };
    const idleRingBand = new THREE.Group();
    let isBandActive = true;
    let rotateAngle = 0;
    let coreMesh = null;
    let glowMesh = null;

    const disposeMesh = (mesh) => {
        if (!mesh) return;
        mesh.geometry?.dispose();
        mesh.material?.dispose();
    };

    const createCirclePath = () => {
        const points = [];
        for (let index = 0; index <= cfg.tubeSegments; index += 1) {
            const angle = (index / cfg.tubeSegments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(angle) * cfg.orbitRadius,
                cfg.orbitHeight,
                Math.sin(angle) * cfg.orbitRadius
            ));
        }
        return new THREE.CatmullRomCurve3(points, true);
    };

    const applyGradientColors = (geometry) => {
        const position = geometry.attributes.position;
        const colors = [];
        const startColor = new THREE.Color(cfg.color1);
        const endColor = new THREE.Color(cfg.color2);
        const color = new THREE.Color();

        for (let index = 0; index < position.count; index += 1) {
            const x = position.getX(index);
            const z = position.getZ(index);
            const angle = Math.atan2(z, x);
            const t = (angle + Math.PI) / (Math.PI * 2);
            const pulse = Math.sin(t * Math.PI);
            color.copy(startColor).lerp(endColor, pulse);
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    };

    const createTubeMesh = (radius, opacity) => {
        const geometry = new THREE.TubeGeometry(createCirclePath(), cfg.tubeSegments, radius, 16, true);
        applyGradientColors(geometry);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity,
            depthWrite: false,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
        });
        return new THREE.Mesh(geometry, material);
    };

    const rebuild = () => {
        if (coreMesh) {
            idleRingBand.remove(coreMesh);
            disposeMesh(coreMesh);
        }
        if (glowMesh) {
            idleRingBand.remove(glowMesh);
            disposeMesh(glowMesh);
        }
        glowMesh = createTubeMesh(cfg.tubeRadius * 2.35, cfg.opacity * 0.22);
        coreMesh = createTubeMesh(cfg.tubeRadius, cfg.opacity);
        idleRingBand.add(glowMesh, coreMesh);
    };

    rebuild();
    idleRingBand.visible = true;

    if (cfg.attachToPet) {
        const attachTarget = cfg.attachTargetName ? petModel.getObjectByName(cfg.attachTargetName) : petModel;
        (attachTarget || petModel).add(idleRingBand);
    } else {
        scene.add(idleRingBand);
    }

    return {
        show() {
            isBandActive = true;
            idleRingBand.visible = true;
        },

        hide() {
            isBandActive = false;
            idleRingBand.visible = false;
        },

        setColor(hexColor) {
            cfg.color1 = hexColor;
            cfg.color2 = hexColor;
            rebuild();
        },

        setColors(color1, color2 = color1) {
            cfg.color1 = color1;
            cfg.color2 = color2;
            rebuild();
        },

        setSpeed(value) {
            cfg.rotateSpeed = value;
        },

        setTubeRadius(value) {
            cfg.tubeRadius = value;
            rebuild();
        },

        setHeight(value) {
            cfg.orbitHeight = value;
            rebuild();
        },

        update(deltaTime = 1 / 60) {
            if (!isBandActive) return;
            if (cfg.autoRotate) {
                rotateAngle += cfg.rotateSpeed * deltaTime * 60;
                idleRingBand.rotation.y = rotateAngle;
            }
        },

        dispose() {
            if (idleRingBand.parent) {
                idleRingBand.parent.remove(idleRingBand);
            }
            disposeMesh(coreMesh);
            disposeMesh(glowMesh);
            coreMesh = null;
            glowMesh = null;
        },
    };
}

const DEFAULT_TRAVEL_GATE_CONFIG = {
    gateRadius: 0.92,
    gateRingCount: 3,
    gateColor: 0x1677ff,
    vortexColor: 0x66ccff,
    innerColor: 0x005dd8,
    centerOpacity: 0.34,
    innerOpacity: 0.3,
    ringOpacity: 0.92,
    gatePulseSpeed: 2.4,
    gateRotateSpeed: 1.25,
    gateDistance: 0.56,
    gateHeightOffset: 0.28,
    openDuration: 0.42,
    walkDistance: 0.56,
    fadeScaleMin: 0.05,
    fadeInDuration: 1.5,
    fadeOutDuration: 1.5,
    gateCloseDuration: 0.6,
    renderGateVisuals: false,
    travelState: "idle",
};

const TRAVEL_GATE_PALETTES = {
    departure: {
        gateColor: 0x1677ff,
        vortexColor: 0x66ccff,
        innerColor: 0x005dd8,
    },
    returning: {
        gateColor: 0xf5a623,
        vortexColor: 0xffd666,
        innerColor: 0x9a5b00,
    },
};

export function createPetTravelGate(petModel, scene, config = {}) {
    const cfg = { ...DEFAULT_TRAVEL_GATE_CONFIG, ...config };
    let travelState = cfg.travelState;
    let travelProgress = 0;
    let travelTime = 0;
    let gateOpenness = 0;
    let originPetPos = petModel.position.clone();
    let originPetScale = petModel.scale.clone();
    let originPetRotation = petModel.rotation.clone();
    let originalMaterials = [];
    let gateParts = [];
    let ringList = [];
    let centerPane = null;
    let innerPane = null;

    const gateGroup = new THREE.Group();
    gateGroup.visible = false;
    scene.add(gateGroup);

    const easeInOutCubic = (value) => {
        const t = Math.max(0, Math.min(1, value));
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const lerp = (from, to, t) => from + (to - from) * Math.max(0, Math.min(1, t));

    const captureMaterials = () => {
        originalMaterials = [];
        petModel.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                originalMaterials.push({
                    material,
                    opacity: material.opacity,
                    transparent: material.transparent,
                    depthWrite: material.depthWrite,
                });
                material.transparent = true;
            });
        });
    };

    const setPetOpacity = (opacity) => {
        originalMaterials.forEach(({ material }) => {
            material.opacity = opacity;
            material.transparent = true;
            material.depthWrite = opacity >= 0.98;
        });
    };

    const restoreMaterials = () => {
        originalMaterials.forEach(({ material, opacity, transparent, depthWrite }) => {
            material.opacity = opacity;
            material.transparent = transparent;
            material.depthWrite = depthWrite;
        });
        originalMaterials = [];
    };

    const disposeMesh = (mesh) => {
        mesh.geometry?.dispose();
        mesh.material?.dispose();
    };

    const createGate = () => {
        gateParts.forEach(disposeMesh);
        gateGroup.clear();
        gateParts = [];
        ringList = [];
        centerPane = null;
        innerPane = null;

        if (!cfg.renderGateVisuals) return;

        const vortexMaterial = new THREE.MeshBasicMaterial({
            color: cfg.vortexColor,
            transparent: true,
            opacity: cfg.centerOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        centerPane = new THREE.Mesh(new THREE.CircleGeometry(cfg.gateRadius * 0.76, 96), vortexMaterial);
        centerPane.userData.baseOpacity = cfg.centerOpacity;
        centerPane.userData.rotateDirection = -0.45;
        gateGroup.add(centerPane);
        gateParts.push(centerPane);

        const innerMaterial = new THREE.MeshBasicMaterial({
            color: cfg.innerColor,
            transparent: true,
            opacity: cfg.innerOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        innerPane = new THREE.Mesh(new THREE.CircleGeometry(cfg.gateRadius * 0.48, 72), innerMaterial);
        innerPane.position.z = 0.006;
        innerPane.userData.baseOpacity = cfg.innerOpacity;
        innerPane.userData.rotateDirection = 0.65;
        gateGroup.add(innerPane);
        gateParts.push(innerPane);

        for (let index = 0; index < cfg.gateRingCount; index += 1) {
            const ringRatio = 0.58 + index * 0.17;
            const inner = cfg.gateRadius * ringRatio;
            const outer = cfg.gateRadius * (ringRatio + 0.07);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: cfg.gateColor,
                transparent: true,
                opacity: cfg.ringOpacity - index * 0.12,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), ringMaterial);
            ring.position.z = 0.012 + index * 0.006;
            ring.userData.baseOpacity = cfg.ringOpacity - index * 0.12;
            ring.userData.rotateDirection = index % 2 === 0 ? 1 : -1;
            gateGroup.add(ring);
            ringList.push(ring);
            gateParts.push(ring);
        }
    };

    const applyPalette = (name) => {
        const palette = TRAVEL_GATE_PALETTES[name] || TRAVEL_GATE_PALETTES.departure;
        cfg.gateColor = palette.gateColor;
        cfg.vortexColor = palette.vortexColor;
        cfg.innerColor = palette.innerColor;

        if (centerPane?.material) {
            centerPane.material.color.setHex(cfg.vortexColor);
        }
        if (innerPane?.material) {
            innerPane.material.color.setHex(cfg.innerColor);
        }
        ringList.forEach((ring) => {
            ring.material?.color?.setHex(cfg.gateColor);
        });
    };

    const syncGatePosition = () => {
        gateGroup.position.set(
            originPetPos.x,
            originPetPos.y + cfg.gateHeightOffset,
            originPetPos.z + cfg.gateDistance
        );
    };

    const setGateOpacity = (openAmount, time = travelTime) => {
        const openness = Math.max(0, Math.min(1, openAmount));
        gateOpenness = openness;
        gateGroup.scale.setScalar(0.16 + easeInOutCubic(openness) * 0.84);

        gateParts.forEach((part, index) => {
            const direction = part.userData.rotateDirection || 1;
            part.rotation.z += cfg.gateRotateSpeed * direction * time * 0.002;
            const pulse = 0.78 + Math.sin(time * cfg.gatePulseSpeed + index * 0.7) * 0.22;
            part.material.opacity = (part.userData.baseOpacity || 0.35) * pulse * openness;
        });
    };

    const openGate = () => {
        gateGroup.visible = true;
        setGateOpacity(1);
    };

    const closeGate = () => {
        setGateOpacity(0);
        gateGroup.visible = false;
    };

    const prepareTravel = (state) => {
        if (travelState !== "idle") return false;
        travelState = state;
        travelProgress = 0;
        travelTime = 0;
        gateOpenness = 0;
        originPetPos = petModel.position.clone();
        originPetScale = petModel.scale.clone();
        originPetRotation = petModel.rotation.clone();
        captureMaterials();
        syncGatePosition();
        gateGroup.visible = true;
        gateGroup.scale.setScalar(0.16);
        setGateOpacity(0, 0);
        return true;
    };

    const startGoTravel = () => {
        if (!prepareTravel("goTravel")) return;
        applyPalette("departure");
        petModel.visible = true;
        petModel.position.copy(originPetPos);
        petModel.rotation.copy(originPetRotation);
        petModel.rotation.y = originPetRotation.y + Math.PI;
        petModel.scale.copy(originPetScale);
        setPetOpacity(1);
    };

    const startBackHome = () => {
        if (!prepareTravel("backHome")) return;
        applyPalette("returning");
        petModel.visible = true;
        petModel.position.copy(originPetPos);
        petModel.position.z += cfg.walkDistance;
        petModel.rotation.copy(originPetRotation);
        petModel.scale.copy(originPetScale).multiplyScalar(cfg.fadeScaleMin);
        setPetOpacity(0);
    };

    const finish = () => {
        const finishedState = travelState;
        travelState = "idle";
        travelProgress = 0;
        travelTime = 0;
        closeGate();
        petModel.position.copy(originPetPos);
        petModel.rotation.copy(originPetRotation);
        petModel.scale.copy(originPetScale);
        restoreMaterials();
        petModel.visible = finishedState !== "goTravel";
    };

    createGate();

    return {
        createGate,

        openGate,

        closeGate,

        startGoTravel() {
            startGoTravel();
        },

        startBackHome() {
            startBackHome();
        },

        update(deltaTime = 1 / 60) {
            if (travelState === "idle") return;
            travelTime += deltaTime;
            const duration = travelState === "goTravel" ? cfg.fadeOutDuration : cfg.fadeInDuration;
            const actionStart = cfg.openDuration;
            const actionTime = Math.max(0, travelTime - actionStart);
            travelProgress = Math.min(actionTime / duration, 1);
            const p = easeInOutCubic(travelProgress);
            const closeProgress = Math.max(0, (travelTime - actionStart - duration) / cfg.gateCloseDuration);
            const openProgress = Math.min(travelTime / cfg.openDuration, 1);
            const gateOpen = easeInOutCubic(openProgress);
            const gateClose = closeProgress > 0 ? 1 - easeInOutCubic(Math.min(closeProgress, 1)) : 1;
            const gateVisibility = gateOpen * gateClose;

            syncGatePosition();
            setGateOpacity(gateVisibility);

            ringList.forEach((ring, index) => {
                const direction = ring.userData.rotateDirection || 1;
                ring.rotation.z += cfg.gateRotateSpeed * direction * deltaTime * (index === 0 ? 1.25 : 1);
                const pulse = 0.76 + Math.sin(travelTime * cfg.gatePulseSpeed + index * 0.7) * 0.24;
                const boost = travelProgress > 0.72 ? 1.18 : 1;
                ring.material.opacity = (ring.userData.baseOpacity || 0.4) * pulse * gateVisibility * boost;
            });

            if (travelState === "goTravel") {
                petModel.position.z = lerp(originPetPos.z, originPetPos.z + cfg.walkDistance, p);
                petModel.scale.copy(originPetScale).multiplyScalar(lerp(1, cfg.fadeScaleMin, p));
                setPetOpacity(lerp(1, 0, p));
                if (travelProgress >= 1) {
                    petModel.visible = false;
                }
            } else if (travelState === "backHome") {
                petModel.visible = true;
                petModel.position.z = lerp(originPetPos.z + cfg.walkDistance, originPetPos.z, p);
                petModel.scale.copy(originPetScale).multiplyScalar(lerp(cfg.fadeScaleMin, 1, p));
                setPetOpacity(lerp(0, 1, p));
            }

            if (closeProgress >= 1) {
                finish();
            }
        },

        isTraveling() {
            return travelState !== "idle";
        },

        dispose() {
            gateParts.forEach(disposeMesh);
            gateParts = [];
            ringList = [];
            if (gateGroup.parent) {
                gateGroup.parent.remove(gateGroup);
            }
            restoreMaterials();
        },
    };
}

class RoamingCharacter {
    constructor(options = {}) {
        this.config = {
            containerId: 'roamingCharacter',
            canvasId: 'characterCanvas',
            speechBubbleId: 'speechBubble',
            shadowId: 'characterShadow',
            instructionId: 'instruction',
            modelPath: 'liukanshan.glb',
            width: 160,
            height: 190,
            evolveCanvasWidth: 720,
            evolveCanvasHeight: 900,
            evolveCanvasMarginLeft: -310,
            evolveCanvasMarginTop: -390,
            evolveCameraY: 1.18,
            evolveCameraZ: 6.6,
            scale: 0.5,
            speed: 250,
            spawnEffectDuration: 2800,
            enableGhostTrail: true,
            maxGhostCount: 8,
            spawnIntervalFrames: 5,
            initialGhostOpacity: 0.34,
            ghostFadeSpeed: 0.045,
            spawnScaleMultiplier: 1.24,
            enableEmojiBubble: true,
            emojiBubbleConfig: {},
            evolveEffectConfig: {},
            enableIdleRingBand: true,
            idleRingBandConfig: {},
            travelGateConfig: {},
            enableDragRotate: true,
            dragRotateSpeed: 0.012,
            dragPitchLimit: 0.52,
            homeIdleThreshold: 32,
            messages: [
                "我来啦！",
                "好的~",
                "等等我！",
                "来了！",
                "这就到！",
                "走咯~"
            ],
            idleMessage: "点击让我溜达~",
            arrivedMessage: "到达！🎉",
            enableClickMove: false, // 默认禁用点击移动
            ...options
        };

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.model = null;
        this.modelReady = false;
        this.baseModelY = -0.3;
        this.baseModelScale = new THREE.Vector3(1, 1, 1);
        this.renderWidth = this.config.width;
        this.renderHeight = this.config.height;
        this.defaultCameraPosition = new THREE.Vector3(0, 0.8, 3);
        this.clock = new THREE.Clock();

        this.characterX = window.innerWidth - 150;
        this.characterY = window.innerHeight - 200;
        this.targetX = this.characterX;
        this.targetY = this.characterY;
        this.isMoving = false;
        this.isSpawning = false;
        this.bubbleTimer = null;
        this.ghostTrail = null;
        this.emojiBubble = null;
        this.evolveEffect = null;
        this.idleRingBand = null;
        this.travelGate = null;
        this.travelWasActive = false;
        this.spawnEffect = null;
        this.pendingSpawnEffect = null;
        this.pendingEvolveEffect = null;
        this.pendingWave = null;
        this.waveBone = null;
        this.waveOriginRotation = null;
        this.waveOriginPosition = null;
        this.waveVerticalAxis = 'x';
        this.waveVerticalDirection = 1;
        this.waveSupportAxis = 'z';
        this.isWaving = false;
        this.waveElapsed = 0;
        this.waveDuration = 1.2;
        this.isPointerHovering = false;
        this.dragMoved = false;
        this.suppressNextClick = false;
        this.dragRotation = { yaw: 0, pitch: 0 };
        this.dragStart = { x: 0, y: 0, yaw: 0, pitch: 0, characterX: 0, characterY: 0 };
        this.dragPointerId = null;
        this.dragMode = null;
        this.isDragRotating = false;
        this.lastInteractionBubbleAt = 0;
        this.animationTime = 0;
        this.mixer = null;
        this.animationActions = {};
        this.activeLocomotionAction = null;
        this.lastLocomotionState = null;
        this.runClipName = null;
        this.idleClipName = null;

        this.characterElement = document.getElementById(this.config.containerId);
        this.speechBubble = document.getElementById(this.config.speechBubbleId);
        this.characterShadow = document.getElementById(this.config.shadowId);

        this.init();
    }

    init() {
        const canvas = document.getElementById(this.config.canvasId);
        const width = this.config.width;
        const height = this.config.height;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        this.camera.position.copy(this.defaultCameraPosition);

        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.addLights();
        this.loadModel();
        this.animate();
        this.setupEventListeners();

        this.characterElement.style.left = this.characterX + 'px';
        this.characterElement.style.top = this.characterY + 'px';
    }

    addLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 2);
        directional.position.set(5, 10, 7);
        this.scene.add(directional);

        const backLight = new THREE.DirectionalLight(0xffffff, 1);
        backLight.position.set(-5, 5, -5);
        this.scene.add(backLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
        fillLight.position.set(0, 5, 10);
        this.scene.add(fillLight);
    }

    createPlaceholderModel() {
        const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.6, 4, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x0084ff,
            metalness: 0.3,
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.1;

        const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 0.7;

        const group = new THREE.Group();
        group.add(body);
        group.add(head);
        group.position.y = -0.3;

        this.scene.add(group);
        this.model = group;
        this.baseModelY = group.position.y;
        this.baseModelScale = group.scale.clone();
        this.resetGhostTrail();
        this.resetEmojiBubble();
        this.resetEvolveEffect();
        this.resetIdleRingBand();
        this.resetTravelGate();
        this.findWaveBone({ silent: true });
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        loader.load(
            this.config.modelPath,
            (gltf) => {
                if (this.ghostTrail) {
                    this.ghostTrail.dispose();
                    this.ghostTrail = null;
                }
                this.emojiBubble = null;
                this.evolveEffect = null;
                this.waveBone = null;
                this.waveOriginRotation = null;
                this.waveOriginPosition = null;
                this.waveVerticalAxis = 'x';
                this.waveVerticalDirection = 1;
                this.waveSupportAxis = 'z';
                this.isWaving = false;
                if (this.idleRingBand) {
                    this.idleRingBand.dispose();
                    this.idleRingBand = null;
                }
                if (this.travelGate) {
                    this.travelGate.dispose();
                    this.travelGate = null;
                }
                if (this.mixer) {
                    this.mixer.stopAllAction();
                    if (this.model) this.mixer.uncacheRoot(this.model);
                    this.mixer = null;
                }
                this.animationActions = {};
                this.activeLocomotionAction = null;
                this.lastLocomotionState = null;
                this.runClipName = null;
                this.idleClipName = null;

                if (this.model) {
                    this.scene.remove(this.model);
                    this.disposeObjectResources(this.model);
                }

                const newModel = gltf.scene;

                this.normalizeModelMaterials(newModel);

                const box = new THREE.Box3().setFromObject(newModel);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());

                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const heightDim = size.y > 0.0001 ? size.y : maxDim;
                const scale = this.config.scale / heightDim;
                newModel.scale.multiplyScalar(scale);
                newModel.position.sub(center.multiplyScalar(scale));
                newModel.position.y = -0.15;
                console.log('[Roaming] bbox size=', size.toArray(), 'scale=', scale, 'pos=', newModel.position.toArray());

                this.scene.add(newModel);
                this.model = newModel;
                this.modelReady = true;
                this.baseModelY = newModel.position.y;
                this.baseModelScale = newModel.scale.clone();
                this.setupAnimationMixer(newModel, gltf.animations || []);
                this.resetGhostTrail();
                this.resetEmojiBubble();
                this.resetEvolveEffect();
                this.resetIdleRingBand();
                this.resetTravelGate();
                this.findWaveBone({ silent: true });

                console.log('Model loaded successfully!');
                if (this.pendingSpawnEffect) {
                    const pendingOptions = this.pendingSpawnEffect;
                    this.pendingSpawnEffect = null;
                    this.playSpawnEffect(pendingOptions);
                }
                if (this.pendingEvolveEffect) {
                    const pendingOptions = this.pendingEvolveEffect;
                    this.pendingEvolveEffect = null;
                    this.playEvolveEffect(pendingOptions);
                }
                if (this.pendingWave) {
                    const pendingOptions = this.pendingWave;
                    this.pendingWave = null;
                    this.startWave(pendingOptions);
                }
            },
            undefined,
            (error) => {
                console.log('Using placeholder model:', error);
                if (!this.model) {
                    this.createPlaceholderModel();
                }
                this.modelReady = true;
                this.findWaveBone({ silent: true });
                if (this.pendingSpawnEffect) {
                    const pendingOptions = this.pendingSpawnEffect;
                    this.pendingSpawnEffect = null;
                    this.playSpawnEffect({ ...pendingOptions, waitForModel: false });
                }
                if (this.pendingEvolveEffect) {
                    const pendingOptions = this.pendingEvolveEffect;
                    this.pendingEvolveEffect = null;
                    this.playEvolveEffect({ ...pendingOptions, waitForModel: false });
                }
                if (this.pendingWave) {
                    const pendingOptions = this.pendingWave;
                    this.pendingWave = null;
                    this.startWave({ ...pendingOptions, waitForModel: false });
                }
            }
        );
    }

    normalizeModelMaterials(root) {
        if (!root) return;
        root.traverse((child) => {
            if (!child.isMesh && !child.isSkinnedMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of mats) {
                if (!material) continue;
                material.transparent = false;
                material.opacity = 1;
                material.depthWrite = true;
                material.depthTest = true;
                material.alphaTest = 0;
                material.side = THREE.FrontSide;
                if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
                material.needsUpdate = true;
            }
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
        });
    }

    setupAnimationMixer(root, clips) {
        if (!clips || clips.length === 0) {
            console.log('[Roaming] no animation clips in model');
            return;
        }
        this.mixer = new THREE.AnimationMixer(root);
        this.animationActions = {};
        const findClip = (keywords) => clips.find((clip) => {
            const name = (clip.name || '').toLowerCase();
            return keywords.some((k) => name.includes(k));
        });
        const runClip = findClip(['running', 'run', 'sprint', '跑']) || findClip(['walking', 'walk', '走']);
        const idleClip = findClip(['idle', 'stand', '待机', '站立']);
        for (const clip of clips) {
            const action = this.mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = false;
            this.animationActions[clip.name] = action;
        }
        this.runClipName = runClip ? runClip.name : null;
        this.idleClipName = idleClip ? idleClip.name : null;
        console.log('[Roaming] animations:', clips.map((c) => c.name),
            'run=', this.runClipName, 'idle=', this.idleClipName);
        if (this.idleClipName) {
            const idleAction = this.animationActions[this.idleClipName];
            idleAction.reset().fadeIn(0.0).play();
            this.activeLocomotionAction = idleAction;
            this.lastLocomotionState = 'idle';
        }
    }

    updateLocomotionAnimation() {
        if (!this.mixer) return;
        if (this.isParkedAtHome()) {
            if (this.isPointerHovering && !this.isDragRotating) {
                this.playParkedIdleAnimation();
            } else {
                this.holdParkedIdlePose();
            }
            return;
        }

        let desired;
        if (this.isMoving && !this.isEvolving() && !this.isTraveling() && !this.isSpawning) {
            desired = this.runClipName ? 'run' : (this.idleClipName ? 'idle' : null);
        } else {
            desired = this.idleClipName ? 'idle' : null;
        }
        if (!desired || desired === this.lastLocomotionState) return;
        const nextName = desired === 'run' ? this.runClipName : this.idleClipName;
        const nextAction = nextName ? this.animationActions[nextName] : null;
        if (!nextAction) return;
        const prevAction = this.activeLocomotionAction;
        if (prevAction && prevAction !== nextAction) {
            prevAction.paused = false;
            nextAction.paused = false;
            nextAction.reset();
            nextAction.setEffectiveWeight(1);
            nextAction.play();
            prevAction.crossFadeTo(nextAction, 0.25, false);
        } else {
            nextAction.paused = false;
            nextAction.reset().fadeIn(0.2).play();
        }
        this.activeLocomotionAction = nextAction;
        this.lastLocomotionState = desired;
    }

    playParkedIdleAnimation() {
        const idleAction = this.idleClipName ? this.animationActions[this.idleClipName] : null;
        if (!idleAction) return;
        if (this.activeLocomotionAction === idleAction) {
            idleAction.paused = false;
            idleAction.play();
            this.lastLocomotionState = 'parked-idle';
            return;
        }
        if (this.activeLocomotionAction && this.activeLocomotionAction !== idleAction) {
            this.activeLocomotionAction.stop();
        }
        idleAction.reset();
        idleAction.paused = false;
        idleAction.setEffectiveWeight(1);
        idleAction.play();
        this.activeLocomotionAction = idleAction;
        this.lastLocomotionState = 'parked-idle';
    }

    holdParkedIdlePose() {
        const idleAction = this.idleClipName ? this.animationActions[this.idleClipName] : this.activeLocomotionAction;
        if (idleAction) {
            if (this.activeLocomotionAction && this.activeLocomotionAction !== idleAction) {
                this.activeLocomotionAction.stop();
            }
            idleAction.paused = false;
            idleAction.reset();
            idleAction.setEffectiveWeight(1);
            idleAction.play();
            idleAction.paused = true;
            this.activeLocomotionAction = idleAction;
            this.lastLocomotionState = 'parked-idle-paused';
            this.mixer?.update(0);
        } else {
            this.activeLocomotionAction = null;
            this.lastLocomotionState = null;
        }
    }

    isLocomotionAnimationDriving() {
        return !!(this.mixer && this.activeLocomotionAction && this.activeLocomotionAction.isRunning());
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = Math.min(this.clock.getDelta(), 0.05);
        this.animationTime += delta;
        if (this.mixer) this.mixer.update(delta);
        this.updateLocomotionAnimation();

        if (this.model) {
            if (this.isEvolving()) {
                this.evolveEffect.update(delta);
                this.faceFront();
                this.characterShadow.style.transform = `translateX(-50%) scale(${1.18 + Math.sin(this.animationTime * 5) * 0.1})`;
                this.characterShadow.style.opacity = 0.18;
                if (!this.isEvolving()) {
                    this.characterElement.classList.remove('roaming-evolving');
                    this.restoreCharacterCanvasSize();
                    this.showIdleRingBand();
                    this.faceFront();
                }
            } else if (this.isTraveling()) {
                this.characterShadow.style.transform = `translateX(-50%) scale(${0.86 + Math.sin(this.animationTime * 4) * 0.08})`;
                this.characterShadow.style.opacity = 0.14;
            } else if (this.isSpawning) {
                this.updateSpawnEffect(delta);
            } else if (this.isMoving) {
                if (this.isLocomotionAnimationDriving()) {
                    this.model.position.y = this.baseModelY;
                    this.model.rotation.z = 0;
                    const pulse = 0.95 + Math.sin(this.animationTime * 8) * 0.05;
                    this.characterShadow.style.transform = `translateX(-50%) scale(${pulse})`;
                    this.characterShadow.style.opacity = 0.22;
                } else {
                    const bounce = Math.sin(this.animationTime * 8) * 0.08;
                    this.model.position.y = this.baseModelY + bounce;

                    const sway = Math.sin(this.animationTime * 16) * 0.05;
                    this.model.rotation.z = sway;

                    const shadowScale = 1 - bounce * 0.5;
                    this.characterShadow.style.transform = `translateX(-50%) scale(${shadowScale})`;
                    this.characterShadow.style.opacity = 0.25 - bounce * 0.1;
                }
            } else {
                if (this.isParkedAtHome()) {
                    this.applyParkedHomePose();
                } else if (this.isLocomotionAnimationDriving()) {
                    this.model.position.y = this.baseModelY;
                    this.model.rotation.z = 0;
                    this.characterShadow.style.transform = `translateX(-50%) scale(1)`;
                    this.characterShadow.style.opacity = 0.25;
                } else {
                    const idle = Math.sin(this.animationTime * 1.5) * 0.02;
                    this.model.position.y = this.baseModelY + idle;
                    this.model.rotation.y = 0;
                    this.model.rotation.z = 0;

                    this.characterShadow.style.transform = `translateX(-50%) scale(1)`;
                    this.characterShadow.style.opacity = 0.25;
                }
            }
        }

        this.updatePosition(delta);
        this.updateGhostTrail();
        this.updateEmojiBubble();
        this.updateWave(delta);
        this.updateIdleRingBand(delta);
        this.updateTravelGate(delta);
        this.syncEvolveVisualState();
        this.applyDragRotation();
        this.renderer.render(this.scene, this.camera);
    }

    updatePosition(delta) {
        if (!this.isMoving || this.isSpawning || this.isEvolving() || this.isTraveling()) return;

        const dx = this.targetX - this.characterX;
        const dy = this.targetY - this.characterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) {
            this.isMoving = false;
            this.faceFront();
            this.showBubbleMessage(this.config.arrivedMessage, { autoHide: 2000 });
            setTimeout(() => {
                this.setDomMessage(this.config.idleMessage, { visible: false });
            }, 2000);
            return;
        }

        const speed = this.config.speed;
        const moveAmount = speed * delta;
        const ratio = Math.min(moveAmount / distance, 1);

        this.characterX += dx * ratio;
        this.characterY += dy * ratio;

        const maxX = window.innerWidth - 110;
        const maxY = window.innerHeight - 130;
        this.characterX = Math.max(10, Math.min(maxX, this.characterX));
        this.characterY = Math.max(10, Math.min(maxY, this.characterY));

        this.characterElement.style.left = this.characterX + 'px';
        this.characterElement.style.top = this.characterY + 'px';

        if (this.model) {
            const angle = Math.atan2(dx, dy);
            this.model.rotation.y = angle;
        }
    }

    clampTarget(x, y) {
        const maxX = window.innerWidth - 110;
        const maxY = window.innerHeight - 130;
        return {
            x: Math.max(10, Math.min(maxX, x)),
            y: Math.max(10, Math.min(maxY, y))
        };
    }

    applyMoveMessage(options = {}) {
        if (options.message) {
            this.showBubbleMessage(options.message);
        } else if (options.useRandomMessage !== false) {
            this.showBubbleMessage(this.config.messages[Math.floor(Math.random() * this.config.messages.length)]);
        }
    }

    hideInstruction() {
        const instruction = document.getElementById(this.config.instructionId);
        if (instruction) {
            instruction.style.display = 'none';
        }
    }

    faceFront() {
        if (!this.model) return;
        this.model.rotation.x = 0;
        this.model.rotation.y = 0;
        this.model.rotation.z = 0;
    }

    getHomePositions() {
        const initialHome = this.clampTarget(window.innerWidth - 150, window.innerHeight - 200);
        const centeredHome = this.clampTarget(window.innerWidth - 200, window.innerHeight - 260);
        return [initialHome, centeredHome];
    }

    isAtHomePosition() {
        const threshold = this.config.homeIdleThreshold;
        return this.getHomePositions().some((position) => {
            const dx = this.characterX - position.x;
            const dy = this.characterY - position.y;
            return Math.sqrt(dx * dx + dy * dy) <= threshold;
        });
    }

    isParkedAtHome() {
        return !this.isMoving
            && !this.isSpawning
            && !this.isEvolving()
            && !this.isTraveling()
            && this.isAtHomePosition();
    }

    applyParkedHomePose() {
        if (!this.model) return;
        this.model.position.y = this.baseModelY;
        this.model.rotation.x = 0;
        this.model.rotation.z = 0;

        if (!this.isDragRotating) {
            this.dragRotation.yaw = 0;
            this.dragRotation.pitch = 0;
        }

        this.model.rotation.y = 0;

        this.characterShadow.style.transform = `translateX(-50%) scale(1)`;
        this.characterShadow.style.opacity = 0.25;
    }

    setRenderSize(width, height) {
        if (!this.renderer || !this.camera) return;
        if (this.renderWidth === width && this.renderHeight === height) return;
        this.renderWidth = width;
        this.renderHeight = height;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    restoreRenderSize() {
        this.setRenderSize(this.config.width, this.config.height);
    }

    applyEvolveCanvasSize() {
        this.characterElement.style.width = `${this.config.evolveCanvasWidth}px`;
        this.characterElement.style.height = `${this.config.evolveCanvasHeight}px`;
        this.characterElement.style.marginLeft = `${this.config.evolveCanvasMarginLeft}px`;
        this.characterElement.style.marginTop = `${this.config.evolveCanvasMarginTop}px`;
        this.camera.position.set(0, this.config.evolveCameraY, this.config.evolveCameraZ);
        this.camera.updateProjectionMatrix();
        this.setRenderSize(this.config.evolveCanvasWidth, this.config.evolveCanvasHeight);
    }

    restoreCharacterCanvasSize() {
        this.characterElement.style.width = '';
        this.characterElement.style.height = '';
        this.characterElement.style.marginLeft = '';
        this.characterElement.style.marginTop = '';
        this.camera.position.copy(this.defaultCameraPosition);
        this.camera.updateProjectionMatrix();
        this.restoreRenderSize();
    }

    resetViewRotation() {
        this.dragRotation.yaw = 0;
        this.dragRotation.pitch = 0;
        if (this.model) {
            this.model.rotation.x = 0;
        }
    }

    applyDragRotation() {
        if (!this.model || this.isSpawning || this.isEvolving() || this.isTraveling()) return;
        if (this.isParkedAtHome() && !this.isDragRotating) return;
        const baseYaw = this.isMoving ? this.model.rotation.y : 0;
        this.model.rotation.x = THREE.MathUtils.clamp(
            this.dragRotation.pitch,
            -this.config.dragPitchLimit,
            this.config.dragPitchLimit
        );
        this.model.rotation.y = baseYaw + this.dragRotation.yaw;
    }

    shouldIgnoreDragTarget(target) {
        return Boolean(target.closest('.pet-hover-card') || target.closest('button') || target.closest('a'));
    }

    emitInteractionBubble(mode, event) {
        const now = Date.now();
        if (now - this.lastInteractionBubbleAt < 1400) return;
        this.lastInteractionBubbleAt = now;
        window.dispatchEvent(new CustomEvent('liukanshan-interaction-bubble', {
            detail: {
                mode,
                modifier: event?.metaKey ? 'command' : event?.shiftKey ? 'shift' : event?.altKey ? 'alt' : '',
            },
        }));
    }

    startDragRotate(event) {
        if (!this.config.enableDragRotate || !this.model || this.shouldIgnoreDragTarget(event.target)) return;
        const shouldRotate = event.shiftKey || event.altKey || event.metaKey;
        this.isPointerHovering = false;
        if (this.isParkedAtHome()) {
            this.holdParkedIdlePose();
            this.faceFront();
        }
        this.isDragRotating = true;
        this.dragPointerId = event.pointerId;
        this.dragMode = shouldRotate ? 'rotate' : 'move';
        this.dragMoved = false;
        this.suppressNextClick = false;
        this.dragStart.x = event.clientX;
        this.dragStart.y = event.clientY;
        this.dragStart.yaw = this.dragRotation.yaw;
        this.dragStart.pitch = this.dragRotation.pitch;
        this.dragStart.characterX = this.characterX;
        this.dragStart.characterY = this.characterY;
        this.isMoving = false;
        this.targetX = this.characterX;
        this.targetY = this.characterY;
        this.characterElement.classList.add(shouldRotate ? 'is-drag-rotating' : 'is-drag-moving');
        this.emitInteractionBubble(this.dragMode, event);
        this.characterElement.setPointerCapture?.(event.pointerId);
    }

    updateDragRotate(event) {
        if (!this.isDragRotating || event.pointerId !== this.dragPointerId) return;
        const dx = event.clientX - this.dragStart.x;
        const dy = event.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 4) {
            this.dragMoved = true;
        }
        if (this.dragMode === 'move') {
            const target = this.clampTarget(this.dragStart.characterX + dx, this.dragStart.characterY + dy);
            this.characterX = target.x;
            this.characterY = target.y;
            this.targetX = target.x;
            this.targetY = target.y;
            this.characterElement.style.left = `${this.characterX}px`;
            this.characterElement.style.top = `${this.characterY}px`;
        } else {
            this.dragRotation.yaw = this.dragStart.yaw + dx * this.config.dragRotateSpeed;
            this.dragRotation.pitch = THREE.MathUtils.clamp(
                this.dragStart.pitch + dy * this.config.dragRotateSpeed,
                -this.config.dragPitchLimit,
                this.config.dragPitchLimit
            );
        }
        if (this.dragMoved) {
            event.preventDefault();
        }
    }

    stopDragRotate(event) {
        if (!this.isDragRotating || event.pointerId !== this.dragPointerId) return;
        const shouldSuppressClick = this.dragMoved;
        const pointerId = this.dragPointerId;
        this.isDragRotating = false;
        this.dragPointerId = null;
        this.isPointerHovering = false;
        this.suppressNextClick = shouldSuppressClick;
        this.dragMoved = false;
        this.dragMode = null;
        this.characterElement.classList.remove('is-drag-rotating', 'is-drag-moving');
        if (pointerId !== null && this.characterElement.hasPointerCapture?.(pointerId)) {
            this.characterElement.releasePointerCapture?.(pointerId);
        }
        if (shouldSuppressClick) {
            event.preventDefault();
        }
    }

    cancelDragRotate() {
        if (!this.isDragRotating) return;
        const pointerId = this.dragPointerId;
        this.isDragRotating = false;
        this.dragPointerId = null;
        this.isPointerHovering = false;
        this.dragMoved = false;
        this.dragMode = null;
        this.characterElement.classList.remove('is-drag-rotating', 'is-drag-moving');
        if (pointerId !== null && this.characterElement.hasPointerCapture?.(pointerId)) {
            this.characterElement.releasePointerCapture?.(pointerId);
        }
    }

    findWaveBone(options = {}) {
        if (!this.model) return null;
        const bone = this.model.getObjectByName('Arm_R');
        this.waveBone = bone || null;
        this.waveOriginRotation = bone ? bone.rotation.clone() : null;
        if (!bone && !options.silent) {
            console.warn('Wave bone Arm_R was not found on the current Liu Kanshan model.');
        }
        return this.waveBone;
    }

    restoreWavePose() {
        if (!this.waveBone || !this.waveOriginRotation) return;
        this.waveBone.rotation.copy(this.waveOriginRotation);
        if (this.waveOriginPosition) {
            this.waveBone.position.copy(this.waveOriginPosition);
        }
    }

    findWaveTipObject() {
        if (!this.waveBone) return null;
        const origin = new THREE.Vector3();
        const position = new THREE.Vector3();
        let tipObject = null;
        let maxDistance = 0;

        this.waveBone.getWorldPosition(origin);
        this.waveBone.traverse((child) => {
            if (child === this.waveBone) return;
            child.getWorldPosition(position);
            const distance = origin.distanceTo(position);
            if (distance > maxDistance) {
                maxDistance = distance;
                tipObject = child;
            }
        });

        return tipObject;
    }

    pickWaveAxes() {
        if (!this.waveBone) return;
        const tipObject = this.findWaveTipObject();
        if (!tipObject) return;

        const axes = ['x', 'y', 'z'];
        const originRotation = this.waveBone.rotation.clone();
        const before = new THREE.Vector3();
        const after = new THREE.Vector3();

        this.model?.updateMatrixWorld(true);
        tipObject.getWorldPosition(before);

        const axisScores = axes.map((axis) => {
            this.waveBone.rotation.copy(originRotation);
            this.waveBone.rotation[axis] += 0.35;
            this.model?.updateMatrixWorld(true);
            tipObject.getWorldPosition(after);
            const verticalMove = after.y - before.y;
            const depthMove = Math.abs(after.z - before.z);
            return {
                axis,
                verticalMove,
                score: Math.abs(verticalMove) - depthMove * 0.35,
            };
        }).sort((left, right) => right.score - left.score);

        this.waveBone.rotation.copy(originRotation);
        this.model?.updateMatrixWorld(true);

        const primary = axisScores[0];
        this.waveVerticalAxis = primary?.axis || 'x';
        this.waveVerticalDirection = Math.sign(primary?.verticalMove || 1) || 1;
        this.waveSupportAxis = axisScores.find((item) => item.axis !== this.waveVerticalAxis)?.axis || 'z';
    }

    startWave(options = {}) {
        if (!this.modelReady && options.waitForModel !== false) {
            this.pendingWave = options;
            return true;
        }

        if (!this.waveBone) {
            this.findWaveBone({ silent: true });
        }

        if (!this.waveBone) {
            this.findWaveBone();
            return false;
        }

        if (this.isWaving) {
            this.restoreWavePose();
        }

        this.isMoving = false;
        this.isSpawning = false;
        this.resetViewRotation();
        this.faceFront();
        this.waveOriginRotation = this.waveBone.rotation.clone();
        this.waveOriginPosition = this.waveBone.position.clone();
        this.waveElapsed = 0;
        this.waveDuration = options.duration || 1.2;
        this.isWaving = true;

        if (options.message !== false) {
            this.showBubbleMessage(options.message || "拜拜~👋", { autoHide: options.autoHide || 1500 });
        }

        return true;
    }

    updateWave(delta) {
        if (!this.isWaving || !this.waveBone || !this.waveOriginRotation) return;

        this.faceFront();
        this.waveElapsed += delta;
        const progress = Math.min(this.waveElapsed / this.waveDuration, 1);
        const envelope = Math.sin(Math.PI * progress);
        const waveCount = 2.8;
        const upDownSwing = Math.sin(progress * Math.PI * 2 * waveCount);
        const lift = (0.045 + upDownSwing * 0.085) * envelope;
        const wristSwing = Math.sin(progress * Math.PI * 2 * waveCount + 0.4) * envelope;

        this.waveBone.rotation.copy(this.waveOriginRotation);
        if (this.waveOriginPosition) {
            this.waveBone.position.copy(this.waveOriginPosition);
            this.waveBone.position.y = this.waveOriginPosition.y + lift;
        }
        this.waveBone.rotation.z = this.waveOriginRotation.z + wristSwing * 0.22;

        if (progress >= 1) {
            this.restoreWavePose();
            this.isWaving = false;
            this.waveElapsed = 0;
        }
    }

    resetGhostTrail() {
        if (this.ghostTrail) {
            this.ghostTrail.dispose();
            this.ghostTrail = null;
        }
        if (!this.config.enableGhostTrail || !this.model) return;

        this.ghostTrail = createGhostTrail(this.model, this.scene, {
            maxGhostCount: this.config.maxGhostCount,
            spawnIntervalFrames: this.config.spawnIntervalFrames,
            initialOpacity: this.config.initialGhostOpacity,
            fadeSpeed: this.config.ghostFadeSpeed,
            onlyWhenMoving: true,
            keepTransform: true,
        });
    }

    updateGhostTrail() {
        if (!this.ghostTrail || !this.model) return;
        const isTrailActive = this.isMoving || this.isSpawning || this.isEvolving() || this.isTraveling();
        this.ghostTrail(isTrailActive);
    }

    resetEmojiBubble() {
        this.emojiBubble = null;
        if (!this.config.enableEmojiBubble || !this.model) return;
        this.emojiBubble = createPetEmojiBubble(this.model, this.scene, {
            ...this.config.emojiBubbleConfig,
        });
    }

    updateEmojiBubble() {
        if (!this.emojiBubble) return;
        this.emojiBubble.update(this.camera);
    }

    resetEvolveEffect() {
        if (!this.model) return;
        this.evolveEffect = createPetEvolveEffect(this.model, this.scene, this.renderer, null, null, {
            ...this.config.evolveEffectConfig,
        });
    }

    resetIdleRingBand() {
        if (this.idleRingBand) {
            this.idleRingBand.dispose();
            this.idleRingBand = null;
        }
        if (!this.config.enableIdleRingBand || !this.model) return;
        this.idleRingBand = createPetIdleRingBand(this.model, this.scene, {
            ...this.config.idleRingBandConfig,
        });
    }

    updateIdleRingBand(delta) {
        this.idleRingBand?.update(delta);
    }

    showIdleRingBand() {
        this.idleRingBand?.show();
    }

    hideIdleRingBand() {
        this.idleRingBand?.hide();
    }

    resetTravelGate() {
        if (this.travelGate) {
            this.travelGate.dispose();
            this.travelGate = null;
        }
        if (!this.model) return;
        this.travelGate = createPetTravelGate(this.model, this.scene, {
            ...this.config.travelGateConfig,
        });
    }

    isTraveling() {
        return Boolean(this.travelGate?.isTraveling?.());
    }

    updateTravelGate(delta) {
        if (!this.travelGate) return;
        const wasTraveling = this.travelWasActive;
        this.travelGate.update(delta);
        const isTraveling = this.isTraveling();
        if (wasTraveling && !isTraveling) {
            this.characterElement.classList.remove('roaming-traveling', 'roaming-departing', 'roaming-returning');
            if (this.model?.visible !== false) {
                this.showIdleRingBand();
            }
        }
        this.travelWasActive = isTraveling;
    }

    startGoTravel(options = {}) {
        if (!this.travelGate) {
            this.resetTravelGate();
        }
        if (!this.travelGate) return;
        this.isMoving = false;
        this.isSpawning = false;
        this.resetViewRotation();
        this.faceFront();
        this.hideIdleRingBand();
        this.characterElement.classList.remove('roaming-returning');
        this.characterElement.classList.add('roaming-traveling', 'roaming-departing');
        if (options.message) {
            this.showBubbleMessage(options.message, { autoHide: options.autoHide || 2200 });
        }
        this.travelGate.startGoTravel();
        this.travelWasActive = true;
    }

    captureSceneSnapshot(themeOverrides = {}) {
        if (!this.renderer || !this.scene || !this.camera) {
            return null;
        }
        const prevBg = this.scene.background;
        const prevClearColor = this.renderer.getClearColor(new THREE.Color()).getHex();
        const prevClearAlpha = this.renderer.getClearAlpha();
        try {
            if (themeOverrides.background) {
                this.scene.background = new THREE.Color(themeOverrides.background);
                this.renderer.setClearColor(themeOverrides.background, 1);
            }
            this.renderer.render(this.scene, this.camera);
            return this.renderer.domElement.toDataURL('image/png');
        } finally {
            this.scene.background = prevBg;
            this.renderer.setClearColor(prevClearColor, prevClearAlpha);
            this.renderer.render(this.scene, this.camera);
        }
    }

    startBackHome(options = {}) {
        if (!this.travelGate) {
            this.resetTravelGate();
        }
        if (!this.travelGate) return;
        this.isMoving = false;
        this.isSpawning = false;
        this.resetViewRotation();
        this.faceFront();
        this.hideIdleRingBand();
        this.characterElement.classList.remove('roaming-departing');
        this.characterElement.classList.add('roaming-traveling', 'roaming-returning');
        if (options.message) {
            this.showBubbleMessage(options.message, { autoHide: options.autoHide || 2600 });
        }
        this.travelGate.startBackHome();
        this.travelWasActive = true;
    }

    isEvolving() {
        return Boolean(this.evolveEffect?.isEvolving?.());
    }

    playEvolveEffect(options = {}) {
        if (!this.modelReady && options.waitForModel !== false) {
            this.pendingEvolveEffect = options;
            return;
        }
        if (!this.evolveEffect) {
            this.resetEvolveEffect();
        }
        if (!this.evolveEffect) return;
        if (options.message) {
            this.showBubbleMessage(options.message, { autoHide: options.autoHide || 3200 });
        }
        this.isMoving = false;
        this.isSpawning = false;
        this.resetViewRotation();
        this.faceFront();
        this.hideIdleRingBand();
        this.characterElement.classList.add('roaming-evolving');
        this.applyEvolveCanvasSize();
        this.evolveEffect.start();
    }

    syncEvolveVisualState() {
        if (!this.characterElement.classList.contains('roaming-evolving') || this.isEvolving()) return;
        this.characterElement.classList.remove('roaming-evolving');
        this.restoreCharacterCanvasSize();
        this.showIdleRingBand();
        this.faceFront();
    }

    setDomMessage(text, options = {}) {
        if (this.speechBubble) {
            this.speechBubble.textContent = text;
            this.speechBubble.classList.remove('follow-notice');
            delete this.speechBubble.dataset.noticeId;
            if (options.visible === false) {
                this.speechBubble.classList.remove('bubble-visible');
            } else {
                this.speechBubble.classList.add('bubble-visible');
            }
        }
    }

    showBubbleMessage(text, options = {}) {
        this.setDomMessage(text);
        if (this.emojiBubble) {
            this.emojiBubble.show(text);
        }

        window.clearTimeout(this.bubbleTimer);
        if (options.autoHide && options.autoHide > 0) {
            this.bubbleTimer = window.setTimeout(() => {
                this.emojiBubble?.hide();
                this.setDomMessage(this.config.idleMessage, { visible: false });
            }, options.autoHide);
        }
    }

    easeOutCubic(value) {
        const t = Math.max(0, Math.min(1, value));
        return 1 - Math.pow(1 - t, 3);
    }

    easeOutBack(value) {
        const t = Math.max(0, Math.min(1, value));
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    disposeMaterial(material) {
        if (!material) return;
        if (Array.isArray(material)) {
            material.forEach((item) => this.disposeMaterial(item));
            return;
        }
        material.map?.dispose();
        material.dispose();
    }

    disposeObjectResources(object) {
        object.traverse((child) => {
            if (!child.isMesh && !child.isSprite) return;
            child.geometry?.dispose();
            this.disposeMaterial(child.material);
        });
    }

    cleanupSpawnEffect() {
        if (!this.spawnEffect) return;
        const {
            ring,
            innerRing,
            halo,
            particles,
            particleGeometry,
            particleMaterial,
            glowLight,
            usingStageCanvas,
        } = this.spawnEffect;
        [ring, innerRing, halo, particles, glowLight].forEach((object) => {
            if (object) this.scene.remove(object);
        });
        [ring, innerRing, halo].forEach((object) => {
            if (!object) return;
            object.geometry?.dispose();
            this.disposeMaterial(object.material);
        });
        particleGeometry?.dispose();
        this.disposeMaterial(particleMaterial);
        this.spawnEffect = null;
        this.characterElement.classList.remove('roaming-spawning', 'roaming-stage-spawning');
        if (usingStageCanvas) {
            this.restoreCharacterCanvasSize();
        }
    }

    setPosition(x, y, options = {}) {
        const offsetX = options.centered === false ? 0 : 50;
        const offsetY = options.centered === false ? 0 : 60;
        const target = this.clampTarget(x - offsetX, y - offsetY);
        this.characterX = target.x;
        this.characterY = target.y;
        this.targetX = target.x;
        this.targetY = target.y;
        this.characterElement.style.left = this.characterX + 'px';
        this.characterElement.style.top = this.characterY + 'px';
    }

    createSpawnParticles(originY, count) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let index = 0; index < count; index += 1) {
            const i3 = index * 3;
            positions[i3] = 0;
            positions[i3 + 1] = originY;
            positions[i3 + 2] = 0;

            const angle = Math.random() * Math.PI * 2;
            const radiusVelocity = 0.28 + Math.random() * 0.92;
            velocities.push({
                x: Math.cos(angle) * radiusVelocity,
                y: 0.72 + Math.random() * 1.25,
                z: Math.sin(angle) * radiusVelocity,
            });
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.038,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return {
            particles: new THREE.Points(geometry, material),
            particleGeometry: geometry,
            particleMaterial: material,
            velocities,
        };
    }

    playSpawnEffect(options = {}) {
        if ((!this.model || !this.modelReady) && options.waitForModel !== false) {
            this.pendingSpawnEffect = options;
            return;
        }
        if (!this.model) return;

        this.cleanupSpawnEffect();
        this.isMoving = false;
        this.isSpawning = true;
        this.resetViewRotation();
        this.hideInstruction();

        const duration = (options.duration || this.config.spawnEffectDuration) / 1000;
        const useStageCanvas = options.useStageCanvas === true;
        const ringY = this.baseModelY - 0.62;
        const normalScale = this.baseModelScale.clone();
        const spawnScale = normalScale.clone().multiplyScalar(options.scaleMultiplier || this.config.spawnScaleMultiplier);
        const startScale = spawnScale.clone().multiplyScalar(0.12);

        this.model.visible = false;
        this.model.position.y = this.baseModelY - 1.35;
        this.model.scale.copy(startScale);
        this.faceFront();
        this.showBubbleMessage(options.message || "刘看山到家啦");
        this.characterElement.classList.add('roaming-spawning');
        if (useStageCanvas) {
            this.characterElement.classList.add('roaming-stage-spawning');
            this.applyEvolveCanvasSize();
        }

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x1677ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.66,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.8, 72), ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = ringY;

        const innerRingMaterial = new THREE.MeshBasicMaterial({
            color: 0x88ddff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.42,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.34, 48), innerRingMaterial);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = ringY + 0.01;

        const haloMaterial = new THREE.MeshBasicMaterial({
            color: 0x1677ff,
            transparent: true,
            opacity: 0,
            side: THREE.BackSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.78, 32, 24), haloMaterial);
        halo.position.y = this.baseModelY + 0.24;
        halo.scale.set(0.45, 0.64, 0.45);

        const glowLight = new THREE.PointLight(0x88ddff, 0, 3.2);
        glowLight.position.set(0, this.baseModelY + 0.1, 0.8);

        const particleBundle = this.createSpawnParticles(ringY + 0.02, options.particleCount || 128);
        this.scene.add(ring, innerRing, halo, glowLight, particleBundle.particles);

        this.spawnEffect = {
            elapsed: 0,
            duration,
            ring,
            innerRing,
            halo,
            particles: particleBundle.particles,
            particleGeometry: particleBundle.particleGeometry,
            particleMaterial: particleBundle.particleMaterial,
            velocities: particleBundle.velocities,
            glowLight,
            normalScale,
            spawnScale,
            usingStageCanvas: useStageCanvas,
        };
    }

    updateSpawnEffect(delta) {
        if (!this.spawnEffect || !this.model) return;

        const effect = this.spawnEffect;
        effect.elapsed += delta;
        const progress = Math.min(effect.elapsed / effect.duration, 1);
        const reveal = Math.max(0, Math.min(1, (effect.elapsed - 0.18) / (effect.duration * 0.48)));
        const riseEase = this.easeOutCubic(reveal);
        const scaleEase = this.easeOutBack(reveal);
        const fade = 1 - this.easeOutCubic(Math.max(0, (effect.elapsed - effect.duration * 0.45) / (effect.duration * 0.55)));

        if (effect.elapsed > 0.14) {
            this.model.visible = true;
        }
        this.faceFront();
        this.model.position.y = this.baseModelY - 1.35 * (1 - riseEase) + Math.sin(effect.elapsed * 7) * 0.018 * (1 - progress);
        this.model.scale.copy(effect.spawnScale).multiplyScalar(0.12 + Math.max(0, scaleEase) * 0.88);

        effect.ring.rotation.z += delta * 1.9;
        effect.ring.scale.setScalar(1.16 - progress * 0.38);
        effect.ring.material.opacity = 0.66 * fade;

        effect.innerRing.rotation.z -= delta * 2.4;
        effect.innerRing.scale.setScalar(0.72 + this.easeOutCubic(progress) * 0.92);
        effect.innerRing.material.opacity = 0.42 * fade;

        effect.halo.scale.setScalar(0.54 + riseEase * 0.72 + Math.sin(effect.elapsed * 8) * 0.025);
        effect.halo.material.opacity = 0.2 * Math.sin(Math.PI * Math.min(progress, 1)) * fade;
        effect.glowLight.intensity = 1.25 * Math.sin(Math.PI * Math.min(progress, 1)) * fade;

        const positionArray = effect.particleGeometry.attributes.position.array;
        for (let index = 0; index < effect.velocities.length; index += 1) {
            const i3 = index * 3;
            const velocity = effect.velocities[index];
            positionArray[i3] += velocity.x * delta;
            positionArray[i3 + 1] += velocity.y * delta;
            positionArray[i3 + 2] += velocity.z * delta;
            velocity.y -= 1.15 * delta;
            velocity.x *= 0.992;
            velocity.z *= 0.992;
        }
        effect.particleGeometry.attributes.position.needsUpdate = true;
        effect.particleMaterial.opacity = 0.95 * fade;

        this.characterShadow.style.transform = `translateX(-50%) scale(${0.7 + riseEase * 0.42})`;
        this.characterShadow.style.opacity = `${0.08 + riseEase * 0.22}`;

        if (progress >= 1) {
            this.model.visible = true;
            this.model.position.y = this.baseModelY;
            this.model.scale.copy(effect.normalScale);
            this.faceFront();
            this.isSpawning = false;
            this.cleanupSpawnEffect();
            window.setTimeout(() => {
                this.setDomMessage(this.config.idleMessage, { visible: false });
                this.emojiBubble?.hide();
            }, 1600);
        }
    }

    moveTo(x, y, options = {}) {
        const target = this.clampTarget(x - 50, y - 60);
        this.targetX = target.x;
        this.targetY = target.y;

        const dx = this.targetX - this.characterX;
        const dy = this.targetY - this.characterY;

        if (this.model) {
            const angle = Math.atan2(dx, dy);
            this.model.rotation.y = angle;
        }

        this.isMoving = true;
        this.applyMoveMessage(options);
        this.hideInstruction();
    }

    setMessage(text, options = {}) {
        this.showBubbleMessage(text, options);
    }

    hideMessage() {
        window.clearTimeout(this.bubbleTimer);
        this.emojiBubble?.hide();
        this.speechBubble?.classList.remove('bubble-visible', 'follow-notice');
        if (this.speechBubble) {
            delete this.speechBubble.dataset.noticeId;
        }
    }

    moveToElement(element, options = {}) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this.moveTo(centerX, centerY, options);
    }

    getPosition() {
        return {
            x: this.characterX,
            y: this.characterY
        };
    }

    isMovingStatus() {
        return this.isMoving;
    }

    setupEventListeners() {
        this.characterElement.addEventListener('pointerenter', () => {
            if (this.isDragRotating) return;
            this.isPointerHovering = true;
        });
        this.characterElement.addEventListener('pointerleave', () => {
            this.isPointerHovering = false;
            if (this.isParkedAtHome()) {
                this.holdParkedIdlePose();
                this.faceFront();
            }
        });
        this.characterElement.addEventListener('click', (event) => {
            if (!this.suppressNextClick) return;
            this.suppressNextClick = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        this.characterElement.addEventListener('pointerdown', (event) => this.startDragRotate(event));
        this.characterElement.addEventListener('pointermove', (event) => this.updateDragRotate(event));
        this.characterElement.addEventListener('pointerup', (event) => this.stopDragRotate(event));
        this.characterElement.addEventListener('pointercancel', (event) => this.stopDragRotate(event));
        this.characterElement.addEventListener('lostpointercapture', () => this.cancelDragRotate());
        window.addEventListener('blur', () => this.cancelDragRotate());

        if (this.config.enableClickMove) {
            document.addEventListener('click', (e) => {
                if (e.target.closest(`#${this.config.containerId}`)) return;
                if (e.target.closest(`#${this.config.instructionId}`)) return;

                this.moveTo(e.clientX, e.clientY);
            });
        }

        window.addEventListener('resize', () => {
            const maxX = window.innerWidth - 110;
            const maxY = window.innerHeight - 130;
            this.characterX = Math.min(this.characterX, maxX);
            this.characterY = Math.min(this.characterY, maxY);
            this.characterElement.style.left = this.characterX + 'px';
            this.characterElement.style.top = this.characterY + 'px';
        });
    }
}

export function initRoamingCharacter(options = {}) {
    return new RoamingCharacter(options);
}

export default RoamingCharacter;
