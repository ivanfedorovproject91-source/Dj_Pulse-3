import { describe, expect, it } from 'vitest';
import { daysBetween, flag, fmtNum, fmtPct, initials } from '../format';

describe('fmtPct', () => {
  it('отсутствие данных — прочерк, а не 0%', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(undefined)).toBe('—');
  });
  it('знаки и округление', () => {
    expect(fmtPct(12.4)).toBe('+12%');
    expect(fmtPct(-3.6)).toBe('−4%');
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(5.56, 1)).toBe('+5.6%');
  });
});

describe('fmtNum', () => {
  it('null → прочерк, большие числа сокращаются', () => {
    expect(fmtNum(null, 'ru')).toBe('—');
    expect(fmtNum(950, 'en')).toBe('950');
    expect(fmtNum(12500, 'en')).toMatch(/12\.5K/);
  });
});

describe('вспомогательные', () => {
  it('флаг по коду страны', () => {
    expect(flag('RU')).toBe('🇷🇺');
    expect(flag(null)).toBe('🌐');
    expect(flag('XYZ')).toBe('🌐');
  });
  it('инициалы', () => {
    expect(initials('Tale Of Us')).toBe('TO');
    expect(initials('Boris Brejcha')).toBe('BB');
  });
  it('разница дат в днях', () => {
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
    expect(daysBetween('2026-11-01', '2026-10-01')).toBe(-30 - 1);
  });
});
