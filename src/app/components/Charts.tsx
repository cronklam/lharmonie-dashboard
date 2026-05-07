'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController,
  ArcElement,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController,
  ArcElement,
);

const PALETTE = ['#B8956F', '#8B6340', '#3B6D11', '#C0392B', '#5B4A3F', '#D4B896'];

export function BarChart({
  labels,
  values,
  highlightIdx,
  height = 200,
}: {
  labels: string[];
  values: number[];
  highlightIdx?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const ctx = ref.current.getContext('2d');
    if (!ctx) return;
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Gasto',
            data: values,
            backgroundColor: values.map((_, i) =>
              i === highlightIdx ? '#B8956F' : 'rgba(184,149,111,0.40)',
            ),
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) =>
                Number(v) > 0 ? '$' + (Number(v) / 1000).toFixed(0) + 'k' : '$0',
              font: { size: 10 },
            },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values, highlightIdx]);

  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}

export function DoughnutChart({
  labels,
  values,
  height = 220,
}: {
  labels: string[];
  values: number[];
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const ctx = ref.current.getContext('2d');
    if (!ctx) return;
    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: PALETTE,
            borderColor: '#FDFBF8',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 10 }, padding: 12, boxWidth: 10 },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values]);

  return (
    <div style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}
