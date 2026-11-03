function drawGroupedBarChart(ctx, cw, ch, chart) {
    const pad = { top: 16, right: 20, bottom: 30, left: 44 };
    const w = cw - pad.left - pad.right;
    const h = ch - pad.top - pad.bottom;
    const unitStr = chart.unit ? ` ${chart.unit}` : '';

    drawAxes(ctx, pad, w, h, chart.yMax, chart.yStep);

    const n = chart.labels.length;
    const groupSlot = w / n;
    const seriesCount = chart.series.length;
    const barGap = 4;
    const barW = (groupSlot * 0.68) / seriesCount;
    const hitRegions = [];
    const showValueLabels = barW >= 22;

    chart.labels.forEach((label, gi) => {
        const groupX = pad.left + groupSlot * gi + groupSlot * 0.16;
        chart.series.forEach((s, si) => {
            const val = s.values[gi];
            const barH = (val / chart.yMax) * h;
            const x = groupX + si * (barW + barGap);
            const y = pad.top + h - barH;

            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 6;
            ctx.fillRect(x, y, barW, barH);
            ctx.shadowBlur = 0;

            if (showValueLabels) {
                ctx.fillStyle = COLORS.ink;
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(String(val), x + barW / 2, y - 5);
            }

            hitRegions.push({
                type: 'rect', x, y, w: barW, h: barH,
                tx: x + barW / 2, ty: y,
                label: `${s.name} · ${label}\n${val}${unitStr}`,
            });
        });

        ctx.fillStyle = COLORS.text;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, groupX + (groupSlot * 0.68) / 2, pad.top + h + 18);
    });
    ctx.textAlign = 'left';
    return hitRegions;
}

function drawMultiLineChart(ctx, cw, ch, chart, hoverIndex) {
    const pad = { top: 16, right: 20, bottom: 30, left: 44 };
    const w = cw - pad.left - pad.right;
    const h = ch - pad.top - pad.bottom;
    const n = chart.labels.length;
    const xAt = (i) => (n > 1 ? pad.left + (w / (n - 1)) * i : pad.left + w / 2);
    const unitStr = chart.unit ? ` ${chart.unit}` : '';

    drawAxes(ctx, pad, w, h, chart.yMax, chart.yStep);

    const allPoints = chart.series.map((s) => s.values.map((val, i) => ({
        x: xAt(i),
        y: pad.top + h - (val / chart.yMax) * h,
        val,
    })));

    chart.series.forEach((s, si) => {
        const points = allPoints[si];

        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 7;
        points.forEach((p, i) => {
            if (i === 0) { ctx.moveTo(p.x, p.y); return; }
            const prev = points[i - 1];
            const cx = (prev.x + p.x) / 2;
            ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        points.forEach((p) => {
            ctx.beginPath();
            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 6;
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    });

    chart.series.forEach((s) => {
        const lastVal = s.values[s.values.length - 1];
        const x = pad.left + w;
        const y = pad.top + h - (lastVal / chart.yMax) * h;
        ctx.fillStyle = s.color;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(lastVal), x - 2, y - 7);
    });

    ctx.fillStyle = COLORS.greenDim;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    chart.labels.forEach((label, i) => {
        if (n > 12 && i % 2 !== 0) return;
        const x = xAt(i);
        ctx.fillText(label, x, pad.top + h + 16);
    });
    ctx.textAlign = 'left';

    if (hoverIndex !== null && hoverIndex !== undefined) {
        const hx = xAt(hoverIndex);
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(244,244,240,0.4)';
        ctx.lineWidth = 1;
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + h);
        ctx.stroke();
        ctx.setLineDash([]);

        chart.series.forEach((s, si) => {
            const p = allPoints[si][hoverIndex];
            ctx.beginPath();
            ctx.strokeStyle = s.color;
            ctx.fillStyle = COLORS.paper;
            ctx.lineWidth = 2;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 10;
            ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
        });
    }

    const bandW = n > 1 ? w / (n - 1) : w;
    return chart.labels.map((label, i) => ({
        type: 'rect',
        x: xAt(i) - bandW / 2,
        y: pad.top,
        w: bandW,
        h,
        tx: xAt(i),
        ty: pad.top,
        idx: i,
        label: `${label}\n` + chart.series.map((s) => `${s.name}: ${s.values[i]}${unitStr}`).join('\n'),
    }));
}

function drawPieChart(ctx, cw, ch, chart, hoverIndex, opts) {
    const active = opts && opts.active;
    const isOn = (i) => !active || active.has(i);
    const cx = cw / 2;
    const cy = ch / 2;
    const outerR = Math.max(10, Math.min(cw, ch) / 2 - 24);
    const innerR = outerR * 0.55;
    const total = chart.slices.reduce((a, s) => a + s.value, 0);

    ctx.save();
    ctx.shadowColor = COLORS.green;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(51,255,119,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const hitRegions = [];
    let startAngle = -Math.PI / 2;
    chart.slices.forEach((slice, si) => {
        const on = isOn(si);
        const angle = (slice.value / total) * Math.PI * 2;
        const endAngle = startAngle + angle;
        const midAngle = startAngle + angle / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.globalAlpha = on ? 1 : 0.14;
        ctx.fillStyle = slice.color;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = COLORS.paper;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (!on) {
            startAngle = endAngle;
            return;
        }

        const labelR = (outerR + innerR) / 2;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;
        ctx.fillStyle = COLORS.paper;
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${slice.value}%`, lx, ly);

        hitRegions.push({
            type: 'circle', x: lx, y: ly, r: Math.max(16, angle * labelR * 0.4),
            tx: lx, ty: ly,
            label: `${slice.label}\n${slice.value} de ${total} (${Math.round((slice.value / total) * 100)}%)`,
        });

        startAngle = endAngle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244,244,240,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return hitRegions;
}

