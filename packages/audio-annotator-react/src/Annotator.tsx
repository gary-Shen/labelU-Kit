import styled from 'styled-components';
import AudioAnnotator from '@labelu/audio-react';
import type { AudioAnnotatorProps } from '@labelu/audio-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type {
  TagAnnotationEntity,
  TextAnnotationEntity,
  VideoAnnotationType,
  Attribute,
  VideoSegmentName,
  VideoFrameName,
  VideoSegmentToolConfig,
  VideoFrameToolConfig,
  TextAttribute,
  EnumerableAttribute,
  AttributeValue,
} from '@labelu/interface';
import type { MediaAnnotatorRef } from '@labelu/components-react';

import type {
  AnnotatorContextType,
  VideoAnnotationInEditor,
  VideoEditorConfig,
  VideoSample,
  VideoWithGlobalAnnotation,
} from './context';
import { AnnotatorContext } from './context';
import Sidebar from './Sidebar';
import { AttributePanel } from './AttributePanel';
import { LabelSection } from './LabelSection';
import { AnnotatorToolbar } from './Toolbar';

function generateDefaultValues(attributes?: (TextAttribute | EnumerableAttribute)[]) {
  const values: AttributeValue = {};

  attributes?.forEach((item) => {
    const defaultValues = [];

    if ((item as TextAttribute).type === 'string') {
      const stringItem = item as TextAttribute;

      values[stringItem.value] = stringItem.defaultValue || '';
    }

    const tagItem = item as EnumerableAttribute;

    if (Array.isArray(tagItem.options)) {
      for (let i = 0; i < tagItem.options.length; i++) {
        if (tagItem.options[i].isDefault) {
          defaultValues.push(tagItem.options[i].value);
        }
      }
    }

    values[tagItem.value] = defaultValues;
  });

  return values;
}

const Wrapper = styled.div.attrs((props) => {
  return {
    ...props,
    className: 'labelu-audio-editor',
  };
})`
  display: flex;
  flex-direction: column;
  width: 100%;
  flex-grow: 1;
  background-color: #fff;

  .labelu-audio-wrapper {
    flex: 1;
  }
`;

const Content = styled.div`
  flex: 1;
  display: flex;
`;

export interface AudioAnnotatorRef {
  getAnnotations: () => VideoWithGlobalAnnotation[];
  getSample: () => VideoSample | undefined;
}

export interface AnnotatorProps {
  samples: VideoSample[];
  autoPlay?: boolean;
  config?: VideoEditorConfig;
  renderSidebar?: () => React.ReactNode;
  renderAttributes?: () => React.ReactNode;
  editingSample?: VideoSample;
  maxHistoryCount?: number;
  primaryColor?: string;
  toolbarExtra?: React.ReactNode;
  toolbarRight?: React.ReactNode;
}

