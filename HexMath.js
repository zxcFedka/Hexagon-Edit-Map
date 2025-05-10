// HexMath.js

const HexMath = {
    // Ориентация: 'pointy' или 'flat'
    // Для нашего случая, зафиксируем 'pointy' внутри функций или передадим как параметр
    orientation: {
        pointy: {
            f0: Math.sqrt(3.0), f1: Math.sqrt(3.0) / 2.0, f2: 0.0, f3: 3.0 / 2.0, // forward matrix
            b0: Math.sqrt(3.0) / 3.0, b1: -1.0 / 3.0, b2: 0.0, b3: 2.0 / 3.0,   // backward matrix
            start_angle: 0.5 // в множителях PI (т.е. 0.5 * PI = 90 градусов, для pointy это скорее 0 или PI/6)
                               // Для pointy-topped, первый угол часто 30 градусов (PI/6)
        }
        // flat: { ... } // можно добавить, если нужно будет
    },

    // Конвертирует осевые координаты (q, r) в пиксельные (x, y)
    hexToPixel: function(q, r, size) {
        const M = this.orientation.pointy;
        const x = size * (M.f0 * q + M.f1 * r);
        const y = size * (M.f2 * q + M.f3 * r);
        return { x: x, y: y };
    },

    // Конвертирует пиксельные координаты (x, y) в осевые (q, r)
    pixelToHex: function(x, y, size) {
        const M = this.orientation.pointy;
        const q_frac = (M.b0 * x + M.b1 * y) / size;
        const r_frac = (M.b2 * x + M.b3 * y) / size;
        // s_frac = -q_frac - r_frac; // Нам не нужна s_frac для осевых напрямую, но нужна для округления

        return this.hexRound(q_frac, r_frac, -q_frac - r_frac);
    },

    // Округление дробных кубических координат до ближайшего целого гекса
    // Возвращает {q, r}
    hexRound: function(frac_q, frac_r, frac_s) {
        let q = Math.round(frac_q);
        let r = Math.round(frac_r);
        let s = Math.round(frac_s);

        const q_diff = Math.abs(q - frac_q);
        const r_diff = Math.abs(r - frac_r);
        const s_diff = Math.abs(s - frac_s);

        if (q_diff > r_diff && q_diff > s_diff) {
            q = -r - s;
        } else if (r_diff > s_diff) {
            r = -q - s;
        } else {
            // s = -q - r; // s здесь не возвращаем, он был нужен для коррекции q или r
        }
        return { q: q, r: r };
    },

    // Получает координаты углов гексагона относительно его центра (cx, cy)
    getHexCorners: function(centerX, centerY, size) {
        const corners = [];
        // Для pointy-topped, первый угол на 30 градусов (PI/6)
        const startAngle = Math.PI / 6; 
        for (let i = 0; i < 6; i++) {
            const angle = startAngle + (Math.PI / 3) * i; // 60 градусов = PI/3
            corners.push({
                x: centerX + size * Math.cos(angle),
                y: centerY + size * Math.sin(angle)
            });
        }
        return corners;
    },

    // Возвращает массив {q, r} координат соседей
    getNeighbors: function(q, r) {
        const directions = [
            { q: +1, r:  0 }, { q: -1, r:  0 }, { q:  0, r: +1 },
            { q:  0, r: -1 }, { q: +1, r: -1 }, { q: -1, r: +1 }
        ];
        const neighbors = [];
        for (const dir of directions) {
            neighbors.push({ q: q + dir.q, r: r + dir.r });
        }
        return neighbors;
    }
};

// Если нужно использовать как модуль в будущем (например, с import/export)
// export default HexMath;