//import * as KldIntersections from 'kld-intersections';
//const { IntersectionQuery, ShapeFactory } = KldIntersections;

// --- ベクトル & 物理クラスの定義 ---

class Vector2D {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vector2D(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2D(this.x - v.x, this.y - v.y); }
    multiply(s) { return new Vector2D(this.x * s, this.y * s); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    lengthSq() { return this.x * this.x + this.y * this.y; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() {
        const len = this.length();
        return len === 0 ? new Vector2D(0, 0) : new Vector2D(this.x / len, this.y / len);
    }
}

// --- シミュレーションの初期状態 ---
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

const lens = {
    center: new Vector2D(400, 250),
    radius: 120,
    n: 1.50
};

// 光線源（平行光線を複数本出すための設定）
const rayCount = 11;
const raySpacing = 20;

// マウスドラッグ管理用
let isDragging = false;

// --- 光学計算ロジック ---
function reflect(incident, normal) {
    return incident.sub(normal.multiply(2 * incident.dot(normal)));
}

function refract(incident, normal, n1, n2) {
    const r = n1 / n2;
    const c1 = -incident.dot(normal);
    const c2 = 1 - r * r * (1 - c1 * c1);
    if (c2 < 0) return { direction: reflect(incident, normal), isTotal: true }; // 全反射
    return { direction: incident.multiply(r).add(normal.multiply(r * c1 - Math.sqrt(c2))).normalize(), isTotal: false };
}

function findClosestForwardHit(origin, direction, hitPoints) {
    let closestHit = null;
    let minDistanceSq = Infinity;
    for (const hit of hitPoints) {
        const hitPt = new Vector2D(hit.x, hit.y);
        const v = hitPt.sub(origin);
        if (v.dot(direction) > 0.001) { // 前方判定
            const distSq = v.lengthSq();
            if (distSq < minDistanceSq) { minDistanceSq = distSq; closestHit = hitPt; }
        }
    }
    return closestHit;
}

// 1本の光線を追跡して軌跡（座標配列）を返す
function traceRay(startOrigin, startDir) {
    let currentOrigin = startOrigin;
    let currentDir = startDir.normalize();
    const path = [currentOrigin];
    
    for (let step = 0; step < 4; step++) {
        const farPoint = currentOrigin.add(currentDir.multiply(10000));
        const kldRay = ShapeFactory.line(currentOrigin.x, currentOrigin.y, farPoint.x, farPoint.y);
        const kldLens = ShapeFactory.circle(lens.center.x, lens.center.y, lens.radius);

        const result = IntersectionQuery.intersect(kldRay, kldLens);
        if (result.status !== "Intersection" || result.points.length === 0) break;

        const hitPoint = findClosestForwardHit(currentOrigin, currentDir, result.points);
        if (!hitPoint) break;

        path.push(hitPoint);

        let normal = hitPoint.sub(lens.center).normalize();
        const ioDot = currentDir.dot(normal);
        
        let n1, n2;
        if (ioDot < 0) { // 侵入
            n1 = 1.0; n2 = lens.n;
        } else { // 脱出
            n1 = lens.n; n2 = 1.0;
            normal = normal.multiply(-1); // 法線反転
        }

        const opt = refract(currentDir, normal, n1, n2);
        currentOrigin = hitPoint;
        currentDir = opt.direction;
    }
    
    path.push(currentOrigin.add(currentDir.multiply(1000))); // 画面外へ伸ばす
    return path;
}
const ShapeFactory = {
    line: (x1, y1, x2, y2) => ({ p1: new Vector2D(x1, y1), p2: new Vector2D(x2, y2) }),
    circle: (cx, cy, r) => ({ center: new Vector2D(cx, cy), r })
};

const IntersectionQuery = {
    intersect: (line, circle) => {
        const d = line.p2.sub(line.p1).normalize(); // 直線の方向ベクトル
        const f = line.p1.sub(circle.center);       // 円の中心から直線の始点へのベクトル

        // 2次方程式 a*t^2 + b*t + c = 0 を解く
        const a = d.dot(d); // 1
        const b = 2 * f.dot(d);
        const c = f.dot(f) - circle.r * circle.r;

        const discriminant = b * b - 4 * a * c; // 判別式

        if (discriminant < 0) {
            return { status: "No Intersection", points: [] };
        }

        const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
        const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

        const points = [];
        // 直線上の交点座標を復元
        points.push(line.p1.add(d.multiply(t1)));
        points.push(line.p1.add(d.multiply(t2)));

        return { status: "Intersection", points: points };
    }
};

// --- 描画メインループ ---
function draw() {
    // 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. レンズの描画
    ctx.beginPath();
    ctx.arc(lens.center.x, lens.center.y, lens.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 180, 255, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. 複数本の平行光線を計算・描画
    const startX = 50;
    const centerY = canvas.height / 2;
    const startDir = new Vector2D(1, 0); // 右向きの平行光線

    for (let i = 0; i < rayCount; i++) {
        const offset = (i - Math.floor(rayCount / 2)) * raySpacing;
        const startOrigin = new Vector2D(startX, centerY + offset);
        
        // レイの追跡
        const path = traceRay(startOrigin, startDir);

        // Canvasに線を引く
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let j = 1; j < path.length; j++) {
            ctx.lineTo(path[j].x, path[j].y);
        }
        ctx.strokeStyle = 'rgba(255, 230, 0, 0.7)'; // レーザーっぽい黄色
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

// --- UI・イベント処理 ---
const slider = document.getElementById('refractiveIndex');
const nVal = document.getElementById('nVal');

slider.addEventListener('input', (e) => {
    lens.n = parseFloat(e.target.value);
    nVal.textContent = lens.n.toFixed(2);
    draw();
});

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // レンズ内をクリックしたか判定
    const dist = Math.sqrt((mouseX - lens.center.x)**2 + (mouseY - lens.center.y)**2);
    if (dist < lens.radius) {
        isDragging = true;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    lens.center.x = e.clientX - rect.left;
    lens.center.y = e.clientY - rect.top;
    draw();
});

window.addEventListener('mouseup', () => { isDragging = false; });

// 初回描画
draw();