function ForwardAnnotator(
  {
    samples: propsSamples,
    renderSidebar,
    config,
    renderAttributes,
    editingSample,
    maxHistoryCount = 20,
    primaryColor = '#007aff',
    toolbarExtra,
    toolbarRight,
  }: AnnotatorProps,
  ref: React.Ref<AudioAnnotatorRef>,
) {
  const [currentTool, setCurrentTool] = useState<VideoAnnotationType | undefined>('segment');
  const containerRef = useRef<HTMLDivElement>(null);
  const annotatorRef = useRef<MediaAnnotatorRef | null>(null);
  const samples = useMemo(() => propsSamples ?? [], [propsSamples]);
  const selectedIndexRef = useRef<number>(-1);
  const attributes = useMemo(() => {
    if (!currentTool) {
      return [];
    }

    return config?.[currentTool]?.attributes ?? [];
  }, [config, currentTool]);
  const playerRef = useRef<any | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<VideoAnnotationInEditor | undefined>();
  const [selectedAttribute, setSelectedAttribute] = useState<Attribute | undefined>(attributes[0]);

  const attributeMappingByTool = useMemo(() => {
    const mapping: Record<string, Record<string, Attribute>> = {};

    Object.keys(config ?? {}).forEach((key) => {
      const _attributes: Attribute[] = config?.[key as VideoSegmentName | VideoFrameName]?.attributes ?? [];
      mapping[key] = {};
      _attributes.reduce((acc, cur) => {
        acc[cur.value] = cur;
        return acc;
      }, mapping[key]);
    });

    return mapping;
  }, [config]);

  // ================== tool ==================
  const [orderVisible, setOrderVisible] = useState<boolean>(true);

  const onOrderVisibleChange = useCallback((value: boolean) => {
    setOrderVisible(value);
  }, []);

  const onToolChange = useCallback(
    (tool?: VideoAnnotationType) => {
      setCurrentTool(tool);
      setSelectedAnnotation(undefined);

      // 默认选中第一个标签
      if (tool) {
        const _attributes = config?.[tool]?.attributes ?? [];
        setSelectedAttribute(_attributes[0]);
      }
    },
    [config],
  );

  // ================== sample state ==================
  const [currentSample, setCurrentSample] = useState<VideoSample | undefined>(editingSample);
  // ================== redo undo ==================
  const pastRef = useRef<VideoSample[]>([]);
  const futureRef = useRef<VideoSample[]>([]);

  // 重置历史记录
  useEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
  }, [editingSample]);

  const updateCurrentSample = useCallback(
    (_newSample: React.SetStateAction<VideoSample | undefined>) => {
      setCurrentSample((pre) => {
        const newSample = typeof _newSample === 'function' ? _newSample(pre) : _newSample;

        if (pre) {
          pastRef.current = [...pastRef.current, pre].slice(-maxHistoryCount);
        }

        return newSample;
      });

      futureRef.current = [];
    },
    [maxHistoryCount],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) {
      return;
    }

    const newPresent = pastRef.current[pastRef.current.length - 1];
    const newPast = pastRef.current.slice(0, pastRef.current.length - 1);

    pastRef.current = newPast;
    setCurrentSample(newPresent);
    setSelectedAnnotation(undefined);
    setSelectedAttribute(undefined);
    if (currentSample) {
      futureRef.current = [currentSample, ...futureRef.current];
    }
  }, [currentSample]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) {
      return;
    }

    const newPresent = futureRef.current[0];
    const newFuture = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current!, currentSample!];

    setCurrentSample(newPresent);
    futureRef.current = newFuture;
  }, [currentSample]);

  // ================== sample ==================

  const handleSelectSample = useCallback((sample: VideoSample) => {
    setCurrentSample(sample);
    setSelectedAnnotation(undefined);
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  useEffect(() => {
    updateCurrentSample(editingSample || samples?.[0]);
  }, [editingSample, samples, updateCurrentSample]);

  // ================== annotation ==================
  const annotationsMapping = useMemo(() => {
    const mapping: Record<string, VideoAnnotationInEditor | TextAnnotationEntity | TagAnnotationEntity> = {};

    if (currentSample?.annotations) {
      currentSample?.annotations.reduce((acc, cur) => {
        acc[cur.id] = cur;
        return acc;
      }, mapping);
    }

    return mapping;
  }, [currentSample?.annotations]);

  const videoAnnotations = useMemo(() => {
    const _videoAnnotations = (currentSample?.annotations?.filter((item) => ['segment', 'frame'].includes(item.type)) ??
      []) as VideoAnnotationInEditor[];

    _videoAnnotations.sort((a, b) => a.order - b.order);

    return _videoAnnotations;
  }, [currentSample?.annotations]);

  const handleAnnotationsChange = useCallback(
    (_annotations: VideoWithGlobalAnnotation[]) => {
      console.info(JSON.stringify(_annotations, null, 2));
      updateCurrentSample((pre) => {
        return {
          ...pre!,
          annotations: _annotations,
        };
      });
    },
    [updateCurrentSample],
  );

  const handleAnnotationChange = useCallback(
    (_annotation: VideoAnnotationInEditor) => {
      updateCurrentSample((pre) => {
        const newAnnotations = pre!.annotations!.map((item) => {
          if (item.id === _annotation?.id) {
            return _annotation;
          }
          return item;
        });

        return {
          ...pre!,
          annotations: newAnnotations,
        };
      });
    },
    [updateCurrentSample],
  );

  const handleVideoAnnotationAdd = useCallback(
    (_annotation: VideoAnnotationInEditor) => {
      updateCurrentSample((pre) => {
        return {
          ...pre!,
          annotations: [...(pre?.annotations ?? []), _annotation],
        };
      });
      setSelectedAnnotation(_annotation);
    },
    [updateCurrentSample],
  );

  const handleRemoveAnnotation = useCallback(
    (_annotation: VideoAnnotationInEditor) => {
      updateCurrentSample((pre) => {
        return {
          ...pre!,
          annotations: pre!.annotations!.filter((i) => i.id !== _annotation.id),
        };
      });
      setSelectedAnnotation(undefined);
    },
    [updateCurrentSample],
  );

  const handleRemoveAnnotations = useCallback(
    (_annotations: VideoWithGlobalAnnotation[]) => {
      updateCurrentSample((pre) => {
        const removedMapping: Record<string, VideoWithGlobalAnnotation> = _annotations.reduce((acc, cur) => {
          acc[cur.id] = cur;
          return acc;
        }, {} as Record<string, VideoWithGlobalAnnotation>);
        return {
          ...pre!,
          annotations: pre!.annotations!.filter((i) => !removedMapping[i.id]),
        };
      });
      setSelectedAnnotation(undefined);
    },
    [updateCurrentSample],
  );

  const handleSelectAnnotation = useCallback(
    (annotation: VideoAnnotationInEditor) => {
      setSelectedAnnotation(annotation);
      setSelectedAttribute(attributeMappingByTool[annotation.type][annotation.label!]);
      setCurrentTool(annotation.type);
      selectedIndexRef.current = videoAnnotations.findIndex((item) => item.id === annotation.id);

      if (playerRef.current) {
        playerRef.current.setTime(annotation.type === 'frame' ? annotation.time : annotation.start);
      }

      if (annotatorRef) {
        annotatorRef.current?.scrollToAnnotation(annotation);
        annotatorRef.current?.updateTime(annotation.type === 'segment' ? annotation.start : annotation.time);
      }
    },
    [attributeMappingByTool, videoAnnotations],
  );

  const handleAnnotateEnd: AudioAnnotatorProps['onAnnotateEnd'] = useCallback(
    (_annotation: VideoAnnotationInEditor, e?: MouseEvent) => {
      // 生成attributes默认值
      const _attributes = attributeMappingByTool[_annotation.type][_annotation.label!]?.attributes ?? [];

      const defaultAttributes = generateDefaultValues(_attributes);

      setSelectedAnnotation({
        ..._annotation,
        attributes: defaultAttributes,
      });
      document.dispatchEvent(
        new CustomEvent('annotate-end', {
          detail: {
            annotation: _annotation,
            mouseEvent: e,
          },
        }),
      );
    },
    [attributeMappingByTool],
  );

  // ================== label ==================
  const onLabelChange = useCallback(
    (attribute: Attribute) => {
      setSelectedAttribute(attribute);
      let newAnnotation = JSON.parse(JSON.stringify(selectedAnnotation ?? {}));

      // 改变标签时，删除旧的attributes属性
      delete newAnnotation.attributes;

      newAnnotation = {
        ...newAnnotation,
        label: attribute.value,
      };

      updateCurrentSample((pre) => {
        const newAnnotations = pre!.annotations!.map((item) => {
          if (item.id === selectedAnnotation?.id) {
            return newAnnotation as VideoAnnotationInEditor;
          }
          return item;
        });

        return {
          ...pre!,
          annotations: newAnnotations,
        };
      });
      setSelectedAnnotation((pre) => {
        if (!pre) {
          return;
        }

        return {
          ...pre,
          label: attribute.value,
        };
      });
    },
    [selectedAnnotation, updateCurrentSample],
  );

  // ================== attribute ==================

  const handleAttributeChange = useCallback(
    (_attribute: any) => {
      let newAnnotation = JSON.parse(JSON.stringify(selectedAnnotation ?? {}));

      // 改变标签时，删除旧的attributes属性
      delete newAnnotation.attributes;

      newAnnotation = {
        ...newAnnotation,
        ..._attribute,
      };
      setSelectedAnnotation(() => newAnnotation);
      updateCurrentSample((pre) => {
        if (!(newAnnotation.id in annotationsMapping)) {
          return {
            ...pre!,
            annotations: [...(pre?.annotations ?? []), newAnnotation],
          };
        }

        const newAnnotations = pre!.annotations!.map((item) => {
          if (item.id === selectedAnnotation?.id) {
            return newAnnotation as VideoAnnotationInEditor;
          }
          return item;
        });

        return {
          ...pre!,
          annotations: newAnnotations,
        };
      });
    },
    [annotationsMapping, selectedAnnotation, updateCurrentSample],
  );

  // ================== 快捷键 ==================
  // 删除标记
  useHotkeys(
    'delete, backspace',
    () => {
      if (selectedAnnotation) {
        updateCurrentSample((pre) => {
          return {
            ...pre!,
            annotations: pre!.annotations!.filter((i) => i.id !== selectedAnnotation.id),
          };
        });
      }
    },
    {
      keyup: true,
      keydown: false,
    },
    [selectedAnnotation],
  );

  useHotkeys(
    'escape',
    () => {
      setSelectedAnnotation(undefined);
    },
    {
      preventDefault: true,
    },
    [setSelectedAnnotation],
  );

  // 上一个标记
  useHotkeys(
    'ArrowUp',
    () => {
      selectedIndexRef.current = Math.max(selectedIndexRef.current - 1, 0);
      setSelectedAnnotation((videoAnnotations as VideoAnnotationInEditor[])[selectedIndexRef.current]);
    },
    {
      keyup: true,
      keydown: false,
    },
    [videoAnnotations],
  );

  // 下一个标记
  useHotkeys(
    'ArrowDown',
    () => {
      selectedIndexRef.current = Math.min(selectedIndexRef.current + 1, videoAnnotations.length - 1);
      setSelectedAnnotation((videoAnnotations as VideoAnnotationInEditor[])[selectedIndexRef.current]);
    },
    {
      keyup: true,
      keydown: false,
    },
    [videoAnnotations],
  );

  // 1 ~ 9 设置标签
  useHotkeys(
    '1,2,3,4,5,6,7,8,9',
    (e) => {
      const index = Number(e.key) - 1;
      if (index < attributes.length) {
        onLabelChange(attributes[index]);

        // 这个newAnnotation不会更新到state中，只用于在标记结束后触发属性编辑框的显示
        const newAnnotation = {
          ...selectedAnnotation,
          label: attributes[index].value,
        };

        if (playerRef.current && newAnnotation) {
          document.dispatchEvent(
            new CustomEvent('annotate-end', {
              detail: {
                annotation: newAnnotation,
              },
            }),
          );
        }
      }
    },
    [onLabelChange, attributes, selectedAnnotation],
  );

  useImperativeHandle(ref, () => ({
    getAnnotations: () => {
      return currentSample?.annotations ?? [];
    },
    getSample: () => currentSample,
  }));

  const contextValue: AnnotatorContextType = useMemo(() => {
    return {
      containerRef,
      currentTool,
      samples,
      config,
      currentSample,
      videoAnnotations,
      orderVisible,
      handleSelectSample,
      selectedAttribute,
      onToolChange,
      attributes,
      selectedAnnotation,
      onAnnotationsRemove: handleRemoveAnnotations,
      onAnnotationRemove: handleRemoveAnnotation,
      onAnnotationsChange: handleAnnotationsChange,
      onAnnotationChange: handleAnnotationChange,
      onAttributeChange: handleAttributeChange,
      onAnnotationSelect: handleSelectAnnotation,
      onOrderVisibleChange,
      attributeMapping: attributeMappingByTool,
      annotationsMapping,
      onLabelChange,
      playerRef,
      undo,
      redo,
      pastRef,
      futureRef,
      getCurrentTime: () => playerRef.current?.getCurrentTime(),
      setCurrentTime: (time: number) => playerRef.current?.setTime(time),
      getDuration: () => playerRef.current?.getDuration(),
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
    };
  }, [
    containerRef,
    currentTool,
    samples,
    config,
    currentSample,
    videoAnnotations,
    orderVisible,
    handleSelectSample,
    selectedAttribute,
    onToolChange,
    attributes,
    selectedAnnotation,
    handleRemoveAnnotations,
    handleRemoveAnnotation,
    handleAnnotationsChange,
    handleAnnotationChange,
    handleAttributeChange,
    handleSelectAnnotation,
    onOrderVisibleChange,
    attributeMappingByTool,
    annotationsMapping,
    onLabelChange,
    undo,
    redo,
  ]);

  const attributeSide = useMemo(() => {
    return typeof renderAttributes === 'function' ? renderAttributes() : <AttributePanel />;
  }, [renderAttributes]);

  const toolConfig = useMemo(
    () => ({
      segment: config?.segment ?? ({} as VideoSegmentToolConfig),
      frame: config?.frame ?? ({} as VideoFrameToolConfig),
    }),
    [config?.frame, config?.segment],
  );

  const onMediaLoad = useCallback(() => {
    annotatorRef.current?.updateTime(0);
    playerRef.current?.setTime(0);
  }, []);

  return (
    <AnnotatorContext.Provider value={contextValue}>
      {/* @ts-ignore */}
      <Wrapper style={{ '--color-primary': primaryColor }}>
        <AnnotatorToolbar extra={toolbarExtra} right={toolbarRight} />
        <LabelSection />
        <Content>
          <Sidebar renderSidebar={renderSidebar} />
          {currentSample ? (
            <AudioAnnotator
              playerRef={playerRef}
              annotatorRef={annotatorRef}
              ref={containerRef}
              className="labelu-audio-wrapper"
              editingLabel={selectedAttribute?.value ?? 'noneAttribute'}
              src={currentSample.url}
              editingType={currentTool}
              selectedAnnotation={selectedAnnotation}
              annotations={videoAnnotations as unknown as VideoAnnotationInEditor[]}
              toolConfig={toolConfig}
              onChange={handleAnnotationChange}
              onAdd={handleVideoAnnotationAdd}
              showOrder={orderVisible}
              onLoad={onMediaLoad}
              onAnnotationSelect={handleSelectAnnotation}
              onAnnotateEnd={handleAnnotateEnd}
            />
          ) : (
            // TODO: empty
            <div>empty</div>
          )}
          {attributeSide}
        </Content>
      </Wrapper>
    </AnnotatorContext.Provider>
  );
}

export const Annotator = forwardRef<AudioAnnotatorRef, AnnotatorProps>(ForwardAnnotator);
