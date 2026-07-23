// ==================== 侧边栏拖动调整宽度 Composable ====================
// 职责：封装侧边栏拖动手柄的 mousedown/mousemove/mouseup 逻辑
// 用途：课程学习页左右两侧边栏均使用此 composable 实现拖动调整宽度
//
// 使用方式：
//   import { useResize } from "@/composables/useResize";
//   const { startResize } = useResize();
//   // 在模板中：<div @mousedown="startResize('left', $event)" id="resize-handle-left"></div>

/**
 * 侧边栏拖动调整宽度 Composable
 *
 * @returns {{ startResize: (side: 'left'|'right', e: MouseEvent) => void }}
 */
export function useResize() {
  /**
   * 当前是否正在拖动中
   * @var {boolean}
   */
  let active = false;

  /**
   * 拖动起始 X 坐标
   * @var {number}
   */
  let startX = 0;

  /**
   * 拖动起始时侧边栏的宽度(px)
   * @var {number}
   */
  let startWidth = 0;

  /**
   * 当前被拖动的侧边栏 DOM 元素
   * @var {HTMLElement|null}
   */
  let currentSidebar = null;

  /**
   * 当前被拖动的拖动手柄 DOM 元素
   * @var {HTMLElement|null}
   */
  let currentHandle = null;

  /**
   * 当前拖动的方向 ('left' | 'right')
   * @var {string}
   */
  let currentSide = 'left';

  // ---- mousedown 处理器 ------------------------------------------------
  function onMouseDown(side, e) {
    e.preventDefault();
    active = true;
    currentSide = side;

    // 确定目标和引用
    if (side === 'left') {
      currentSidebar = document.getElementById('left-sidebar');
      currentHandle = document.getElementById('resize-handle-left');
    } else {
      currentSidebar = document.getElementById('right-sidebar');
      currentHandle = document.getElementById('resize-handle-right');
    }
    if (!currentSidebar) { return; }

    startX = e.clientX;
    startWidth = currentSidebar.offsetWidth;

    // 视觉反馈：手柄高亮 + body 光标锁定
    if (currentHandle) { currentHandle.classList.add('active'); }
    document.body.classList.add('resizing');

    // 拖动时禁用 transition 以保证流畅
    if (currentSidebar) { currentSidebar.style.transition = 'none'; }

    console.log('[useResize] 开始拖动 ' + side + ' 侧边栏，初始宽度: ' + startWidth + 'px');
  }

  // ---- mousemove 处理器 ------------------------------------------------
  function onMouseMove(e) {
    if (!active || !currentSidebar) { return; }

    const dx = e.clientX - startX;
    let newWidth;

    // 计算新宽度
    if (currentSide === 'left') {
      // 向左拖动缩小，向右拖动增大
      newWidth = startWidth + dx;
    } else {
      // 拖动右侧手柄：向右拖动缩小右侧边栏，向左拖动增大
      newWidth = startWidth - dx;
    }

    // 限制范围：最小 192px (12rem)，最大 40vw
    const minWidth = 192;
    const maxWidth = window.innerWidth * 0.4;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    currentSidebar.style.width = newWidth + 'px';
  }

  // ---- mouseup 处理器 -------------------------------------------------
  function onMouseUp() {
    if (!active) { return; }

    active = false;

    // 还原视觉状态
    if (currentHandle) { currentHandle.classList.remove('active'); }
    document.body.classList.remove('resizing');

    // 恢复 transition
    if (currentSidebar) { currentSidebar.style.transition = ''; }

    const finalWidth = currentSidebar ? currentSidebar.offsetWidth : 0;
    console.log('[useResize] ' + currentSide + ' 侧边栏调整完成，最终宽度: ' + finalWidth + 'px');

    // 清理引用
    currentSidebar = null;
    currentHandle = null;
  }

  // ---- 绑定全局事件 ---------------------------------------------------
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  /**
   * 开始拖动调整宽度（由模板 mousedown 事件调用）
   *
   * @param {'left'|'right'} side - 拖动左侧还是右侧边栏
   * @param {MouseEvent} e - 鼠标事件对象
   */
  function startResize(side, e) {
    onMouseDown(side, e);
  }

  console.log('[useResize] 侧边栏拖动调整宽度已初始化');

  return { startResize };
}
