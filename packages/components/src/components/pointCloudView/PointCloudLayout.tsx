import { getClassName } from '@/utils/dom';
import classNames from 'classnames';
import React from 'react';

// 2,3D 外框
export const PointCloudContainer: React.FC<{
  title?: string;
  toolbar?: React.ReactElement;
  className?: string;
  style?: React.CSSProperties;
}> = ({ title, toolbar, children, className, style }) => {
  return (
    <div className={classNames([className, getClassName('point-cloud-container')])} style={style}>
      {title ? (
        <div className={getClassName('point-cloud-container', 'header')}>
          <span className={getClassName('point-cloud-container', 'header-title')}>{title}</span>

          {toolbar && (
            <div className={getClassName('point-cloud-container', 'header-toolbar')}>{toolbar}</div>
          )}
        </div>
      ) : (
        ''
      )}
      {children}
    </div>
  );
};
