export const appName = "M Tech QMS";
export const appBackground = "#f7f8fb";
export const appTheme = "#6556d8";
export const iconSizes = [180, 192, 512] as const;

// CSS viewport, device-pixel ratio. Other devices still get the in-app launch screen.
export const startupScreens = [
  { width: 375, height: 667, ratio: 2 },
  { width: 375, height: 812, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 896, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 440, height: 956, ratio: 3 },
  { width: 768, height: 1024, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
] as const;

export const startupSize = (screen: typeof startupScreens[number]) =>
  `${screen.width * screen.ratio}x${screen.height * screen.ratio}`;
