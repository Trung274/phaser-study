import { SCRIBBLE_THEME } from './scribble';
import { PIXEL_THEME } from './pixel';
import type { Theme, ThemeId } from './types';

export type { Theme, ThemeId } from './types';

/** Các chế độ chơi, theo thứ tự hiện trên màn hình chọn. */
export const THEME_LIST: Theme[] = [SCRIBBLE_THEME, PIXEL_THEME];

/** Tìm theme theo id; id lạ hoặc không có thì dùng chế độ gốc. */
export function getTheme(id: ThemeId | undefined): Theme {
  return THEME_LIST.find((theme) => theme.id === id) ?? SCRIBBLE_THEME;
}
