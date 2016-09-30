
// float + (vec2 * 4) + (char * 4)
const VERTEX_SIZE = 4 + ((4 * 2) * 4) + 4
// floor((2 ^ 16) / 16)
const MAX_BATCH = 10922;
const VERTEX_DATA_SIZE = VERTEX_SIZE * MAX_BATCH * 4;
const VERTICES_PER_QUAD = 6;
const INDEX_DATA_SIZE = MAX_BATCH * (2 * VERTICES_PER_QUAD);

const vertexShaderSource= `
precision lowp float;

attribute float a;
attribute vec2 b,c,d,e;
attribute vec4 f;

varying vec2 g;
varying vec4 h;

uniform mat4 i;

void main() {
    float q = cos(a);
    float w = sin(a);

    gl_Position = i * vec4(((vec2(d.x * q - d.y * w, d.x * w + d.y * q) * c) + b), 1.0, 1.0);
    g = e;
    h = f;
}
`;

const fragmentShaderSource= `
precision lowp float;

varying vec2 g;
varying vec4 h;
uniform sampler2D j;

void main() {
    gl_FragColor = texture2D(j, g) * h;
}
`;

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

export function createTexture(gl, image, width, height) {
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

export function TinySprite(canvas) {

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

    const locRotation = gl.getAttribLocation(shader, 'a');
    const locTranslation = gl.getAttribLocation(shader, 'b');
    const locScale = gl.getAttribLocation(shader, 'c');
    const locPosition = gl.getAttribLocation(shader, 'd');
    const locUV = gl.getAttribLocation(shader, 'e');
    const locColor = gl.getAttribLocation(shader, 'f');

    // Rotation
    gl.enableVertexAttribArray(locRotation);
    gl.vertexAttribPointer(locRotation, 1, gl.FLOAT, 0, VERTEX_SIZE, 0);

    // Translation
    gl.enableVertexAttribArray(locTranslation);
    gl.vertexAttribPointer(locTranslation, 2, gl.FLOAT, 0, VERTEX_SIZE, 4);

    // Scale
    gl.enableVertexAttribArray(locScale);
    gl.vertexAttribPointer(locScale, 2, gl.FLOAT, 0, VERTEX_SIZE, 12);

    // Position
    gl.enableVertexAttribArray(locPosition);
    gl.vertexAttribPointer(locPosition, 2, gl.FLOAT, 0, VERTEX_SIZE, 20);

    // UV
    gl.enableVertexAttribArray(locUV);
    gl.vertexAttribPointer(locUV, 2, gl.FLOAT, 0, VERTEX_SIZE, 28);

    // Color
    gl.enableVertexAttribArray(locColor);
    gl.vertexAttribPointer(locColor, 4, gl.UNSIGNED_BYTE, 1, VERTEX_SIZE, 36);

    gl.uniformMatrix4fv(gl.getUniformLocation(shader, 'i'), 0,
        new Float32Array([
            2 / width, 0, 0, 0,
            0, -2 / height, 0, 0,
            0, 0, 1, 1,
            -1, 1, 0, 0
        ])
    );

    gl.activeTexture(gl.TEXTURE0);

    let renderer = {
        g: gl,
        c: canvas,
        col: 0xFFFFFFFF,

        bkg(r, g, b) {
            gl.clearColor(r, g, b, 1);
        },

        cls() {
            gl.clear(gl.COLOR_BUFFER_BIT);
        },

        img(texture, x, y, w, h, r, tx, ty, sx, sy, u0, v0, u1, v1) {
            let x0 = x,
                y0 = y,
                x1 = x + w,
                y1 = y + h,
                x2 = x,
                y2 = y + h,
                x3 = x + w,
                y3 = y,
                offset = 0,
                argb = renderer.col;


            if (texture != currentTexture || count + 1 >= MAX_BATCH) {

                gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
                gl.drawElements(4, count * VERTICES_PER_QUAD, gl.UNSIGNED_SHORT, 0);
                count = 0;
                if (texture != currentTexture) {
                    currentTexture = texture;
                    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
                }
            }

            offset = count * VERTEX_SIZE;

            // Vertex order:
            // rotation | translation | scale | position | uv | color;
            // Vertex 1
            vPositionData[offset++] = r;
            vPositionData[offset++] = tx;
            vPositionData[offset++] = ty;
            vPositionData[offset++] = sx;
            vPositionData[offset++] = sy;
            vPositionData[offset++] = x0;
            vPositionData[offset++] = y0;
            vPositionData[offset++] = u0;
            vPositionData[offset++] = v0;
            vColorData[offset++] = argb;

            // Vertex 2
            vPositionData[offset++] = r;
            vPositionData[offset++] = tx;
            vPositionData[offset++] = ty;
            vPositionData[offset++] = sx;
            vPositionData[offset++] = sy;
            vPositionData[offset++] = x1;
            vPositionData[offset++] = y1;
            vPositionData[offset++] = u1;
            vPositionData[offset++] = v1;
            vColorData[offset++] = argb;

            // Vertex 3
            vPositionData[offset++] = r;
            vPositionData[offset++] = tx;
            vPositionData[offset++] = ty;
            vPositionData[offset++] = sx;
            vPositionData[offset++] = sy;
            vPositionData[offset++] = x2;
            vPositionData[offset++] = y2;
            vPositionData[offset++] = u0;
            vPositionData[offset++] = v1;
            vColorData[offset++] = argb;

            // Vertex 4
            vPositionData[offset++] = r;
            vPositionData[offset++] = tx;
            vPositionData[offset++] = ty;
            vPositionData[offset++] = sx;
            vPositionData[offset++] = sy;
            vPositionData[offset++] = x3;
            vPositionData[offset++] = y3;
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
