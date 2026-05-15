const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelDisplay = document.getElementById('level-display');
const deathDisplay = document.getElementById('death-display');

// Game constants
const FPS = 50;
const TILE_SIZE = 32;
const GRAVITY = 0.4;
const MAX_FALL_SPEED = 9;
const JUMP_FORCE = -8.5;
const DOUBLE_JUMP_FORCE = -7.0;
const MOVE_SPEED = 3;

// Input state
const keys = {
    left: false,
    right: false,
    jump: false,
    restart: false
};

// Listeners
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'KeyZ' || e.code === 'Space') {
        if (!keys.jump) player.jump();
        keys.jump = true;
    }
    if (e.code === 'KeyR') {
        if (!keys.restart) restartLevel();
        keys.restart = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'KeyZ' || e.code === 'Space') {
        keys.jump = false;
        player.jumpRelease();
    }
    if (e.code === 'KeyR') keys.restart = false;
});

// Sound effects (synthesized for simplicity)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'jump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'djump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    }
}

// Game State
let currentLevel = 0;
let deathCount = 0;
let gameState = 'playing'; // playing, dead, win

let tiles = [];
let hazards = [];
let traps = [];
let particles = [];
let startPos = { x: 0, y: 0 };
let exitRect = { x: 0, y: 0, w: TILE_SIZE, h: TILE_SIZE };

// Player Object
const player = {
    x: 0, y: 0,
    w: 20, h: 24, // Smaller hitbox than visual (32x32)
    vx: 0, vy: 0,
    onGround: false,
    djump: true, // Has double jump
    facingRight: true,

    update: function() {
        if (gameState !== 'playing') return;

        // Horizontal movement
        if (keys.left) {
            this.vx = -MOVE_SPEED;
            this.facingRight = false;
        } else if (keys.right) {
            this.vx = MOVE_SPEED;
            this.facingRight = true;
        } else {
            this.vx = 0;
        }

        // Apply Gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        // Move X and collide
        this.x += this.vx;
        this.handleCollisions(true, false);

        // Move Y and collide
        this.y += this.vy;
        this.onGround = false;
        this.handleCollisions(false, true);

        // Check hazard collisions (Spikes, traps)
        this.checkHazards();

        // Check Exit
        if (rectIntersect(this.x, this.y, this.w, this.h, exitRect.x, exitRect.y, exitRect.w, exitRect.h)) {
            nextLevel();
        }
    },

    jump: function() {
        if (gameState !== 'playing') return;

        if (this.onGround) {
            this.vy = JUMP_FORCE;
            this.onGround = false;
            playSound('jump');
        } else if (this.djump) {
            this.vy = DOUBLE_JUMP_FORCE;
            this.djump = false;
            playSound('djump');
        }
    },

    jumpRelease: function() {
        if (this.vy < 0) {
            this.vy *= 0.45; // Variable jump height
        }
    },

    handleCollisions: function(moveX, moveY) {
        let playerRect = { x: this.x, y: this.y, w: this.w, h: this.h };
        
        for (let t of tiles) {
            if (t.type === 'fake') continue; // Fake blocks don't collide

            let tileRect = { x: t.x, y: t.y, w: TILE_SIZE, h: TILE_SIZE };
            if (rectIntersect(playerRect.x, playerRect.y, playerRect.w, playerRect.h, tileRect.x, tileRect.y, tileRect.w, tileRect.h)) {
                
                // If it's an invisible block, it reveals itself upon collision
                if (t.type === 'invisible') {
                    t.revealed = true;
                }

                if (moveX) {
                    if (this.vx > 0) {
                        this.x = tileRect.x - this.w;
                    } else if (this.vx < 0) {
                        this.x = tileRect.x + tileRect.w;
                    }
                    this.vx = 0;
                }
                if (moveY) {
                    if (this.vy > 0) {
                        this.y = tileRect.y - this.h;
                        this.onGround = true;
                        this.djump = true; // Reset double jump on landing
                    } else if (this.vy < 0) {
                        this.y = tileRect.y + tileRect.h;
                    }
                    this.vy = 0;
                }
            }
        }
    },

    checkHazards: function() {
        // Hitbox for hazards is even smaller to be "fair" (pixel perfect style)
        let hw = 8; 
        let hh = 10;
        let hx = this.x + (this.w / 2) - (hw / 2);
        let hy = this.y + (this.h / 2) - (hh / 2);

        for (let h of hazards) {
            let hazardRect = { x: h.x, y: h.y, w: TILE_SIZE, h: TILE_SIZE };
            
            // Refined spike hitboxes depending on orientation
            if (h.type === 'spike_up') {
                hazardRect = { x: h.x + 2, y: h.y + 16, w: 28, h: 16 };
            } else if (h.type === 'spike_down') {
                hazardRect = { x: h.x + 2, y: h.y, w: 28, h: 16 };
            } else if (h.type === 'spike_left') {
                hazardRect = { x: h.x + 16, y: h.y + 2, w: 16, h: 28 };
            } else if (h.type === 'spike_right') {
                hazardRect = { x: h.x, y: h.y + 2, w: 16, h: 28 };
            }

            if (rectIntersect(hx, hy, hw, hh, hazardRect.x, hazardRect.y, hazardRect.w, hazardRect.h)) {
                die();
                return;
            }
        }

        for (let t of traps) {
            // Traps have a slightly smaller hitbox than full tile
            let trapRect = { x: t.x + 4, y: t.y + 4, w: 24, h: 24 };
            if (rectIntersect(hx, hy, hw, hh, trapRect.x, trapRect.y, trapRect.w, trapRect.h)) {
                die();
                return;
            }
        }
    },

    draw: function() {
        if (gameState === 'dead') return;
        
        // Draw player (A stressed blue square)
        ctx.fillStyle = '#4488ff';
        let drawX = this.x - (32 - this.w) / 2;
        let drawY = this.y - (32 - this.h);
        
        ctx.fillRect(drawX, drawY, 32, 32);

        // Draw eyes
        ctx.fillStyle = 'white';
        if (this.facingRight) {
            ctx.fillRect(drawX + 18, drawY + 8, 4, 4);
            ctx.fillRect(drawX + 26, drawY + 8, 4, 4);
        } else {
            ctx.fillRect(drawX + 2, drawY + 8, 4, 4);
            ctx.fillRect(drawX + 10, drawY + 8, 4, 4);
        }
    }
};

