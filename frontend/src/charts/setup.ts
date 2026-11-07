import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, LineController,
  LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { GRID, INK, TICK } from './palette';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip);
Chart.defaults.font.family = "'Manrope', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = TICK;
Chart.defaults.borderColor = GRID;

export const tooltipStyle = {
  backgroundColor: '#0b0d0e',
  borderColor: '#2f353a',
  borderWidth: 1,
  titleColor: INK,
  bodyColor: INK,
  padding: 10,
  cornerRadius: 10,
  boxPadding: 4,
  usePointStyle: true,
} as const;
