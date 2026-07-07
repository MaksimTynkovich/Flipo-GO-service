/**
 * Единая ease-out кривая: быстрый старт, монотонное замедление, v(1) = 0.
 * Без стыков фаз — иначе в конце ощущается «стоп и снова поехало».
 */
const EASE_OUT_POWER = 3.5;

export function easeSpinWithSoftLanding(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) ** EASE_OUT_POWER;
}
