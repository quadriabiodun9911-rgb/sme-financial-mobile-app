import React from 'react';
import { View, ViewStyle } from 'react-native';

type SpaceSize = 2 | 4 | 6 | 8 | 12 | 16 | 20 | 24 | 32;
const sizeMap: Record<SpaceSize, number> = {
  2: 2, 4: 4, 6: 6, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32,
};

interface SpacerProps {
  height?: SpaceSize;
  width?: SpaceSize;
  flex?: number;
  style?: ViewStyle;
}

export const Spacer = ({ height = 8, width, flex, style }: SpacerProps) => (
  <View
    style={[
      width !== undefined && { width: sizeMap[width] },
      height !== undefined && { height: sizeMap[height] },
      flex !== undefined && { flex },
      style,
    ]}
  />
);

Spacer.displayName = 'Spacer';

interface PaddedViewProps {
  children: React.ReactNode;
  padding?: SpaceSize;
  paddingH?: SpaceSize;
  paddingV?: SpaceSize;
  paddingT?: SpaceSize;
  paddingB?: SpaceSize;
  paddingL?: SpaceSize;
  paddingR?: SpaceSize;
  style?: ViewStyle;
}

export const PaddedView = ({
  children,
  padding,
  paddingH,
  paddingV,
  paddingT,
  paddingB,
  paddingL,
  paddingR,
  style,
}: PaddedViewProps) => {
  const p = padding !== undefined ? sizeMap[padding] : undefined;
  const pH = paddingH !== undefined ? sizeMap[paddingH] : p;
  const pV = paddingV !== undefined ? sizeMap[paddingV] : p;

  return (
    <View
      style={[
        {
          paddingHorizontal: pH,
          paddingVertical: pV,
          paddingTop: paddingT !== undefined ? sizeMap[paddingT] : undefined,
          paddingBottom: paddingB !== undefined ? sizeMap[paddingB] : undefined,
          paddingLeft: paddingL !== undefined ? sizeMap[paddingL] : undefined,
          paddingRight: paddingR !== undefined ? sizeMap[paddingR] : undefined,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

PaddedView.displayName = 'PaddedView';

interface RowProps {
  children: React.ReactNode;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  gap?: SpaceSize;
  style?: ViewStyle;
}

export const Row = ({
  children,
  alignItems = 'center',
  justifyContent = 'flex-start',
  gap = 8,
  style,
}: RowProps) => (
  <View
    style={[
      {
        flexDirection: 'row',
        alignItems,
        justifyContent,
        gap: sizeMap[gap],
      },
      style,
    ]}
  >
    {children}
  </View>
);

Row.displayName = 'Row';

interface ColumnProps {
  children: React.ReactNode;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  gap?: SpaceSize;
  style?: ViewStyle;
}

export const Column = ({
  children,
  alignItems = 'flex-start',
  justifyContent = 'flex-start',
  gap = 8,
  style,
}: ColumnProps) => (
  <View
    style={[
      {
        flexDirection: 'column',
        alignItems,
        justifyContent,
        gap: sizeMap[gap],
      },
      style,
    ]}
  >
    {children}
  </View>
);

Column.displayName = 'Column';