function die() {
    if (gameState === 'dead') return;
    gameState = 'dead';
    deathCount++;
    deathDisplay.innerText = deathCount;
    playSound('death');

    // Create blood particles
    for (let i = 0; i < 50; i++) {
        particles.push({
            x: player.x + player.w/2,
            y: player.y + player.h/2,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            life: 60
        });
    }

    setTimeout(restartLevel, 1000);
}

function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
}

// Level Data
// . : Empty
// X : Wall
// S : Start position
// E : End/Terminal
// ^ : Spike Up
// v : Spike Down
// < : Spike Left
// > : Spike Right
// I : Invisible Wall
// F : Fake Wall
// B : Bill (Falls down when player is nearby X)
// U : Bill (Falls UP when player is nearby X)

const levels = [
    // Level 1: La Quincena (Intro)
    [
        "XXXXXXXXXXXXXXXXXXXXXXXXX",
        "X.......................X",
        "X.......................X",
        "X.......................X",
        "X.......................X",
        "X.......B...............X",
        "X.......................X",
        "X..................XXXX.X",
        "X................XXX....X",
        "X...X...B......XXX......X",
        "X....X.......XXX........X",
        "X.....X....XXX..........X",
        "X......XXXX.............X",
        "X.......................X",
        "X.....................E.X",
        "X..I...............XXXXXX",
        "XS.......^^^^^^....XXXXXX",
        "XXXXXXXXXXXXXXXXXXXXXXXXX"
    ],
    // Level 2: Los Intereses (Trolls)
    [
        "XXXXXXXXXXXXXXXXXXXXXXXXX",
        "X.......................X",
        "X.E.....................X",
        "XXX.....................X",
        "XXX.....F...............X",
        "XXX..........I..........X",
        "XXX.....................X",
        "XXX..^^^^^^.............X",
        "XXXXXXXXXXX......X..X...X",
        "X...U............X..X...X",
        "X................X..X...X",
        "X................X..X...X",
        "X...B.....XXXX.......I..X",
        "X.....X..FXXXX...X..X...X",
        "X...I...................X",
        "X......^^^^^^......^^^^.X",
        "XSXXXX.XXXXXX.I..I.XXXX.X",
        "XXXXXXXXXXXXXXXXXXXXXXXXX"
    ],
    // Level 3: El Banco (Brutal Precision)
    [
        "XXXXXXXXXXXXXXXXXXXXXXXXX",
        "XB..B..B..B..B..B..B..B.X",
        "X.......................X",
        "X......................EX",
        "X...........XXX........XX",
        "X...........XXX^......XXX",
        "X...........XXXX......XXX",
        "X.....................XXX",
        "X...........I..F......XXX",
        "X.......F........X....XXX",
        "X.......X^^^^^...X....XXX",
        "XS.F....X.....^v.X....XXX",
        "X..XXXXXX.....^^.X^^^^XXX",
        "X.IXXXXXX........XXXXXXXX",
        "X^^^^^^^^........XXXXXXXX",
        "XXXXXXXXX........XXXXXXXX",
        "XXXXXXXXX........XXXXXXXX",
        "XXXXXXXXXXXXXXXXXXXXXXXXX"
    ]
];

