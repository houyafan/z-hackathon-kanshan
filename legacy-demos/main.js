import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, controls, model, mixer;
const canvasContainer = document.getElementById('canvas-container');
const uploadContainer = document.getElementById('upload-container');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const modelInfoDiv = document.getElementById('model-info');
const clock = new THREE.Clock();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(5, 5, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    addLights();
    addGround();

    window.addEventListener('resize', onWindowResize);
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    uploadContainer.addEventListener('dragover', handleDragOver);
    uploadContainer.addEventListener('drop', handleDrop);

    loadModelFromURL('低面数.glb');

    animate();
}

function addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
    backLight.position.set(-10, 10, -10);
    scene.add(backLight);

    const sideLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    sideLight1.position.set(10, 5, -10);
    scene.add(sideLight1);

    const sideLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    sideLight2.position.set(-10, 5, 10);
    scene.add(sideLight2);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
    scene.add(hemisphereLight);
}

function addGround() {
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3a5f0b,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.glb')) {
        loadModel(file);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const file = event.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.glb')) {
        loadModel(file);
    }
}

function loadModelFromURL(url) {
    const loader = new GLTFLoader();

    loader.load(
        url,
        (gltf) => {
            setupModel(gltf.scene);
            uploadContainer.classList.add('hidden');
            
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(model);
                const action = mixer.clipAction(gltf.animations[0]);
                action.play();
            }
        },
        (progress) => {
            console.log('Loading:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading model:', error);
            alert('加载模型失败，请检查文件格式是否正确。');
        }
    );
}

function loadModel(file) {
    const url = URL.createObjectURL(file);
    loadModelFromURL(url);
}

let bones = {};
let isWalking = false;

let modelParts = {};

function setupModel(newModel) {
    if (model) {
        scene.remove(model);
    }

    model = newModel;
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            modelParts[child.name] = child;
            console.log('Found mesh:', child.name);
        }
        if (child.isBone) {
            bones[child.name] = child;
            console.log('Found bone:', child.name);
        }
    });

    console.log('Total bones found:', Object.keys(bones).length);
    console.log('Total meshes found:', Object.keys(modelParts).length);

    updateModelInfo();

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 3 / maxDim;
    model.scale.multiplyScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

    scene.add(model);

    camera.position.set(5, 5, 5);
    controls.update();

    isWalking = true;
}

function updateModelInfo() {
    let info = '';
    
    if (Object.keys(bones).length > 0) {
        info += '<strong>骨骼 (' + Object.keys(bones).length + '):</strong><br>';
        Object.keys(bones).forEach((name) => {
            info += '&nbsp;&nbsp;• ' + name + '<br>';
        });
    }
    
    if (Object.keys(modelParts).length > 0) {
        info += '<strong>模型部件 (' + Object.keys(modelParts).length + '):</strong><br>';
        Object.keys(modelParts).forEach((name) => {
            info += '&nbsp;&nbsp;• ' + name + '<br>';
        });
    }
    
    modelInfoDiv.innerHTML = info;
}

let walkTime = 0;
let leftLeg, rightLeg, leftArm, rightArm, body;

function findLegParts() {
    Object.keys(modelParts).forEach((name) => {
        const lowerName = name.toLowerCase();
        const part = modelParts[name];
        
        if (lowerName.includes('leg') || lowerName.includes('foot') || lowerName.includes('shoe')) {
            if (lowerName.includes('l') || lowerName.includes('left')) {
                leftLeg = part;
                console.log('Found left leg:', name);
            } else if (lowerName.includes('r') || lowerName.includes('right')) {
                rightLeg = part;
                console.log('Found right leg:', name);
            }
        }
        
        if (lowerName.includes('arm') || lowerName.includes('hand')) {
            if (lowerName.includes('l') || lowerName.includes('left')) {
                leftArm = part;
                console.log('Found left arm:', name);
            } else if (lowerName.includes('r') || lowerName.includes('right')) {
                rightArm = part;
                console.log('Found right arm:', name);
            }
        }
        
        if (lowerName.includes('body') || lowerName.includes('torso') || lowerName.includes('spine')) {
            body = part;
            console.log('Found body:', name);
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    if (mixer) {
        mixer.update(delta);
    }
    
    if (model && isWalking) {
        walkTime += delta * 4;
        
        if (!leftLeg && !rightLeg && Object.keys(modelParts).length > 0) {
            findLegParts();
        }
        
        const bounce = Math.sin(walkTime) * 0.08;
        model.position.y = bounce;
        
        const sway = Math.sin(walkTime * 2) * 0.03;
        model.rotation.z = sway;
        
        const legSwing = Math.sin(walkTime * 2) * 0.4;
        const legLift = Math.max(0, Math.sin(walkTime * 2)) * 0.2;
        
        let hasBoneAnimation = false;
        Object.keys(bones).forEach((boneName) => {
            const bone = bones[boneName];
            const lowerName = boneName.toLowerCase();
            
            if (lowerName.includes('leg') || lowerName.includes('thigh') || lowerName.includes('shin') || lowerName.includes('foot')) {
                hasBoneAnimation = true;
                if (lowerName.includes('l') || lowerName.includes('left')) {
                    bone.rotation.x = legSwing;
                } else if (lowerName.includes('r') || lowerName.includes('right')) {
                    bone.rotation.x = -legSwing;
                }
            }
            
            if (lowerName.includes('arm') || lowerName.includes('upperarm') || lowerName.includes('lowerarm') || lowerName.includes('hand')) {
                hasBoneAnimation = true;
                if (lowerName.includes('l') || lowerName.includes('left')) {
                    bone.rotation.x = -legSwing * 0.6;
                } else if (lowerName.includes('r') || lowerName.includes('right')) {
                    bone.rotation.x = legSwing * 0.6;
                }
            }
        });
        
        if (!hasBoneAnimation) {
            if (leftLeg) {
                leftLeg.rotation.x = legSwing;
                leftLeg.position.z = Math.sin(walkTime * 2) * 0.1;
            }
            if (rightLeg) {
                rightLeg.rotation.x = -legSwing;
                rightLeg.position.z = -Math.sin(walkTime * 2) * 0.1;
            }
            if (leftArm) {
                leftArm.rotation.x = -legSwing * 0.5;
            }
            if (rightArm) {
                rightArm.rotation.x = legSwing * 0.5;
            }
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}

init();
