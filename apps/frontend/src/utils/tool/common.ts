import { isObject } from 'lodash-es';
import type { ReactNode } from 'react';

export function checkNumber(v: string) {
  const reg = /^[1-9]\d*$/g;
  if (reg.test(v)) {
    return true;
  }
  return false;
}

export function getCreateProjectCmt(showBase: boolean, Base: ReactNode, Step: ReactNode) {
  return showBase ? Base : Step;
}

export const jsonParser = (content: any, defaultValue: any = {}) => {
  try {
    if (typeof content === 'string') {
      return JSON.parse(content);
    } else {
      return isObject(content) ? content : defaultValue;
    }
  } catch (e) {
    return defaultValue;
  }
};

/**
 * 复制文本
 * @param text
 * @param element
 */
export const copyText = (text: string, element: 'input' | 'textarea' = 'input') => {
  const copyInput = document.createElement(element);
  copyInput.setAttribute(
    'style',
    `
      display: 'none'
    `,
  );

  document.body.appendChild(copyInput);

  copyInput.value = text;
  copyInput.select();

  document.execCommand('copy');
  document.body.removeChild(copyInput);
};