function loadLevel(index) {
    if (index >= levels.length) {
        gameState = 'win';
        playSound('win');
        return;
    }
    
    currentLevel = index;
    levelDisplay.innerText = currentLevel + 1;
    gameState = 'playing';
    
    tiles = [];
    hazards = [];
    traps = [];
    particles = [];

    let map = levels[index];
    for (let r = 0; r < map.length; r++) {
        for (let c = 0; c < map[r].length; c++) {
            let char = map[r][c];
            let x = c * TILE_SIZE;
            let y = r * TILE_SIZE;

            if (char === 'X') tiles.push({ x, y, type: 'wall' });
            else if (char === 'I') tiles.push({ x, y, type: 'invisible', revealed: false });
            else if (char === 'F') tiles.push({ x, y, type: 'fake' });
            else if (char === '^') hazards.push({ x, y, type: 'spike_up' });
            else if (char === 'v') hazards.push({ x, y, type: 'spike_down' });
            else if (char === '<') hazards.push({ x, y, type: 'spike_left' });
            else if (char === '>') hazards.push({ x, y, type: 'spike_right' });
            else if (char === 'B') traps.push({ x, y, type: 'bill_down', active: false, origY: y });
            else if (char === 'U') traps.push({ x, y, type: 'bill_up', active: false, origY: y });
            else if (char === 'S') {
                startPos = { x: x + 6, y: y + 8 }; // Center player in tile
                player.x = startPos.x;
                player.y = startPos.y;
                player.vx = 0;
                player.vy = 0;
            }
            else if (char === 'E') {
                exitRect = { x, y, w: TILE_SIZE, h: TILE_SIZE };
            }
        }
    }
}

function restartLevel() {
    loadLevel(currentLevel);
}

function nextLevel() {
    playSound('win');
    loadLevel(currentLevel + 1);
}

// Trap Logic
function updateTraps() {
    for (let t of traps) {
        // Trigger condition: Player is nearby horizontally
        if (!t.active && Math.abs((player.x + player.w/2) - (t.x + TILE_SIZE/2)) < TILE_SIZE * 2) {
            t.active = true;
        }

        if (t.active) {
            if (t.type === 'bill_down') {
                t.y += 6; // Falling speed
            } else if (t.type === 'bill_up') {
                t.y -= 6; // Flying up speed
            }
        }
    }
}

// Drawing Functions
function drawTiles() {
    for (let t of tiles) {
        if (t.type === 'wall' || t.type === 'fake' || (t.type === 'invisible' && t.revealed)) {
            ctx.fillStyle = '#555'; // Base block color
            ctx.fillRect(t.x, t.y, TILE_SIZE, TILE_SIZE);
            
            // Border to make it look like a block
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            ctx.strokeRect(t.x, t.y, TILE_SIZE, TILE_SIZE);
            
            // Inner highlight
            ctx.fillStyle = '#777';
            ctx.fillRect(t.x + 2, t.y + 2, TILE_SIZE - 4, 4);
        }
    }
}

