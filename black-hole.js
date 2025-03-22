// width and height of window
let width = window.innerWidth;
let height = window.innerHeight;

// file name of shader and img
let current_texture = "black_hole";
let spaceTexture = 'images/space_pano.jpg';
let diskTexture = 'images/accretion_disk.jpg'; // Texture for accretion disk
let material;

let camera = new THREE.OrthographicCamera();
let mouseposition = {
    x: 0,
    y: 0
};

// -----------------------------------------------------------------------------
// GUI
// -----------------------------------------------------------------------------
var Lensing = function() {
    // Using the requested default values
    this.distance = 0.56;       // Observer distance
    this.radius = 0.027;        // Black hole size
    this.diskVisible = true;    // Toggle disk visibility
    this.diskRadius = 0.28;     // Disk radius
    this.diskAngle = 10;        // Disk angle in degrees
    this.diskThickness = 0.006; // Disk thickness
    this.diskBrightness = 1.5;  // Disk brightness
    this.diskRotationSpeed = 2.0; // Rotation speed
    this.glowStrength = 2.0;    // Glow strength
    this.glowSize = 0.29;       // Glow size
    this.showDopplerEffect = true; // Toggle Doppler effect
}

var g = new dat.GUI();
// Lensing parameters
var lenseFolder = g.addFolder("Black Hole Properties");
var lenseObj = new Lensing();
lenseFolder.add(lenseObj, "distance", 0.03, 1).step(0.01).name("Observer Distance").listen();
lenseFolder.add(lenseObj, "radius", 0.001, 0.1).step(0.001).name("Black Hole Size").listen();

// Disk parameters
var diskFolder = g.addFolder("Accretion Disk");
diskFolder.add(lenseObj, "diskVisible").name("Show Disk").listen();
diskFolder.add(lenseObj, "diskRadius", 0.01, 0.5).step(0.01).name("Disk Radius").listen();
diskFolder.add(lenseObj, "diskAngle", 0, 90).step(1).name("Disk Angle (°)").listen();
diskFolder.add(lenseObj, "diskThickness", 0.0005, 0.01).step(0.0005).name("Disk Thickness").listen();
diskFolder.add(lenseObj, "diskBrightness", 0.1, 3.0).step(0.1).name("Disk Brightness").listen();
diskFolder.add(lenseObj, "diskRotationSpeed", 0, 5.0).step(0.1).name("Rotation Speed").listen();
diskFolder.add(lenseObj, "showDopplerEffect").name("Doppler Effect").listen();

// Glow effect parameters
var glowFolder = g.addFolder("Glow Effect");
glowFolder.add(lenseObj, "glowStrength", 0, 3).step(0.1).name("Glow Strength").listen();
glowFolder.add(lenseObj, "glowSize", 0, 0.5).step(0.01).name("Glow Size").listen();

// Open folders by default
lenseFolder.open();
diskFolder.open();
glowFolder.open();

init();
loop();

function init() {
    // Initialize renderer with anti-aliasing
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    document.body.appendChild(renderer.domElement);
    
    // Initialize camera and scene
    camera.position.z = 1;
    scene = new THREE.Scene();

    // Create plane geometry for shader
    var geometry = new THREE.PlaneBufferGeometry(2, 2);

    // Setup render targets
    let parameters = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false
    };

    // Initialize buffer
    rtFront = new THREE.WebGLRenderTarget(width, height, parameters);

    // Load textures - with error handling
    var backgroundTexture, accretionDiskTexture;
    
    // Load background texture
    var textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = '';
    
    try {
        backgroundTexture = textureLoader.load(
            spaceTexture,
            function(texture) {
                console.log("Background texture loaded successfully");
            },
            undefined, // onProgress callback not supported
            function(err) {
                console.error("Error loading background texture:", err);
                // Create a fallback texture - dark blue with stars
                backgroundTexture = createFallbackSpaceTexture();
            }
        );
    } catch (e) {
        console.error("Error loading background texture:", e);
        backgroundTexture = createFallbackSpaceTexture();
    }
    
    try {
        accretionDiskTexture = textureLoader.load(
            diskTexture,
            function(texture) {
                console.log("Disk texture loaded successfully");
            },
            undefined, // onProgress callback not supported
            function(err) {
                console.error("Error loading disk texture:", err);
                // Create a fallback texture - radial gradient
                accretionDiskTexture = createFallbackDiskTexture();
            }
        );
    } catch (e) {
        console.error("Error loading disk texture:", e);
        accretionDiskTexture = createFallbackDiskTexture();
    }
    
    // Create shader uniforms
    uniforms = {
        u_distance: { value: lenseObj.distance },
        u_r_s: { value: lenseObj.radius },
        u_resolution: { type: "v2", value: new THREE.Vector2(width, height) },
        u_currentTexture: { type: "t", value: rtFront },
        u_texture: { type: "t", value: backgroundTexture },
        u_diskTexture: { type: "t", value: accretionDiskTexture },
        u_mouse: { type: "v3", value: new THREE.Vector3(0.5, 0.5, 0) },
        u_frameCount: { type: "i", value: -1 },
        u_time: { value: performance.now() / 1000 },
        u_paused: { type: 'i', value: 0 },
        
        // Disk uniforms
        u_diskVisible: { value: lenseObj.diskVisible },
        u_diskRadius: { value: lenseObj.diskRadius },
        u_diskAngle: { value: lenseObj.diskAngle * Math.PI / 180 }, // Convert to radians
        u_diskThickness: { value: lenseObj.diskThickness },
        u_diskBrightness: { value: lenseObj.diskBrightness },
        u_diskRotationSpeed: { value: lenseObj.diskRotationSpeed },
        
        // Glow uniforms
        u_glowStrength: { value: lenseObj.glowStrength },
        u_glowSize: { value: lenseObj.glowSize },
        
        // Doppler effect uniform
        u_dopplerEffect: { value: lenseObj.showDopplerEffect }
    };

    // Create shader material
    material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: document.getElementById("vertexShader").textContent,
        fragmentShader: document.getElementById("black_hole").textContent
    });

    // Set shader to update
    material.fragmentShader.needsUpdate = true;

    // Create mesh with shader material
    let mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Add event listeners
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('pointermove', onPointerMove, false);
}

