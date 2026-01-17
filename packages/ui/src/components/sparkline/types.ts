// Common props shared between sparkline components
export interface BaseSparklineProps {
  height?: number;
  minDomain?: number;
  maxDomain?: number;
}

export interface SparklineProps extends BaseSparklineProps {
  data: number[];
  color?: string;
}

export interface DualSparklineProps extends BaseSparklineProps {
  data1: number[];
  data2: number[];
  color1?: string;
  color2?: string;
}
