(function () {
'use strict';

function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        return shader;
    }

    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

function createShaderProgram(gl, vSource, fSource) {
    const prog = gl.createProgram(),
        vshader = compileShader(gl, vSource, gl.VERTEX_SHADER),
        fshader = compileShader(gl, fSource, gl.FRAGMENT_SHADER);
    gl.attachShader(prog, vshader);
    gl.attachShader(prog, fshader);
    gl.linkProgram(prog);
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        return prog;
    }

    console.log(gl.getProgramInfoLog(prog));
}

function createBuffer(gl, type, size, usage) {
    const buf = gl.createBuffer();
    gl.bindBuffer(type, buf);
    gl.bufferData(type, size, usage);
    return buf;
}

function createTexture(gl, image, width, height) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.bindTexture(gl.TEXTURE_2D, null);

    texture.width = width;
    texture.height = height;

    return texture;
}

const VERTEX_SIZE = (4 * 2) + (4 * 2) + (4);
const MAX_BATCH = 10922;
const VERTICES_PER_QUAD = 6;
const VERTEX_DATA_SIZE = VERTEX_SIZE * MAX_BATCH * 4;
const INDEX_DATA_SIZE = MAX_BATCH * (2 * VERTICES_PER_QUAD);

const vertexShaderSource = `
precision lowp float;

// IN Vertex Position and
// IN Texture Coordinates
attribute vec2 a, b;

// IN Vertex Color
attribute vec4 c;

// OUT Texture Coordinates
varying vec2 d;
// OUT Vertex Color
varying vec4 e;

// CONST View Matrix
uniform mat4 m;
uniform vec2 r;

void main() {
    gl_Position = m * vec4(a, 1.0, 1.0);
    d = b;
    e = c;
}
`;

const fragmentShaderSource = `
precision lowp float;

// OUT Texture Coordinates
varying vec2 d;
// OUT Vertex Color
varying vec4 e;
// CONST Single Sampler2D
uniform sampler2D f;

void main() {
    gl_FragColor = texture2D(f, d) * e;
}
`;


