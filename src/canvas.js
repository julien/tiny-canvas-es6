import {createBuffer, createTexture, createShaderProgram} from './lib';

const VERTEX_SIZE = (4 * 2) + (4 * 2) + (4);
const MAX_BATCH = 10922;
const MAX_STACK = 100;
const MAT_SIZE = 6;
const VERTICES_PER_QUAD = 6;
const MAT_STACK_SIZE = MAX_STACK * MAT_SIZE;
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


export default function TinyCanvas(canvas) {
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
