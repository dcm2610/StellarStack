"use client";

import { Area, AreaChart, Line, LineChart, ResponsiveContainer, ComposedChart, YAxis } from "recharts";
import { useId } from "react";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  minDomain?: number;
  maxDomain?: number;
}

export const Sparkline = ({ data, color = "#22c55e", height = 32, minDomain = 0, maxDomain = 100 }: SparklineProps) => {
  const uniqueId = useId();
  // Add baseline point at start to ensure chart anchors at 0
  const chartData = data.map((value, index) => ({ value, index }));

  // Create gradient colors based on the main color
  const gradientId = `sparkline-gradient-${uniqueId}`;
  const patternId = `sparkline-dots-${uniqueId}`;
  const dotColor = "rgba(255, 255, 255, 0.15)";

  return (
    <div style={{ height }} className="w-full relative">
      {/* Dotted background pattern */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <defs>
          <pattern id={patternId} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill={dotColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div className="relative" style={{ height, zIndex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[minDomain, maxDomain]} hide type="number" />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              baseValue={minDomain}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface DualSparklineProps {
  data1: number[];
  data2: number[];
  color1?: string;
  color2?: string;
  height?: number;
  minDomain?: number;
  maxDomain?: number;
}

export const DualSparkline = ({
  data1,
  data2,
  color1 = "#3b82f6",
  color2 = "#a855f7",
  height = 32,
  minDomain = 0,
  maxDomain = 100
}: DualSparklineProps) => {
  const uniqueId = useId();
  const chartData = data1.map((value, index) => ({
    value1: value,
    value2: data2[index] || 0,
    index
  }));

  const gradientId1 = `dual-sparkline-gradient-1-${uniqueId}`;
  const gradientId2 = `dual-sparkline-gradient-2-${uniqueId}`;
  const patternId = `dual-sparkline-dots-${uniqueId}`;
  const dotColor = "rgba(255, 255, 255, 0.15)";

  return (
    <div style={{ height }} className="w-full relative">
      {/* Dotted background pattern */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <defs>
          <pattern id={patternId} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill={dotColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div className="relative" style={{ height, zIndex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id={gradientId1} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color1} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color1} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={gradientId2} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color2} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color2} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[minDomain, maxDomain]} hide type="number" />
            <Area
              type="monotone"
              dataKey="value1"
              stroke={color1}
              strokeWidth={1.5}
              fill={`url(#${gradientId1})`}
              isAnimationActive={false}
              baseValue={minDomain}
            />
            <Area
              type="monotone"
              dataKey="value2"
              stroke={color2}
              strokeWidth={1.5}
              fill={`url(#${gradientId2})`}
              isAnimationActive={false}
              baseValue={minDomain}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
