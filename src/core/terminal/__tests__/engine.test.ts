// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { TERMINAL_THEMES, TerminalEngine } from '../engine';

describe('TerminalEngine 调色盘与终端配置测试', () => {
  it('预设的主题调色盘必须包含完整的颜色键值映射', () => {
    const cyberpunk = TERMINAL_THEMES.cyberpunk!;
    expect(cyberpunk).toBeDefined();
    expect(cyberpunk.background).toBe('#090d16');
    expect(cyberpunk.foreground).toBe('#00f0ff');
    expect(cyberpunk.red).toBe('#ff0055');

    const oneDark = TERMINAL_THEMES.oneDark!;
    expect(oneDark).toBeDefined();
    expect(oneDark.background).toBe('#1e222a');

    const dracula = TERMINAL_THEMES.dracula!;
    expect(dracula.background).toBe('#282a36');
  });

  it('TerminalEngine 实例初始化后应正确设置默认字体与配置选项', () => {
    const engine = new TerminalEngine('dracula');
    expect(engine.terminal).toBeDefined();
    expect(engine.terminal.options.fontSize).toBe(14);
    expect(engine.terminal.options.cursorBlink).toBe(true);

    // 动态主题切换
    engine.setTheme('oneDark');
    expect(engine.terminal.options.theme?.background).toBe('#1e222a');
  });
});
