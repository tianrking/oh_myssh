import { describe, it, expect } from 'vitest';
import { t, setLanguage, getLanguage, subscribeLanguageChange } from '../index';

describe('i18n 国际化模块测试', () => {
  it('应该能够成功在中英文字典之间切换并翻译相应键值', () => {
    setLanguage('zh-CN');
    expect(getLanguage()).toBe('zh-CN');
    expect(t('appName')).toBe('Oh My SSH');
    expect(t('quickConnect')).toBe('快速连接');

    setLanguage('en-US');
    expect(getLanguage()).toBe('en-US');
    expect(t('quickConnect')).toBe('Quick Connect');
    expect(t('welcomeTitle')).toBe('Oh My SSH Workspace Ready');
  });

  it('应该正常触发语言订阅通知回调', () => {
    let triggered = false;
    const unsubscribe = subscribeLanguageChange(() => {
      triggered = true;
    });

    setLanguage('zh-CN');
    expect(triggered).toBe(true);
    unsubscribe();
  });
});
