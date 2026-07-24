import { describe, it, expect } from 'vitest';
import { t, setLanguage, getLanguage, subscribeLanguageChange, i18nDict, LANGUAGE_LABELS } from '../index';

describe('i18n 国际化模块测试', () => {
  it('应该能够成功在三语言字典之间切换并翻译相应键值', () => {
    setLanguage('en-US');
    expect(getLanguage()).toBe('en-US');
    expect(t('appName')).toBe('Oh My SSH');
    expect(t('quickConnect')).toBe('Quick Connect');
    expect(t('welcomeTitle')).toBe('Oh My SSH Workspace Ready');

    setLanguage('zh-CN');
    expect(getLanguage()).toBe('zh-CN');
    expect(t('quickConnect')).toBe('快速连接');
    expect(t('welcomeTitle')).toBe('Oh My SSH 工作区已就绪');

    setLanguage('es-ES');
    expect(getLanguage()).toBe('es-ES');
    expect(t('quickConnect')).toBe('Conexión rápida');
    expect(t('welcomeTitle')).toBe('Oh My SSH — Espacio de trabajo listo');
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

  it('应该确保三种语言字典覆盖相同的键集合', () => {
    const enKeys = Object.keys(i18nDict['en-US']).sort();
    const zhKeys = Object.keys(i18nDict['zh-CN']).sort();
    const esKeys = Object.keys(i18nDict['es-ES']).sort();

    expect(enKeys).toEqual(zhKeys);
    expect(enKeys).toEqual(esKeys);
  });

  it('应该在 LANGUAGE_LABELS 中包含所有支持的语言', () => {
    expect(Object.keys(LANGUAGE_LABELS)).toContain('en-US');
    expect(Object.keys(LANGUAGE_LABELS)).toContain('zh-CN');
    expect(Object.keys(LANGUAGE_LABELS)).toContain('es-ES');
    expect(LANGUAGE_LABELS['es-ES']).toBe('Español');
  });

  it('应该对不存在的 key 回退到 en-US 或返回 key 本身', () => {
    setLanguage('es-ES');
    expect(t('nonExistentKey12345')).toBe('nonExistentKey12345');
  });
});
