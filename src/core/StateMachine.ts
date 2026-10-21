/** Ba "móc" của một trạng thái. Trạng thái nào không cần móc nào thì bỏ trống. */
export interface StateHandlers<S extends string> {
  /** Chạy MỘT lần khi bước vào trạng thái: đặt vận tốc, bật hiệu ứng, phát âm thanh... */
  enter?: (from: S | null) => void;
  /** Chạy MỖI frame khi đang ở trạng thái này: đọc input, quyết định có chuyển trạng thái không. */
  update?: (delta: number) => void;
  /** Chạy MỘT lần khi rời trạng thái: dọn dẹp những gì enter đã bật. */
  exit?: (to: S) => void;
}

/**
 * Máy trạng thái hữu hạn (Finite State Machine): tại mỗi thời điểm nhân vật ở ĐÚNG MỘT trạng thái.
 * Mỗi trạng thái tự lo logic của nó, thay vì một hàm update khổng lồ đầy if/else lồng nhau.
 * Thêm trạng thái mới (chém, đỡ đòn, bị đánh...) = thêm một mục, không phải sửa các mục cũ.
 */
export class StateMachine<S extends string> {
  private readonly states: Record<S, StateHandlers<S>>;
  private currentState: S;
  private elapsed = 0;

  constructor(states: Record<S, StateHandlers<S>>, initial: S) {
    this.states = states;
    this.currentState = initial;
    this.states[initial].enter?.(null);
  }

  get current(): S {
    return this.currentState;
  }

  /** Số ms đã ở trong trạng thái hiện tại: dùng cho mọi thứ có thời lượng (lướt, chém, choáng...). */
  get timeInState(): number {
    return this.elapsed;
  }

  /**
   * Chuyển sang trạng thái `next`. Đang ở sẵn trạng thái đó thì bỏ qua,
   * trừ khi `restart` = true: chạy lại exit + enter (vd. nhát chém tiếp theo trong combo).
   */
  transition(next: S, restart = false) {
    if (next === this.currentState && !restart) return;
    const prev = this.currentState;
    this.states[prev].exit?.(next);
    this.currentState = next;
    this.elapsed = 0;
    this.states[next].enter?.(prev);
  }

  update(delta: number) {
    this.elapsed += delta;
    this.states[this.currentState].update?.(delta);
  }
}