function TinyCanvas(canvas) {
    const gl = canvas.getContext('webgl');
    const width = canvas.width;
    const height = canvas.height;
    const shader = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

    let vertexData = new ArrayBuffer(VERTEX_DATA_SIZE);
    let vPositionData = new Float32Array(vertexData);
    let vColorData = new Uint32Array(vertexData);
    let vIndexData = new Uint16Array(INDEX_DATA_SIZE);
    let IBO = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, vIndexData.byteLength, gl.STATIC_DRAW);
    let VBO = createBuffer(gl, gl.ARRAY_BUFFER, vertexData.byteLength, gl.DYNAMIC_DRAW);
    let count = 0;
    let mat = new Float32Array([1, 0, 0, 1, 0, 0]);
    let stack = new Float32Array(100);
    let stackp = 0;
    let currentTexture = null;

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.useProgram(shader);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBO);

    for (let indexA = 0, indexB = 0;
        indexA < MAX_BATCH * VERTICES_PER_QUAD;
        indexA += VERTICES_PER_QUAD, indexB += 4) {

        vIndexData[indexA + 0] = indexB,
        vIndexData[indexA + 1] = indexB + 1,
        vIndexData[indexA + 2] = indexB + 2,
        vIndexData[indexA + 3] = indexB + 0,
        vIndexData[indexA + 4] = indexB + 3,
        vIndexData[indexA + 5] = indexB + 1;
    }

    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, vIndexData);
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);

    let locA = gl.getAttribLocation(shader, 'a');
    let locB = gl.getAttribLocation(shader, 'b');
    let locC = gl.getAttribLocation(shader, 'c');

    gl.enableVertexAttribArray(locA);
    gl.vertexAttribPointer(locA, 2, gl.FLOAT, 0, VERTEX_SIZE, 0);

    gl.enableVertexAttribArray(locB);
    gl.vertexAttribPointer(locB, 2, gl.FLOAT, 0, VERTEX_SIZE, 8);

    gl.enableVertexAttribArray(locC);
    gl.vertexAttribPointer(locC, 4, gl.FLOAT, 1, VERTEX_SIZE, 16);

    gl.uniformMatrix4fv(gl.getUniformLocation(shader, 'm'), 0,
        new Float32Array([
            2 / width, 0, 0, 0,
            0, -2 / height, 0, 0,
            0, 0, 1, 1, -1, 1, 0, 0
        ])
    );

    gl.activeTexture(gl.TEXTURE0);

    let renderer = {
        g: gl,
        c: canvas,
        col: 0xFFFFFF,

        bkg(r, g, b) {
            gl.clearColor(r, g, b, 1.0);
        },

        cls() {
            gl.clear(gl.COLOR_BUFFER_BIT);
        },

        trans(x, y) {
            mat[4] = mat[0] * x + mat[2] * y + mat[4];
            mat[5] = mat[1] * x + mat[3] * y + mat[5];
        },

        scale(x, y) {
            mat[0] = mat[0] * x;
            mat[1] = mat[1] * x;
            mat[2] = mat[2] * y;
            mat[3] = mat[3] * y;
        },

        rot(r) {
            let a = mat[0],
                b = mat[1],
                c = mat[2],
                d = mat[3],
                sr = Math.sin(r),
                cr = Math.cos(r);

            mat[0] = a * cr + c * sr;
            mat[1] = b * cr + d * sr;
            mat[2] = a * -sr + c * cr;
            mat[3] = b * -sr + d * cr;
        },

        push() {
            stack[stackp + 0] = mat[0];
            stack[stackp + 1] = mat[1];
            stack[stackp + 2] = mat[2];
            stack[stackp + 3] = mat[3];
            stack[stackp + 4] = mat[4];
            stack[stackp + 5] = mat[5];
            stackp += 6;
        },

        pop() {
            stackp -= 6;
            mat[0] = stack[stackp + 0];
            mat[1] = stack[stackp + 1];
            mat[2] = stack[stackp + 2];
            mat[3] = stack[stackp + 3];
            mat[4] = stack[stackp + 4];
            mat[5] = stack[stackp + 5];
        },

        img(texture, x, y, w, h, u0, v0, u1, v1) {
            let x0 = x,
                y0 = y,
                x1 = x + w,
                y1 = y + h,
                x2 = x,
                y2 = y + h,
                x3 = x + w,
                y3 = y,
                a = mat[0],
                b = mat[1],
                c = mat[2],
                d = mat[3],
                e = mat[4],
                f = mat[5],
                offset = 0,
                argb = renderer.col;

            if (texture !== currentTexture || count + 1 >= MAX_BATCH) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
                gl.drawElements(4, count * VERTICES_PER_QUAD, gl.UNSIGNED_SHORT, 0);
                count = 0;
                if (currentTexture !== texture) {
                    currentTexture = texture;
                    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
                }
            }

            offset = count * VERTEX_SIZE;

            // Vertex Order
            // Vertex Position | UV | ARGB
            // Vertex 1
            vPositionData[offset++] = x0 * a + y0 * c + e;
            vPositionData[offset++] = x0 * b + y0 * d + f;
            vPositionData[offset++] = u0;
            vPositionData[offset++] = v0;
            vColorData[offset++] = argb;

            // Vertex 2
            vPositionData[offset++] = x1 * a + y1 * c + e;
            vPositionData[offset++] = x1 * b + y1 * d + f;
            vPositionData[offset++] = u1;
            vPositionData[offset++] = v1;
            vColorData[offset++] = argb;

            // Vertex 3
            vPositionData[offset++] = x2 * a + y2 * c + e;
            vPositionData[offset++] = x2 * b + y2 * d + f;
            vPositionData[offset++] = u0;
            vPositionData[offset++] = v1;
            vColorData[offset++] = argb;

            // Vertex 4
            vPositionData[offset++] = x3 * a + y3 * c + e;
            vPositionData[offset++] = x3 * b + y3 * d + f;
            vPositionData[offset++] = u1;
            vPositionData[offset++] = v0;
            vColorData[offset++] = argb;

            if (++count >= MAX_BATCH) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
                gl.drawElements(4, count * VERTICES_PER_QUAD, gl.UNSIGNED_SHORT, 0);
                count = 0;
            }
        },

        flush() {
            if (count === 0) {
                return;
            }
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vPositionData.subarray(0, count * VERTEX_SIZE));
            gl.drawElements(4, count * VERTICES_PER_QUAD, gl.UNSIGNED_SHORT, 0);
            count = 0;
        }
    };

    return renderer;
}

