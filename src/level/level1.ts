// Màn chơi vẽ bằng lưới ký tự: mỗi ký tự là một ô 128×128.
// Sửa địa hình = sửa chữ ở đây. Bảng ký hiệu nằm trong buildLevel.ts:
//
//   .  trống          #  đất (mặt trên tự đổi hình)    B  gạch     C  thùng gỗ
//   =  cầu một chiều (nhảy xuyên từ dưới lên, ↓ + nhảy để rơi xuống)
//   b  bụi cây   f  hàng rào   T  cây thông   F  cờ   (trang trí, không va chạm)
//   P  vị trí xuất phát của người chơi    D  hình nộm luyện chém    E  lính giáo
//   X  boss (Hắc Tướng)
//
// Nhảy cao tối đa ~2.45 ô => bậc cao 2 ô leo được, 3 ô thì không.

export const LEVEL_1 = [
  '.........................................................B',
  '.........................................................B',
  '.........................................................B',
  '.........................................................B',
  '.....................................EF..................B',
  '................B====..............B####.................B',
  '............TD..B.....===.........CB####.................B',
  '.P.fb.D.C.#####.B..D....Eb....ET.CCB####............X....B',
  '###########################..############################B',
  '###########################..############################B',
];

/**
 * Đấu trường boss: cột 40 → hết màn (vách đá cao 3 ô bên trái: nhảy xuống rồi là không leo ngược lên được).
 * Đi quá cột triggerCol thì trận đấu bắt đầu, camera khoá vào đấu trường.
 * Chết trong trận boss thì hồi sinh ở checkpointCol (ngay cửa đấu trường) thay vì từ đầu màn.
 */
export const LEVEL_1_ARENA = { leftCol: 40, rightCol: 58, triggerCol: 44, checkpointCol: 41 };
