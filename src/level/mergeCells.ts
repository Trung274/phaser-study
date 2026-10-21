/** Hình chữ nhật tính theo ô: cột, hàng, rộng, cao. */
export interface CellRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

/**
 * Gộp các ô liền nhau thành hình chữ nhật lớn: kéo dài sang phải hết mức,
 * rồi (nếu cho phép) kéo xuống dưới khi cả hàng dưới cũng đặc đúng khoảng đó.
 * Hàm "thuần": không dùng Phaser, chỉ nhận dữ liệu và trả dữ liệu => dễ kiểm thử riêng.
 */
export function mergeCells(cells: boolean[][], mergeVertically: boolean): CellRect[] {
  const rows = cells.length;
  const cols = cells[0].length;
  const used = cells.map((row) => row.map(() => false));
  const free = (c: number, r: number) => cells[r][c] && !used[r][c];
  const rects: CellRect[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!free(c, r)) continue;

      let w = 1;
      while (c + w < cols && free(c + w, r)) w++;

      let h = 1;
      const rowFree = (rr: number) => Array.from({ length: w }, (_, i) => free(c + i, rr)).every(Boolean);
      while (mergeVertically && r + h < rows && rowFree(r + h)) h++;

      for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) used[rr][cc] = true;
      rects.push({ col: c, row: r, w, h });
    }
  }
  return rects;
}
