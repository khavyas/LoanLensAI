import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

// Width of the main content column — the window minus the sidebar and the
// docked chat panel. Screens that switch between one and two columns should
// use this instead of the raw window width, otherwise opening the chat dock
// squeezes a "wide" two-column layout into a column that is no longer wide.
export const ContentWidthContext = createContext(null);

export function useContentWidth() {
  const { width } = useWindowDimensions();
  const contentWidth = useContext(ContentWidthContext);
  return contentWidth ?? width;
}
