import type {
  Attribute,
  VideoAnnotationData,
  AudioAnnotationData,
  VideoFrameName,
  VideoSegmentName,
} from '@labelu/interface';
import { createContext, useContext } from 'react';

export type VideoAnnotationInUI = VideoAnnotationData & {
  visible?: boolean;
};

export type AudioAnnotationInUI = AudioAnnotationData & {
  visible?: boolean;
};

export type MediaAnnotationInUI = VideoAnnotationInUI | AudioAnnotationInUI;

export interface MediaAnnotationContextType {
  selectedAnnotation: MediaAnnotationInUI | undefined;
  selectAnnotation: (annotation: MediaAnnotationInUI) => void;
  duration: number;
  annotations: MediaAnnotationInUI[];
  showOrder: boolean;
  onChange?: (annotation: MediaAnnotationInUI) => void;
  onAnnotationChange: (annotation: MediaAnnotationInUI) => void;
  attributeConfigMapping: Record<VideoSegmentName | VideoFrameName, Record<string, Attribute>>;
  playingAnnotationIds: string[];
  setCurrentTime: (time: number) => void;
  getCurrentTime: () => number;
}

export const MediaAnnotationContext = createContext<MediaAnnotationContextType>({} as MediaAnnotationContextType);

export function useMediaAnnotator() {
  const contextValue = useContext(MediaAnnotationContext);

  if (Object.keys(contextValue).length === 0) {
    throw new Error('useMediaAnnotator must be used within a MediaAnnotatorProvider');
  }

  return contextValue;
}
