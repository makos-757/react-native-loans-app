import { useWindowDimensions } from 'react-native';

type Breakpoints = {
  mobile: number;
  tablet: number;
  desktop: number;
};

const BP: Breakpoints = {
  mobile: 0,
  tablet: 640,
  desktop: 1024,
};

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isMobile = width < BP.tablet;
  const isTablet = width >= BP.tablet && width < BP.desktop;
  const isDesktop = width >= BP.desktop;

  const spacing = {
    xs: isMobile ? 8 : 12,
    sm: isMobile ? 12 : 16,
    md: isMobile ? 16 : 20,
    lg: isMobile ? 20 : 24,
    xl: isMobile ? 24 : 32,
  };

  const fontSize = {
    xs: isMobile ? 11 : 12,
    sm: isMobile ? 12 : 13,
    md: isMobile ? 14 : 15,
    lg: isMobile ? 16 : 18,
    xl: isMobile ? 18 : 22,
    xxl: isMobile ? 22 : 28,
  };

  const iconSize = {
    xs: isMobile ? 14 : 16,
    sm: isMobile ? 16 : 18,
    md: isMobile ? 18 : 22,
    lg: isMobile ? 22 : 26,
  };

  const cardPadding = isMobile ? 14 : isTablet ? 18 : 22;
  const columns = isDesktop ? 3 : isTablet ? 2 : 1;
  const maxContentWidth = isDesktop ? 1200 : isTablet ? 960 : '100%';
  const sidebarWidth = isDesktop ? 260 : isTablet ? 220 : 0;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    spacing,
    fontSize,
    iconSize,
    cardPadding,
    columns,
    maxContentWidth,
    sidebarWidth,
  };
}

