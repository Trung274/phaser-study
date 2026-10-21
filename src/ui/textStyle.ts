/**
 * Phaser đo chiều cao chữ bằng một "chuỗi mẫu" (testString), mặc định '|MÉqgy'.
 * Chuỗi đó không có chữ mang HAI TẦNG DẤU của tiếng Việt (Ắ, Ể, Ướ...) => khung chữ thấp hơn thực tế
 * => phần dấu bị cắt cụt ("ĐIỀU KHIỂN" hiện thành "ĐIÊU KHIÊN").
 * Trộn style này vào mọi chữ tiếng Việt: { ...VI_TEXT, fontSize: '...', ... }
 */
export const VI_TEXT = { testString: '|MÉqgyẮẰẲẴẤẦẨẪỂỄẾỀỚỜỞỠỨỪỬỮ' };

/**
 * Font đậm cho chữ lớn (tên boss, "PHẢN ĐÒN!", số sát thương...).
 * Arial Black KHÔNG có chữ Việt như Ư, Ơ, Ắ => trình duyệt mượn chữ từ font khác, nét mảnh hơn hẳn, nhìn lệch.
 * Segoe UI Black (có sẵn trên Windows) có đủ chữ Việt; máy khác không có thì mới lùi về Arial Black.
 */
export const HEAVY_FONT = '"Segoe UI Black", "Arial Black", Arial, sans-serif';
