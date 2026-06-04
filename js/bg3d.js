(function () {
    'use strict';

    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    /* ── Resize ── */
    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.width;
    const H = () => canvas.height;

    /* ── Mouse tracking with velocity ── */
    const mouse = {
        x: W() / 2,
        y: H() / 2,
        px: W() / 2,
        py: H() / 2,
        speed: 0
    };

    window.addEventListener('mousemove', e => {
        mouse.px    = mouse.x;
        mouse.py    = mouse.y;
        mouse.x     = e.clientX;
        mouse.y     = e.clientY;
        const dx    = mouse.x - mouse.px;
        const dy    = mouse.y - mouse.py;
        mouse.speed = Math.sqrt(dx * dx + dy * dy);
    });

    window.addEventListener('touchmove', e => {
        if (e.touches.length > 0) {
            mouse.px    = mouse.x;
            mouse.py    = mouse.y;
            mouse.x     = e.touches[0].clientX;
            mouse.y     = e.touches[0].clientY;
            const dx    = mouse.x - mouse.px;
            const dy    = mouse.y - mouse.py;
            mouse.speed = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });



    /* ── Helpers ── */
    function rand(min, max) { return min + Math.random() * (max - min); }

    const PALETTE = [
        '#5c4ef0', '#8b6ff7', '#b48eff',
        '#4f46e5', '#7c3aed', '#00d4aa', '#fd79a8'
    ];

    /* ════════════════════
       CURSOR AURA
    ════════════════════ */
    function drawCursorAura() {
        const speed = Math.min(mouse.speed, 30);
        const glowR = 60 + speed * 2;

        const grad = ctx.createRadialGradient(
            mouse.x, mouse.y, 0,
            mouse.x, mouse.y, glowR
        );
        grad.addColorStop(0,   'rgba(180,142,255,0.12)');
        grad.addColorStop(0.4, 'rgba(139,111,247,0.05)');
        grad.addColorStop(1,   'rgba(92,78,240,0.00)');

        ctx.globalAlpha = 1;
        ctx.fillStyle   = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        /* tiny bright core */
        ctx.globalAlpha = 0.6;
        ctx.fillStyle   = '#b48eff';
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    /* ════════════════════
       NEBULA BLOBS
    ════════════════════ */
    class Nebula {
        constructor(bx, by, r, color) {
            this.bx    = bx;
            this.by    = by;
            this.r     = r;
            this.color = color;
            this.t     = rand(0, Math.PI * 2);
            this.speed = rand(0.0015, 0.004);
            this.ox    = rand(-40, 40);
            this.oy    = rand(-30, 30);
        }

        update() {
            this.t += this.speed;
            this.x  = this.bx * W() + Math.sin(this.t)       * this.ox;
            this.y  = this.by * H() + Math.cos(this.t * 0.7) * this.oy;

            /* subtle drift toward cursor */
            this.x += (mouse.x - this.x) * 0.00008;
            this.y += (mouse.y - this.y) * 0.00008;
        }

        draw() {
            const grad = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.r
            );
            grad.addColorStop(0, this.color + '1a');
            grad.addColorStop(1, this.color + '00');
            ctx.globalAlpha = 1;
            ctx.fillStyle   = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* ════════════════════
       GRID LINES
    ════════════════════ */
    class GridLine {
        constructor(isH) {
            this.isH   = isH;
            this.pos   = isH ? rand(0, H()) : rand(0, W());
            this.speed = rand(0.15, 0.45) * (isH ? 1 : 0.6);
            this.alpha = rand(0.012, 0.035);
        }

        update() {
            this.pos += this.speed;
            if (this.isH && this.pos > H()) this.pos = 0;
            if (!this.isH && this.pos > W()) this.pos = 0;
        }

        draw() {
            /* glow when near cursor */
            const d = this.isH
                ? Math.abs(this.pos - mouse.y)
                : Math.abs(this.pos - mouse.x);

            const boost = d < 80 ? 1 + (80 - d) / 80 * 4 : 1;

            ctx.globalAlpha = Math.min(this.alpha * boost, 0.25);
            ctx.strokeStyle = boost > 2 ? '#b48eff' : '#5c4ef0';
            ctx.lineWidth   = boost > 2 ? 1 : 0.5;
            ctx.beginPath();
            if (this.isH) {
                ctx.moveTo(0,   this.pos);
                ctx.lineTo(W(), this.pos);
            } else {
                ctx.moveTo(this.pos, 0);
                ctx.lineTo(this.pos, H());
            }
            ctx.stroke();
        }
    }

    /* ════════════════════
       CONNECTION WEB
    ════════════════════ */
    class ConnectionWeb {
        constructor() {
            this.nodes = Array.from({ length: 30 }, () => ({
                x:  rand(0.04, 0.96),
                y:  rand(0.04, 0.96),
                vx: rand(-0.00025, 0.00025),
                vy: rand(-0.00025, 0.00025),
                ox: 0,   /* magnetic offset x */
                oy: 0,   /* magnetic offset y */
            }));
        }

        update() {
            const mx          = mouse.x / W();
            const my          = mouse.y / H();
            const PULL_RADIUS = 0.22;
            const PULL_STR    = 0.000022;
            const SPRING      = 0.05;

            this.nodes.forEach(n => {
                n.x += n.vx;
                n.y += n.vy;
                if (n.x < 0.02 || n.x > 0.98) n.vx *= -1;
                if (n.y < 0.02 || n.y > 0.98) n.vy *= -1;

                /* magnetic pull */
                const dx   = mx - n.x;
                const dy   = my - n.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < PULL_RADIUS && dist > 0.001) {
                    const force = (PULL_RADIUS - dist) / PULL_RADIUS;
                    n.ox += dx / dist * force * PULL_STR * 60;
                    n.oy += dy / dist * force * PULL_STR * 60;
                }

                /* spring restore */
                n.ox *= (1 - SPRING);
                n.oy *= (1 - SPRING);
            });
        }

        draw() {
            const mx  = mouse.x / W();
            const my  = mouse.y / H();
            const now = Date.now();

            this.nodes.forEach((a, i) => {
                const ax = a.x + a.ox;
                const ay = a.y + a.oy;

                /* ── node-to-node lines ── */
                this.nodes.forEach((b, j) => {
                    if (j <= i) return;
                    const bx = b.x + b.ox;
                    const by = b.y + b.oy;
                    const dx = ax - bx;
                    const dy = ay - by;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 0.26) {
                        /* how close is midpoint to cursor? */
                        const midX  = (ax + bx) / 2;
                        const midY  = (ay + by) / 2;
                        const mdx   = midX - mx;
                        const mdy   = midY - my;
                        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
                        const prox  = Math.max(0, 1 - mDist / 0.30);

                        const baseAlpha = (0.26 - dist) / 0.26 * 0.06;
                        ctx.globalAlpha = Math.min(baseAlpha + prox * 0.25, 1);
                        ctx.strokeStyle = prox > 0.5 ? '#e0ccff' : '#8b6ff7';
                        ctx.lineWidth   = 0.5 + prox * 2;

                        ctx.beginPath();
                        ctx.moveTo(ax * W(), ay * H());
                        ctx.lineTo(bx * W(), by * H());
                        ctx.stroke();

                        /* energy dot on hot lines */
                        if (prox > 0.6) {
                            const t  = (now % 1400) / 1400;
                            const px = (ax + (bx - ax) * t) * W();
                            const py = (ay + (by - ay) * t) * H();
                            ctx.globalAlpha = prox * 0.75;
                            ctx.fillStyle   = '#ffffff';
                            ctx.beginPath();
                            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                });

                /* ── mouse attraction lines — gradient ── */
                const dx   = ax - mx;
                const dy   = ay - my;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 0.25) {
                    const strength = (0.25 - dist) / 0.25;

                    const grad = ctx.createLinearGradient(
                        ax * W(), ay * H(),
                        mouse.x,  mouse.y
                    );
                    grad.addColorStop(0,   `rgba(139,111,247,${strength * 0.15})`);
                    grad.addColorStop(0.6, `rgba(180,142,255,${strength * 0.50})`);
                    grad.addColorStop(1,   `rgba(255,255,255,${strength * 0.80})`);

                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = grad;
                    ctx.lineWidth   = 0.5 + strength * 2.5;
                    ctx.beginPath();
                    ctx.moveTo(ax * W(), ay * H());
                    ctx.lineTo(mouse.x,  mouse.y);
                    ctx.stroke();
                }

                /* ── node dots with proximity glow ── */
                const ndx    = ax - mx;
                const ndy    = ay - my;
                const nDist  = Math.sqrt(ndx * ndx + ndy * ndy);
                const near   = Math.max(0, 1 - nDist / 0.18);
                const nodeR  = 1.3 + near * 4.5;

                if (near > 0.05) {
                    const glow = ctx.createRadialGradient(
                        ax * W(), ay * H(), 0,
                        ax * W(), ay * H(), nodeR * 6
                    );
                    glow.addColorStop(0, `rgba(180,142,255,${near * 0.55})`);
                    glow.addColorStop(1, 'rgba(180,142,255,0)');
                    ctx.globalAlpha = 1;
                    ctx.fillStyle   = glow;
                    ctx.beginPath();
                    ctx.arc(ax * W(), ay * H(), nodeR * 6, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.globalAlpha = 0.35 + near * 0.65;
                ctx.fillStyle   = near > 0.35 ? '#ffffff' : '#9d8fff';
                ctx.beginPath();
                ctx.arc(ax * W(), ay * H(), nodeR, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    /* ════════════════════
       FLOATING SHAPES
    ════════════════════ */
    class FloatingShape {
        constructor() { this.reset(true); }

        reset(init) {
            this.x        = rand(0, W());
            this.y        = init ? rand(0, H()) : H() + rand(20, 80);
            this.z        = rand(0.12, 0.45);
            this.size     = rand(18, 72) * this.z;
            this.speedY   = rand(0.08, 0.32) * this.z;
            this.speedX   = rand(-0.08, 0.08);
            this.rot      = rand(0, Math.PI * 2);
            this.rotSpeed = rand(-0.003, 0.003);
            this.type     = Math.floor(Math.random() * 3);
            this.color    = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            this.alpha    = rand(0.035, 0.10) * this.z;
        }

        update() {
            /* gentle repulsion from cursor */
            const dx   = this.x - mouse.x;
            const dy   = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120 && dist > 1) {
                const force = (120 - dist) / 120 * 0.45;
                this.x += (dx / dist) * force;
                this.y += (dy / dist) * force;
            }

            this.x   += this.speedX;
            this.y   += this.speedY;
            this.rot += this.rotSpeed;
            if (this.y < -(this.size * 2)) this.reset(false);
            if (this.speedY < 0 && this.y > H() + this.size * 2) this.reset(false);
        }

        draw() {
            const dx   = this.x - mouse.x;
            const dy   = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const near = Math.max(0, 1 - dist / 160);

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            ctx.globalAlpha = this.alpha + near * 0.14;
            ctx.strokeStyle = this.color;
            ctx.lineWidth   = 0.8 + near * 1.8;

            const s = this.size;
            ctx.beginPath();

            if (this.type === 0) {
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
                    i === 0
                        ? ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s)
                        : ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
                }
                ctx.closePath();
            } else if (this.type === 1) {
                ctx.rect(-s / 2, -s / 2, s, s);
            } else {
                ctx.moveTo(0, -s);
                ctx.lineTo(s * 0.866,  s * 0.5);
                ctx.lineTo(-s * 0.866, s * 0.5);
                ctx.closePath();
            }

            ctx.stroke();
            ctx.restore();
        }
    }

    /* ════════════════════
       PARTICLE FIELD
    ════════════════════ */
    class Particle {
        constructor() { this.reset(true); }

        reset(init) {
            this.x            = rand(0, W());
            this.y            = init ? rand(0, H()) : H() + rand(5, 20);
            this.z            = rand(0.2, 1.0);
            this.r            = rand(0.8, 2.8) * this.z;
            this.speedY       = rand(-0.25, -0.8) * this.z;
            this.speedX       = rand(-0.12, 0.12);
            this.color        = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            this.alpha        = rand(0.25, 0.75) * this.z;
            this.twinkle      = rand(0, Math.PI * 2);
            this.twinkleSpeed = rand(0.01, 0.04);
        }

        update() {
            /* gentle attraction toward cursor */
            const dx   = mouse.x - this.x;
            const dy   = mouse.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 90 && dist > 1) {
                const pull = (90 - dist) / 90 * 0.15;
                this.x += (dx / dist) * pull;
                this.y += (dy / dist) * pull;
            }

            this.x       += this.speedX;
            this.y       += this.speedY;
            this.twinkle += this.twinkleSpeed;
            if (this.y < -6) this.reset(false);
        }

        draw() {
            const dx   = this.x - mouse.x;
            const dy   = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const near = Math.max(0, 1 - dist / 100);

            const a = Math.min((this.alpha + near * 0.45) * (0.55 + 0.45 * Math.sin(this.twinkle)), 1);
            ctx.globalAlpha = a;
            ctx.fillStyle   = near > 0.55 ? '#ffffff' : this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r + near * 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* ── Instantiate all layers ── */
    const nebulae = [
        new Nebula(0.12, 0.18, 220, '#5c4ef0'),
        new Nebula(0.85, 0.78, 190, '#7c3aed'),
        new Nebula(0.50, 0.52, 150, '#00d4aa'),
        new Nebula(0.76, 0.12, 170, '#fd79a8'),
    ];

    const hLines    = Array.from({ length: 6  }, () => new GridLine(true));
    const vLines    = Array.from({ length: 9  }, () => new GridLine(false));
    const web       = new ConnectionWeb();
    const shapes    = Array.from({ length: 40 }, () => new FloatingShape());
    const particles = Array.from({ length: 160 }, () => new Particle());

    /* ── Render loop ── */
    function frame() {
        ctx.clearRect(0, 0, W(), H());

        nebulae.forEach(n   => { n.update(); n.draw(); });
        hLines.forEach(l    => { l.update(); l.draw(); });
        vLines.forEach(l    => { l.update(); l.draw(); });
        web.update(); web.draw();
        shapes.forEach(s    => { s.update(); s.draw(); });
        particles.forEach(p => { p.update(); p.draw(); });

        /* overlay effects — drawn on top of everything */
        drawCursorAura();

        ctx.globalAlpha = 1;
        requestAnimationFrame(frame);
    }

    frame();
})();