// Function to create a fallback space texture if loading fails
function createFallbackSpaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Create a dark blue gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#000020');
    gradient.addColorStop(0.5, '#000040');
    gradient.addColorStop(1, '#000020');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add some "stars"
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = Math.random() * 1.5;
        const opacity = Math.random() * 0.8 + 0.2;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Function to create a fallback disk texture if loading fails
function createFallbackDiskTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Create a radial gradient for the disk
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#FFCC66');
    gradient.addColorStop(0.3, '#FF6633');
    gradient.addColorStop(0.6, '#CC3366');
    gradient.addColorStop(1, '#330066');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add some noise/turbulence
    for (let i = 0; i < 10000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 3 + 1;
        const opacity = Math.random() * 0.2;
        
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function onPointerMove(event) {
    let width = window.innerWidth;
    let height = window.innerHeight;
    let ratio = height / width;
    
    if (height > width) {
        mouseposition.x = (event.pageX - width / 2) / width;
        mouseposition.y = (event.pageY - height / 2) / height * -1 * ratio;
    } else {
        mouseposition.x = (event.pageX - width / 2) / width / ratio;
        mouseposition.y = (event.pageY - height / 2) / height * -1;
    }
    
    // Add mouse click events
    window.addEventListener('pointerdown', () => {
        uniforms.u_mouse.value.z = 1;
    });
    
    window.addEventListener('pointerup', () => {
        uniforms.u_mouse.value.z = 0;
    });
    
    event.preventDefault();
}

function onWindowResize(event) {
    width = window.innerWidth;
    height = window.innerHeight;

    uniforms.u_frameCount.value = 0;
    uniforms.u_resolution.value.x = width;
    uniforms.u_resolution.value.y = height;

    renderer.setSize(width, height);

    // Reinitialize render target with new size
    let parameters = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false
    };
    
    rtFront = new THREE.WebGLRenderTarget(width, height, parameters);
    uniforms.u_currentTexture.value = rtFront;
}

function loop() {
    requestAnimationFrame(loop);
    render();
}

function render() {
    // Update uniforms
    uniforms.u_frameCount.value++;
    uniforms.u_distance.value = lenseObj.distance;
    uniforms.u_r_s.value = lenseObj.radius;
    uniforms.u_mouse.value.x = mouseposition.x + 0.5;
    uniforms.u_mouse.value.y = mouseposition.y + 0.5;
    uniforms.u_time.value = performance.now() / 1000;
    
    // Update disk uniforms
    uniforms.u_diskVisible.value = lenseObj.diskVisible;
    uniforms.u_diskRadius.value = lenseObj.diskRadius;
    uniforms.u_diskAngle.value = lenseObj.diskAngle * Math.PI / 180; // Convert to radians
    uniforms.u_diskThickness.value = lenseObj.diskThickness;
    uniforms.u_diskBrightness.value = lenseObj.diskBrightness;
    uniforms.u_diskRotationSpeed.value = lenseObj.diskRotationSpeed;
    
    // Update glow uniforms
    uniforms.u_glowStrength.value = lenseObj.glowStrength;
    uniforms.u_glowSize.value = lenseObj.glowSize;
    
    // Update Doppler effect uniform
    uniforms.u_dopplerEffect.value = lenseObj.showDopplerEffect;

    // Render to the render target first (using the modern API approach)
    renderer.setRenderTarget(rtFront);
    renderer.clear();
    renderer.render(scene, camera);
    
    // Then render to screen
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
}