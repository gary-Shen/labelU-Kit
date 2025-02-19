const defaultColors = [
  '#fc5b50',
  '#FC7A42',
  '#FFB300',
  '#3BC141',
  '#50AAF2',
  '#506AFF',
  '#8D64FF',
  '#D55EEA',
  '#F974A4',
  '#DE8B3E',
  '#FF5C97',
  '#FFCC4A',
  '#F1F462',
  '#ABFF7E',
  '#52CEDD',
  '#5AB4DB',
  '#99D5F0',
  '#958FEC',
  '#AD6DDB',
  '#B77259',
];

/**
 * 标注框的颜色色板
 * 一个Sample中的标注框颜色都从此色板中获取
 * 也可自定义颜色集合
 */
export default class ColorPalette {
  private _cursor: number = 0;

  public colors: string[] = defaultColors;

  constructor(colors?: string[]) {
    if (colors) {
      this.colors = colors;
    }
  }

  /**
   * 拾取颜色，指针往下移动
   */
  public pick() {
    const { _cursor, colors } = this;
    const nextCursor = _cursor > colors.length - 2 ? 0 : _cursor + 1;
    this._cursor = nextCursor;

    return colors[_cursor];
  }

  /**
   * 重置指针
   */
  public reset() {
    this._cursor = 0;
  }

  /**
   * 获取指针指向
   */
  public getCursor() {
    return this._cursor;
  }

  /**
   * 获取颜色集合
   * @returns colors
   */
  public getColors() {
    return this.colors;
  }
}
