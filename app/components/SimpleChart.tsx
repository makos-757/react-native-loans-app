import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle, Path, G, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import type { ChartData } from '../types';

interface BarChartProps {
  data: ChartData[];
  title: string;
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, title, height = 160, color, formatValue }: BarChartProps) {
  const colors = useColors();
  const { isTablet, isDesktop, width } = useResponsive();
  const accent = color ?? colors.primary;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barW = isDesktop ? 32 : isTablet ? 28 : 22;
  const gap = isDesktop ? 16 : isTablet ? 12 : 10;
  const paddingH = isDesktop ? 20 : isTablet ? 16 : 10;
  const chartW = Math.max(data.length * (barW + gap) + paddingH * 2, 1);
  const chartH = isDesktop ? 220 : isTablet ? 190 : height;
  const labelH = 24;
  const topPad = 20;
  const drawH = chartH - labelH - topPad;
  const maxChartWidth = isDesktop ? width - 80 : isTablet ? width - 40 : width - 20;

  return (
    <View style={[chartStyles.card, { shadowColor: '#000000', backgroundColor: colors.card, maxWidth: maxChartWidth, alignSelf: 'center', width: '100%' }]}>
      <Text style={[chartStyles.title, { color: colors.text, fontSize: isDesktop ? 15 : 13 }]}>{title}</Text>
      <View style={{ overflow: 'hidden' }}>
        <Svg width={chartW} height={chartH} style={{ alignSelf: 'center' }}>
          {data.map((d, i) => {
            const bH = Math.max((d.value / maxVal) * drawH, 4);
            const x = paddingH + i * (barW + gap);
            const y = topPad + drawH - bH;
            return (
              <G key={d.label}>
                <Rect x={x} y={y} width={barW} height={bH} rx={6} fill={accent} opacity={0.85 + i * 0.02} />
                <SvgText
                  x={x + barW / 2}
                  y={chartH - 6}
                  textAnchor="middle"
                  fontSize={isDesktop ? 12 : 10}
                  fill={colors.textMuted}
                  fontWeight="500"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
      <View style={chartStyles.legendRow}>
        {data.map((d) => (
          <Text key={d.label} style={[chartStyles.legendVal, { color: colors.text, fontSize: isDesktop ? 12 : 10 }]}>
            {formatValue ? formatValue(d.value) : d.value}
          </Text>
        ))}
      </View>
    </View>
  );
}

interface LineChartProps {
  data: ChartData[];
  title: string;
  color?: string;
  formatValue?: (v: number) => string;
}

export function LineChart({ data, title, color, formatValue }: LineChartProps) {
  const colors = useColors();
  const { isTablet, isDesktop, width } = useResponsive();
  const accent = color ?? colors.success;
  const W = isDesktop ? Math.min(400, width - 80) : isTablet ? 340 : 280;
  const H = isDesktop ? 160 : isTablet ? 140 : 120;
  const padL = isDesktop ? 12 : 8;
  const padR = isDesktop ? 12 : 8;
  const padT = 16;
  const padB = 28;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const drawW = W - padL - padR;
  const drawH = H - padT - padB;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? padL + (i / (data.length - 1)) * drawW : padL + drawW / 2;
    const y = padT + drawH - (d.value / maxVal) * drawH;
    return { x, y, ...d };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={[chartStyles.card, { shadowColor: '#000000', backgroundColor: colors.card, maxWidth: width - 40, alignSelf: 'center', width: '100%' }]}>
      <Text style={[chartStyles.title, { color: colors.text, fontSize: isDesktop ? 15 : 13 }]}>{title}</Text>
      <View style={{ overflow: 'hidden' }}>
        <Svg width={W} height={H} style={{ alignSelf: 'center' }}>
          <Polyline
            points={polyPoints}
            fill="none"
            stroke={accent}
            strokeWidth={isDesktop ? 3 : 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <G key={p.label}>
              <Circle cx={p.x} cy={p.y} r={isDesktop ? 5 : 4} fill={accent} />
              <SvgText
                x={p.x}
                y={H - 8}
                textAnchor="middle"
                fontSize={isDesktop ? 12 : 10}
                fill={colors.textMuted}
                fontWeight="500"
              >
                {p.label}
              </SvgText>
            </G>
          ))}
        </Svg>
      </View>
    </View>
  );
}

interface PieChartProps {
  data: ChartData[];
  title: string;
  colors?: string[];
}

export function PieChart({ data, title, colors: pieColors }: PieChartProps) {
  const appColors = useColors();
  const { isTablet, isDesktop, width } = useResponsive();
  const fallbackColors = [appColors.primary, '#34d399', '#fbbf24', '#f87171', '#818cf8'];
  const palette = pieColors ?? fallbackColors;
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = isDesktop ? 160 : isTablet ? 140 : 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = isDesktop ? 64 : isTablet ? 56 : 48;

  function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const s = polarToCartesian(cx, cy, r, startDeg);
    const e = polarToCartesian(cx, cy, r, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
  }

  let current = 0;
  const slices = data.map((d, i) => {
    const startDeg = total > 0 ? (current / total) * 360 : 0;
    current += d.value;
    const endDeg = total > 0 ? (current / total) * 360 : 0;
    return { ...d, startDeg, endDeg, color: palette[i % palette.length] };
  });

  if (total === 0 || data.length === 0) {
    return (
      <View style={[chartStyles.card, { shadowColor: '#000000', backgroundColor: appColors.card, maxWidth: width - 40, alignSelf: 'center', width: '100%' }]}>
        <Text style={[chartStyles.title, { color: appColors.text, fontSize: isDesktop ? 15 : 13 }]}>{title}</Text>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: 'center', gap: isDesktop ? 24 : 16 }}>
          <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={r} fill={appColors.muted} opacity={0.2} />
          </Svg>
          <Text style={{ color: appColors.textMuted, fontSize: isDesktop ? 13 : 12 }}>No data available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[chartStyles.card, { shadowColor: '#000000', backgroundColor: appColors.card, maxWidth: width - 40, alignSelf: 'center', width: '100%' }]}>
      <Text style={[chartStyles.title, { color: appColors.text, fontSize: isDesktop ? 15 : 13 }]}>{title}</Text>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: 'center', gap: isDesktop ? 24 : 16 }}>
        <Svg width={size} height={size}>
          {slices.map((s, i) => (
            <Path key={i} d={slicePath(cx, cy, r, s.startDeg, s.endDeg)} fill={s.color} />
          ))}
          <Circle cx={cx} cy={cy} r={isDesktop ? 30 : isTablet ? 26 : 24} fill="#fff" />
        </Svg>
        <View style={{ gap: 8 }}>
          {slices.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: isDesktop ? 12 : 10, height: isDesktop ? 12 : 10, borderRadius: isDesktop ? 6 : 5, backgroundColor: s.color }} />
              <Text style={{ color: appColors.text, fontSize: isDesktop ? 13 : 12, fontFamily: 'Inter_500Medium' }}>
                {s.label}: {s.value}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  legendVal: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
});