function drawHazards() {
    ctx.fillStyle = '#ff2222';
    for (let h of hazards) {
        ctx.beginPath();
        if (h.type === 'spike_up') {
            ctx.moveTo(h.x, h.y + TILE_SIZE);
            ctx.lineTo(h.x + TILE_SIZE / 2, h.y);
            ctx.lineTo(h.x + TILE_SIZE, h.y + TILE_SIZE);
        } else if (h.type === 'spike_down') {
            ctx.moveTo(h.x, h.y);
            ctx.lineTo(h.x + TILE_SIZE, h.y);
            ctx.lineTo(h.x + TILE_SIZE / 2, h.y + TILE_SIZE);
        } else if (h.type === 'spike_left') {
            ctx.moveTo(h.x + TILE_SIZE, h.y);
            ctx.lineTo(h.x, h.y + TILE_SIZE / 2);
            ctx.lineTo(h.x + TILE_SIZE, h.y + TILE_SIZE);
        } else if (h.type === 'spike_right') {
            ctx.moveTo(h.x, h.y);
            ctx.lineTo(h.x + TILE_SIZE, h.y + TILE_SIZE / 2);
            ctx.lineTo(h.x, h.y + TILE_SIZE);
        }
        ctx.fill();
        
        // Spike highlight
        ctx.fillStyle = '#ffaaaa';
        ctx.beginPath();
        if (h.type === 'spike_up') {
            ctx.moveTo(h.x + TILE_SIZE / 2, h.y + 4);
            ctx.lineTo(h.x + TILE_SIZE / 2 + 4, h.y + TILE_SIZE - 4);
            ctx.lineTo(h.x + TILE_SIZE / 2 - 4, h.y + TILE_SIZE - 4);
        }
        // Simplified highlight just for up spikes to keep code compact, otherwise plain red is fine
        ctx.fill();
        ctx.fillStyle = '#ff2222'; // Reset
    }
}

function drawTraps() {
    for (let t of traps) {
        // Draw a "Bill" / "Factura" (A white paper with text lines)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(t.x + 4, t.y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        ctx.fillStyle = '#ff0000';
        ctx.font = '10px Arial';
        ctx.fillText("$$$", t.x + 8, t.y + 16);
        ctx.fillStyle = '#000000';
        ctx.fillRect(t.x + 8, t.y + 20, 16, 2);
        ctx.fillRect(t.x + 8, t.y + 24, 12, 2);
    }
}

function drawExit() {
    if (gameState === 'win') return;
    // Draw Credit Card Terminal
    ctx.fillStyle = '#222';
    ctx.fillRect(exitRect.x, exitRect.y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#44ff44'; // Screen
    ctx.fillRect(exitRect.x + 4, exitRect.y + 4, TILE_SIZE - 8, 12);
    // Keys
    ctx.fillStyle = '#aaa';
    ctx.fillRect(exitRect.x + 6, exitRect.y + 20, 6, 4);
    ctx.fillRect(exitRect.x + 14, exitRect.y + 20, 6, 4);
    ctx.fillRect(exitRect.x + 22, exitRect.y + 20, 6, 4);
    ctx.fillRect(exitRect.x + 6, exitRect.y + 26, 6, 4);
    ctx.fillRect(exitRect.x + 14, exitRect.y + 26, 6, 4);
    ctx.fillRect(exitRect.x + 22, exitRect.y + 26, 6, 4);
}

function drawParticles() {
    ctx.fillStyle = '#ff0000';
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        ctx.fillRect(p.x, p.y, 4, 4);
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY; // Gravity affects blood
        p.life--;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// Main Game Loop
function update() {
    player.update();
    if (gameState === 'playing') {
        updateTraps();
    }
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawTiles();
    drawExit();
    drawHazards();
    drawTraps();
    player.draw();
    drawParticles();

    if (gameState === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#44ff44';
        ctx.font = '40px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText("¡DEUDA PAGADA!", canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Courier New';
        ctx.fillText(`Muertes totales: ${deathCount}`, canvas.width / 2, canvas.height / 2 + 20);
        ctx.fillText("Recarga la página para sufrir de nuevo.", canvas.width / 2, canvas.height / 2 + 60);
    }
}

function loop() {
    update();
    draw();
    setTimeout(loop, 1000 / FPS);
}

// Start Game
loadLevel(0);
loop();