let canvas = TinyCanvas(document.getElementById('canvas'));

let gl = canvas.g;

const gravity = 0.5;
const maxX = canvas.c.width;
const minX = 0;
const maxY = canvas.c.height;
const minY = 0;

let add = false;
let startBunnyCount = 2;
let count = 0;
let amount = 100;
let kittens = [];

let counter = document.getElementById('counter');

const frames = [
    [0, 0, 32, 32],
    [0, 32, 32, 32],
    [0, 64, 32, 32],
    [0, 96, 32, 32]
];

let currentFrame = 0;

function Sprite(x, y, texture, frameX, frameY, frameW, frameH) {
    this.positionX = x;
    this.positionY = y;
    this.width = frameW;
    this.height = frameH;
    this.texture = texture;
    this.speedX = 0;
    this.speedY = 0;
    this.rotation = 0;
    this.u0 = frameX / texture.width;
    this.v0 = frameY / texture.height;
    this.u1 = this.u0 + (frameW / texture.width);
    this.v1 = this.v0 + (frameH / texture.height);
    this.halfWidth = frameW / 2;
}

function create() {
    let frame = frames[currentFrame];
    for (let i = 0; i < startBunnyCount; i++) {
        let kitten = new Sprite(0, 0, kittenTexture, frame[0], frame[1], frame[2], frame[3]);
        kitten.speedX = Math.random() * 10;
        kitten.speedY = (Math.random() * 10) - 5;
        kittens[count++] = kitten;
    }
    counter.innerHTML = count + " KITTENS";

    canvas.bkg(0.227, 0.227, 0.227);
    mainLoop();
}

function update() {
    if (add && count < 200000) {

        let frame = frames[currentFrame];
        for (let i = 0; i < amount; i++) {
            let kitten = new Sprite(0, 0, kittenTexture, frame[0], frame[1], frame[2], frame[3]);
            kitten.speedX = Math.random() * 10;
            kitten.speedY = (Math.random() * 10) - 5;
            kitten.rotation = (Math.random() - 0.5);
            kittens[count++] = kitten;
        }
        counter.innerHTML = count + ' KITTENS';

    }

    for (let i = 0; i < count; i++) {
        let kitten = kittens[i];

        kitten.positionX += kitten.speedX;
        kitten.positionY += kitten.speedY;
        kitten.speedY += gravity;

        if (kitten.positionX > maxX) {
            kitten.speedX *= -1;
            kitten.positionX = maxX;
        } else if (kitten.positionX < minX) {
            kitten.positionX *= -1;
            kitten.positionX = minX;
        }

        if (kitten.positionY > maxY) {
            kitten.speedY *= -0.085;
            kitten.positionY = maxY;

            kitten.spin = (Math.random() * 0.5) * 0.2;
            if (Math.random() > 0.5) {
                kitten.speedY -= Math.random() * 6;
            }

        } else if (kitten.positionY < minY) {
            kitten.speedY = 0;
            kitten.positionX = minX;
        }
    }
}

function draw() {

    canvas.cls();

    for (let i = 0; i < count; i++) {
        let kitten = kittens[i];

        canvas.push();
        canvas.trans(kitten.positionX, kitten.positionY);
        canvas.rot(kitten.rotation);

        canvas.img(
            kitten.texture,
            -kitten.halfWidth,
            0,
            kitten.width,
            kitten.height,
            kitten.u0,
            kitten.v0,
            kitten.u1,
            kitten.v1
        );
        canvas.pop();
    }

    canvas.flush();
}

function mainLoop() {
    requestAnimationFrame(mainLoop);
    update();
    draw();
}

function mouseDown() {
    add = true;
    currentFrame = (currentFrame + 1) % frames.length;
}

function mouseUp() {
    add = false;
}

canvas.c.addEventListener('mousedown', mouseDown, false);
canvas.c.addEventListener('mouseup', mouseUp, false);
canvas.c.addEventListener('touchstart', mouseDown, false);
canvas.c.addEventListener('touchend', mouseUp, false);

let kittenTexture;
let kittenImage = new Image();
kittenImage.onload = () => {
    kittenTexture = createTexture(gl, kittenImage, kittenImage.width, kittenImage.height);
    create();
};
kittenImage.src = 'data:image/png;base64,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';

}());
//# sourceMappingURL=bundle_canvas.js.map
